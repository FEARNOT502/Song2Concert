// ─────────────────────────────────────────────────────────────────────────────
// HDR output (A3). A WebGL canvas cannot show more than SDR white; a WebGPU
// canvas configured { format: 'rgba16float', toneMapping: { mode: 'extended' } }
// can, on an HDR display. The scene stays in WebGL: its final grade writes
// the HDR picture as 16 bits per channel, split over the two halves of a
// double-width canvas (high bytes left, low right, perceptually encoded:
// 8-bit WebGL canvases copy across exactly, float ones do not). Each frame
// that canvas is copied into a WebGPU texture, put back together and shown,
// linear, 1.0 being SDR white, up to the display's headroom.
// ─────────────────────────────────────────────────────────────────────────────

const WGSL = /* wgsl */`
  @group(0) @binding(0) var src: texture_2d<f32>;
  struct VO { @builtin(position) pos: vec4f };
  @vertex fn vs(@builtin(vertex_index) i: u32) -> VO {
    var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
    var o: VO; o.pos = vec4f(p[i], 0.0, 1.0); return o;
  }
  @fragment fn fs(v: VO) -> @location(0) vec4f {
    let w = textureDimensions(src).x / 2u;
    let xy = vec2u(v.pos.xy);
    let hi = textureLoad(src, xy, 0).rgb;
    let lo = textureLoad(src, vec2u(xy.x + w, xy.y), 0).rgb;
    let e = (round(hi * 255.0) * 256.0 + round(lo * 255.0)) / 65535.0;
    return vec4f(pow(e, vec3f(2.4)) * 16.0, 1.0);
  }
`;

export class HDRPresenter {
  constructor(glCanvas) {
    this.gl = glCanvas;
    this.status = 'starting';
    this.active = false;
    this.want = false;
    // the display's headroom over SDR white, assumed (browsers do not say)
    this.peak = 4;
    this.size = [1, 1];
    this.ready = this.init().catch((e) => { this.status = `unavailable: ${e.message}`; });
  }
  async init() {
    if (!navigator.gpu) throw new Error('no WebGPU');
    // (the adapter is kept: dropped, its instance can go with it and take the
    // device down)
    const adapter = this.adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('no adapter');
    this.device = await adapter.requestDevice();
    this.device.lost.then((i) => {
      this.lost = `${i.reason}: ${i.message}`;
      if (i.reason === 'destroyed') return;
      this.losses = (this.losses ?? 0) + 1;
      // lost: start again with a new device and canvas
      this.pipeline = null; this.tex = null; this.active = false;
      this.canvas?.remove(); this.canvas = null;
      this.gl.style.opacity = '';
      this.ready = this.init().catch((e) => { this.status = `unavailable: ${e.message}`; });
    });
    this.device.addEventListener?.('uncapturederror', (e) => { this.gpuErr = e.error?.message; });
    const c = document.createElement('canvas');
    c.id = 'stage-hdr';
    c.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:none;pointer-events:none;';
    this.gl.after(c);
    this.canvas = c;
    this.ctx = c.getContext('webgpu');
    this.ctx.configure({ device: this.device, format: 'rgba16float', toneMapping: { mode: 'extended' }, alphaMode: 'opaque' });
    const mode = this.ctx.getConfiguration?.()?.toneMapping?.mode;
    if (mode !== 'extended') throw new Error('no extended-range canvas');
    const mod = this.device.createShaderModule({ code: WGSL });
    this.pipeline = this.device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: mod, entryPoint: 'vs' },
      fragment: { module: mod, entryPoint: 'fs', targets: [{ format: 'rgba16float' }] },
      primitive: { topology: 'triangle-list' },
    });
    this.hdrDisplay = matchMedia('(dynamic-range: high)').matches;
    this.status = this.hdrDisplay ? 'ok' : 'ok (this display is SDR: shown clipped at white)';
    Object.defineProperty(this, 'debug', { configurable: true, get: () => ({ lost: this.lost ?? null, gpuErr: this.gpuErr ?? null, probe: this.probe2d(), err: this.err ?? null, canvas: this.canvas ? [this.canvas.width, this.canvas.height] : null, losses: this.losses ?? 0, gl: [this.gl.width, this.gl.height], tex: this.tex ? [this.tex.width, this.tex.height] : null }) });
    this.enable(this.want);
  }
  // can this device copy anything at all from a canvas? (debugging)
  probe2d() {
    if (!this.device) return 'no device';
    try {
      const c = document.createElement('canvas'); c.width = c.height = 4;
      c.getContext('2d').fillRect(0, 0, 4, 4);
      const t = this.device.createTexture({ size: [4, 4], format: 'rgba8unorm', usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT });
      this.device.queue.copyExternalImageToTexture({ source: c }, { texture: t }, [4, 4]);
      t.destroy();
      return 'ok';
    } catch (e) { return e.message; }
  }
  enable(on) {
    this.want = on;
    this.active = !!(on && this.pipeline);
    if (!this.canvas) return;
    this.canvas.style.display = this.active ? 'block' : 'none';
    this.gl.style.opacity = this.active ? '0' : '';
  }
  resize(w, h, dpr) {
    this.size = [Math.round(w * dpr), Math.round(h * dpr)];
    if (!this.canvas) return;
    this.canvas.width = this.size[0]; this.canvas.height = this.size[1];
    this.tex?.destroy(); this.tex = null;
  }
  present(glCanvas) {
    if (!this.active) return;
    const d = this.device;
    const W = glCanvas.width, H = glCanvas.height;
    if (!this.tex || this.tex.width !== W || this.tex.height !== H) {
      this.tex?.destroy();
      this.tex = d.createTexture({ size: [W, H], format: 'rgba8unorm', usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT });
      this.bind = d.createBindGroup({ layout: this.pipeline.getBindGroupLayout(0), entries: [{ binding: 0, resource: this.tex.createView() }] });
      if (this.canvas.width !== W / 2 || this.canvas.height !== H) { this.canvas.width = W / 2; this.canvas.height = H; }
    }
    try {
      d.queue.copyExternalImageToTexture({ source: glCanvas }, { texture: this.tex }, [W, H]);
    } catch (e) {
      // (some drivers refuse a direct copy of a WebGL canvas: a bitmap of it
      // is taken now and copied a moment later)
      this.err = `${e.message} [${W}x${H}, tex ${this.tex.width}x${this.tex.height}]`;
      if (!this.pending) {
        this.pending = true;
        createImageBitmap(glCanvas).then((bmp) => {
          this.pending = false;
          if (!this.tex || bmp.width !== this.tex.width || bmp.height !== this.tex.height) { bmp.close(); return; }
          d.queue.copyExternalImageToTexture({ source: bmp }, { texture: this.tex }, [bmp.width, bmp.height]);
          bmp.close();
          this.draw();
        }).catch((e2) => { this.pending = false; this.err += ` / bitmap: ${e2.message}`; });
      }
      return;
    }
    this.draw();
  }
  draw() {
    const d = this.device;
    const enc = d.createCommandEncoder();
    const pass = enc.beginRenderPass({ colorAttachments: [{ view: this.ctx.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }] });
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bind);
    pass.draw(3);
    pass.end();
    d.queue.submit([enc.finish()]);
  }
  dispose() { this.tex?.destroy(); this.canvas?.remove(); this.device?.destroy(); }
}
