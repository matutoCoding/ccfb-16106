export type Child = Node | string | number | false | null | undefined | any[];
const SVG_NS = 'http://www.w3.org/2000/svg';

export function s<T extends keyof SVGElementTagNameMap>(
  tag: T,
  props: Record<string, any> = {},
  ...children: Child[]
): SVGElementTagNameMap[T] {
  const el = document.createElementNS(SVG_NS, tag) as SVGElementTagNameMap[T];
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.setAttribute('class', String(value));
    else if (key === 'text') el.textContent = String(value);
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else {
      el.setAttribute(key, String(value));
    }
  }
  for (const child of children.flat(Infinity) as Child[]) {
    if (child === false || child === null || child === undefined) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el as any;
}

export function h<T extends keyof HTMLElementTagNameMap>(
  tag: T,
  props: Record<string, any> = {},
  ...children: Child[]
): HTMLElementTagNameMap[T] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class' || key === 'className') el.className = String(value);
    else if (key === 'html') el.innerHTML = String(value);
    else if (key === 'text') el.textContent = String(value);
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    } else if (key.startsWith('data-')) {
      el.setAttribute(key, String(value));
    } else if (key === 'value' && el instanceof HTMLInputElement) {
      el.value = String(value);
    } else if (key === 'checked' && el instanceof HTMLInputElement) {
      el.checked = !!value;
    } else {
      el.setAttribute(key, String(value));
    }
  }
  for (const child of children.flat(Infinity) as Child[]) {
    if (child === false || child === null || child === undefined) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

export function clear(el: HTMLElement) {
  el.replaceChildren();
}

export function mountPage(container: HTMLElement, node: Node) {
  container.replaceChildren(node);
}

export function statusPill(status: 'pass' | 'warning' | 'fail') {
  const labels = { pass: '合格', warning: '注意', fail: '不合格' };
  return h('span', { class: `pill pill-${status}`, 'data-testid': `status-${status}` }, labels[status]);
}

export function toast(message: string, type: '' | 'good' | 'bad' = '') {
  let wrap = document.querySelector<HTMLDivElement>('.toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  const item = h('div', { class: `toast ${type}` }, message);
  wrap.appendChild(item);
  setTimeout(() => { item.style.opacity = '0'; item.style.transform = 'translateY(8px)'; }, 3200);
  setTimeout(() => item.remove(), 3800);
}
