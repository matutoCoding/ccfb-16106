import type { AtlasMetrics } from '../types';
import type { SolidMesh, TextVertexGroup } from './geometry';

const TEXT_WGSL = /* wgsl */`
struct Uniforms {
  vp: mat4x4<f32>,
  params: vec4<f32>,
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var atlasTex: texture_2d<f32>;
@group(0) @binding(2) var atlasSamp: sampler;

struct VertexIn {
  @location(0) position: vec3<f32>,
  @location(1) uv: vec2<f32>,
  @location(2) color: vec4<f32>,
};
struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec4<f32>,
};

@vertex
fn vs(input: VertexIn) -> VertexOut {
  var out: VertexOut;
  out.position = u.vp * vec4<f32>(input.position, 1.0);
  out.uv = input.uv;
  out.color = input.color;
  return out;
}

fn median3(r: f32, g: f32, b: f32) -> f32 {
  return max(min(r, g), min(max(r, g), b));
}

@fragment
fn fs(input: VertexOut) -> @location(0) vec4<f32> {
  var uv = input.uv;
  uv.y = 1.0 - uv.y;
  let c = textureSample(atlasTex, atlasSamp, uv);
  let sd = median3(c.r, c.g, c.b) - 0.5;
  let w = max(fwidth(sd), 0.00018);
  // 屏幕像素宽度自适应：放大时 w 很小，边缘锐利；缩小时过渡带自然变宽，远小字呈灰块。
  var alpha = clamp(sd / w + 0.5, 0.0, 1.0);
  let minification = smoothstep(0.22, 0.85, w);
  alpha = alpha * (1.0 - minification * 0.18);
  if (alpha < 0.01) { discard; }
  return vec4<f32>(input.color.rgb, input.color.a * alpha);
}
`;

const SOLID_WGSL = /* wgsl */`
struct Uniforms { vp: mat4x4<f32>, params: vec4<f32> };
@group(0) @binding(0) var<uniform> u: Uniforms;
struct VertexIn {
  @location(0) position: vec3<f32>,
  @location(1) color: vec4<f32>,
};
struct VertexOut {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec4<f32>,
};
@vertex
fn vs(input: VertexIn) -> VertexOut {
  var out: VertexOut;
  out.position = u.vp * vec4<f32>(input.position, 1.0);
  out.color = input.color;
  return out;
}
@fragment
fn fs(input: VertexOut) -> @location(0) vec4<f32> {
  return input.color;
}
`;

interface CachedAtlas { version: number; texture: GPUTexture; view: GPUTextureView }

export class WebGpuStage {
  device!: GPUDevice;
  context!: GPUCanvasContext;
  format: GPUTextureFormat = navigator.gpu?.getPreferredCanvasFormat?.() || 'bgra8unorm';
  private uniformBuffer!: GPUBuffer;
  private textPipeline!: GPURenderPipeline;
  private solidPipeline!: GPURenderPipeline;
  private bindGroupLayout!: GPUBindGroupLayout;
  private sampler!: GPUSampler;
  private defaultView!: GPUTextureView;
  private atlasCache = new Map<string, CachedAtlas>();
  private depthTexture?: GPUTexture;
  private depthSize: [number, number] = [0, 0];

  static async create(canvas: HTMLCanvasElement): Promise<WebGpuStage> {
    if (!navigator.gpu) throw new Error('当前浏览器不支持 WebGPU');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('WebGPU adapter 不可用');
    const device = await adapter.requestDevice();
    const stage = new WebGpuStage();
    stage.device = device;
    const ctx = canvas.getContext('webgpu');
    if (!ctx) throw new Error('无法取得 webgpu canvas context');
    stage.context = ctx;
    stage.format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format: stage.format, alphaMode: 'premultiplied' });
    stage.initResources();
    return stage;
  }

  private initResources() {
    const device = this.device;
    this.bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } }
      ]
    });
    const layout = device.createPipelineLayout({ bindGroupLayouts: [this.bindGroupLayout] });
    const textModule = device.createShaderModule({ code: TEXT_WGSL });
    const solidModule = device.createShaderModule({ code: SOLID_WGSL });
    this.textPipeline = device.createRenderPipeline({
      layout,
      vertex: {
        module: textModule,
        entryPoint: 'vs',
        buffers: [{
          arrayStride: 9 * 4,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x2' },
            { shaderLocation: 2, offset: 20, format: 'float32x4' }
          ]
        }]
      },
      fragment: { module: textModule, entryPoint: 'fs', targets: [{ format: this.format, blend: {
        color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
      } }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: false, depthCompare: 'less-equal' }
    });
    this.solidPipeline = device.createRenderPipeline({
      layout,
      vertex: {
        module: solidModule,
        entryPoint: 'vs',
        buffers: [{
          arrayStride: 7 * 4,
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' },
            { shaderLocation: 1, offset: 12, format: 'float32x4' }
          ]
        }]
      },
      fragment: { module: solidModule, entryPoint: 'fs', targets: [{ format: this.format, blend: {
        color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
        alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }
      } }] },
      primitive: { topology: 'triangle-list', cullMode: 'none' },
      depthStencil: { format: 'depth24plus', depthWriteEnabled: true, depthCompare: 'less-equal' }
    });
    this.uniformBuffer = device.createBuffer({ size: 80, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear', mipmapFilter: 'linear' });
    const tex = device.createTexture({ size: [1, 1], format: 'rgba8unorm', usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST });
    device.queue.writeTexture({ texture: tex }, new Uint8Array([255, 255, 255, 255]), { bytesPerRow: 4 }, { width: 1, height: 1 });
    this.defaultView = tex.createView();
  }

  resize(canvas: HTMLCanvasElement): [number, number] {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    if (!this.depthTexture || this.depthSize[0] !== w || this.depthSize[1] !== h) {
      this.depthTexture?.destroy();
      this.depthTexture = this.device.createTexture({ size: [w, h], format: 'depth24plus', usage: GPUTextureUsage.RENDER_ATTACHMENT });
      this.depthSize = [w, h];
    }
    return [w, h];
  }

  private atlasView(group: TextVertexGroup): GPUTextureView {
    const key = `${group.fontId}:${group.atlas.textureVersion}`;
    const cached = this.atlasCache.get(key);
    if (cached) return cached.view;
    const old = this.atlasCache.get(group.fontId);
    old?.texture.destroy();
    const texture = this.device.createTexture({
      size: [group.atlas.widthPx, group.atlas.heightPx],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
    });
    this.device.queue.writeTexture(
      { texture },
      group.pixels as BufferSource,
      { bytesPerRow: group.atlas.widthPx * 4, rowsPerImage: group.atlas.heightPx },
      { width: group.atlas.widthPx, height: group.atlas.heightPx }
    );
    const view = texture.createView();
    this.atlasCache.set(group.fontId, { version: group.atlas.textureVersion, texture, view });
    this.atlasCache.set(key, { version: group.atlas.textureVersion, texture, view });
    return view;
  }

  render(options: {
    canvas: HTMLCanvasElement;
    vp: Float32Array;
    textGroups?: TextVertexGroup[];
    solid?: SolidMesh | null;
    clear?: [number, number, number, number];
    params?: [number, number, number, number];
  }) {
    const [w, h] = this.resize(options.canvas);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, options.vp as BufferSource);
    const params = options.params || [7, 64, w, h];
    this.device.queue.writeBuffer(this.uniformBuffer, 64, new Float32Array(params));
    const encoder = this.device.createCommandEncoder();
    const view = this.context.getCurrentTexture().createView();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view,
        clearValue: options.clear ? { r: options.clear[0], g: options.clear[1], b: options.clear[2], a: options.clear[3] } : { r: 0.93, g: 0.92, b: 0.89, a: 1 },
        loadOp: 'clear', storeOp: 'store'
      }],
      depthStencilAttachment: { view: this.depthTexture!.createView(), depthClearValue: 1, depthLoadOp: 'clear', depthStoreOp: 'store' }
    });

    // Solid geometry
    if (options.solid && options.solid.vertices.length) {
      const vbo = this.device.createBuffer({ size: options.solid.vertices.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
      this.device.queue.writeBuffer(vbo, 0, options.solid.vertices as BufferSource);
      const ibo = this.device.createBuffer({ size: options.solid.indices.byteLength, usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST });
      this.device.queue.writeBuffer(ibo, 0, options.solid.indices as BufferSource);
      const bg = this.device.createBindGroup({ layout: this.bindGroupLayout, entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: this.defaultView },
        { binding: 2, resource: this.sampler }
      ] });
      pass.setPipeline(this.solidPipeline);
      pass.setBindGroup(0, bg);
      pass.setVertexBuffer(0, vbo);
      pass.setIndexBuffer(ibo, options.solid.indices instanceof Uint32Array ? 'uint32' : 'uint16');
      pass.drawIndexed(options.solid.indices.length);
    }

    for (const group of options.textGroups || []) {
      if (!group.vertices.length) continue;
      const vbo = this.device.createBuffer({ size: group.vertices.byteLength, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
      this.device.queue.writeBuffer(vbo, 0, group.vertices as BufferSource);
      const atlasView = this.atlasView(group);
      const bg = this.device.createBindGroup({ layout: this.bindGroupLayout, entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: atlasView },
        { binding: 2, resource: this.sampler }
      ] });
      pass.setPipeline(this.textPipeline);
      pass.setBindGroup(0, bg);
      pass.setVertexBuffer(0, vbo);
      pass.draw(group.vertices.length / 9);
    }
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }
}

export async function isWebGpuAvailable(): Promise<boolean> {
  try {
    if (!navigator.gpu) return false;
    const a = await navigator.gpu.requestAdapter();
    return !!a;
  } catch { return false; }
}

export type { AtlasMetrics };
