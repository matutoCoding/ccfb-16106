import type { AppData, Board, FontAsset, ID, ImageAsset, Project } from '../types';

const DB_NAME = 'museum-signage-webgpu';
const DB_VERSION = 1;
const STORES = ['kv', 'projects', 'boards', 'fonts', 'images'] as const;

let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          const store = db.createObjectStore(name, name === 'kv' ? { keyPath: 'key' } : { keyPath: 'id' });
          if (name === 'boards') store.createIndex('projectId', 'projectId', { unique: false });
          if (name === 'images') store.createIndex('projectId', 'projectId', { unique: false });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(store: string, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then((db) => new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(store, mode);
    const request = run(transaction.objectStore(store));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }));
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const row = await tx<{ key: string; value: T } | undefined>('kv', 'readonly', (s) => s.get(key) as IDBRequest<any>);
  return row?.value;
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  await tx('kv', 'readwrite', (s) => s.put({ key, value }));
}

export async function idbPut<T extends { id: ID }>(storeName: string, value: T): Promise<ID> {
  return tx<ID>(storeName, 'readwrite', (s) => s.put(value) as IDBRequest<ID>);
}

export async function idbGet<T>(storeName: string, id: ID): Promise<T | undefined> {
  return tx<T | undefined>(storeName, 'readonly', (s) => s.get(id) as IDBRequest<T | undefined>);
}

export async function idbAll<T>(storeName: string): Promise<T[]> {
  return tx<T[]>(storeName, 'readonly', (s) => s.getAll() as IDBRequest<T[]>);
}

export async function idbDelete(storeName: string, id: ID): Promise<void> {
  await tx(storeName, 'readwrite', (s) => s.delete(id) as IDBRequest<undefined>);
}

export async function saveAllData(data: AppData): Promise<void> {
  await kvSet('app-data', {
    project: data.project,
    halls: data.halls,
    walls: data.walls,
    cases: data.cases,
    route: data.route,
    lights: data.lights
  } satisfies Partial<AppData>);
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(['boards', 'images', 'projects'], 'readwrite');
    t.objectStore('projects').put(data.project satisfies Project);
    const bs = t.objectStore('boards');
    data.boards.forEach((b) => bs.put(b satisfies Board));
    const is = t.objectStore('images');
    data.images.forEach((im) => is.put(im satisfies ImageAsset));
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

export async function loadData(): Promise<AppData | null> {
  const core = await kvGet<Partial<AppData>>('app-data');
  if (!core?.project) return null;
  const [boards, images, fonts] = await Promise.all([
    idbAll<Board>('boards'),
    idbAll<ImageAsset>('images'),
    idbAll<FontAsset>('fonts')
  ]);
  if (!boards.length) return null;
  return {
    project: core.project,
    halls: core.halls || [],
    walls: core.walls || [],
    cases: core.cases || [],
    route: core.route || [],
    lights: core.lights || [],
    boards,
    images,
    fonts
  };
}

export async function saveFont(font: FontAsset): Promise<void> {
  await idbPut<FontAsset>('fonts', font);
}

export async function loadFonts(): Promise<FontAsset[]> {
  return idbAll<FontAsset>('fonts');
}
