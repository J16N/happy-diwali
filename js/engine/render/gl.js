// WebGL2 renderer. Hand written, no libraries.
//
// Per frame:
//   1. light map (1/4 res): every light as a soft additive ellipse
//   2. scene (HDR when the GPU allows it):
//        sky layer (+ haze lit by the light map)
//        far smoke, far sparks           <- behind the skyline
//        far city, near city, floor      <- lit by the light map
//        bodies (cracker shells, diyas, paper), near smoke, near sparks + text
//   3. bloom: bright pass, blur down a mip chain, add back up
//   4. composite: scene + bloom, soft tone map, dither
//
// Sparks and text stars are capsules drawn by a shader: a crisp, anti-aliased
// white-hot core plus a coloured halo, so small stars stay sharp.

const GLOW_VS = `#version 300 es
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 aSeg;
layout(location=2) in vec2 aRad;
layout(location=3) in vec4 aCol;
uniform vec2 uRes;
uniform float uDpr;
out vec2 vLocal;
out float vLen;
out vec3 vRad;
out vec4 vCol;
void main() {
  vec2 a = aSeg.xy, b = aSeg.zw;
  vec2 d = b - a;
  float len = length(d);
  vec2 dir = len > 1e-3 ? d / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float minCore = 0.65 / uDpr;
  float core = max(aRad.x, minCore);
  float halo = max(aRad.y, 0.5 / uDpr);
  float R = max(halo * 2.3, core + 1.5 / uDpr);
  float along = mix(-R, len + R, aCorner.x);
  float perp = mix(-R, R, aCorner.y);
  vec2 p = a + dir * along + nrm * perp;
  vLocal = vec2(along, perp);
  vLen = len;
  // A star smaller than a pixel keeps its energy instead of shimmering.
  float coreGain = aRad.x <= 0.0 ? 0.0 : min(1.0, (aRad.x * aRad.x) / (core * core) * 1.4);
  vRad = vec3(core, halo, coreGain);
  vCol = vec4(aCol.rgb / 255.0, aCol.a);
  vec2 clip = p / uRes * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const GLOW_FS = `#version 300 es
precision highp float;
in vec2 vLocal;
in float vLen;
in vec3 vRad;
in vec4 vCol;
uniform float uDpr;
out vec4 o;
void main() {
  float t = clamp(vLocal.x, 0.0, vLen);
  float dist = length(vec2(vLocal.x - t, vLocal.y));
  float head = vLen > 0.0 ? mix(0.3, 1.0, t / max(vLen, 1e-3)) : 1.0;
  float core = clamp((vRad.x - dist) * uDpr + 0.5, 0.0, 1.0) * vRad.z;
  float h = dist / vRad.y;
  float spread = vRad.y / (vRad.y + vLen * 0.4);
  float halo = (exp(-h * h * 2.0) * 0.6 + exp(-h * 1.7) * 0.1) * sqrt(spread);
  vec3 hot = mix(vCol.rgb, vec3(1.0), 0.5);
  vec3 c = (vCol.rgb * halo + hot * core) * vCol.a * head;
  o = vec4(c, 0.0);
}`;

const SMOKE_VS = `#version 300 es
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 aPos;
layout(location=2) in vec4 aCol;
layout(location=3) in float aVar;
uniform vec2 uRes;
out vec2 vUv;
out vec4 vCol;
void main() {
  vec2 c = aCorner * 2.0 - 1.0;
  float cs = cos(aPos.w), sn = sin(aPos.w);
  vec2 p = aPos.xy + vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs) * aPos.z;
  float v = floor(aVar + 0.5);
  vUv = (vec2(mod(v, 2.0), floor(v / 2.0)) + aCorner) * 0.5;
  vCol = vec4(aCol.rgb / 255.0, aCol.a);
  vec2 clip = p / uRes * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const SMOKE_FS = `#version 300 es
precision mediump float;
in vec2 vUv;
in vec4 vCol;
uniform sampler2D uTex;
uniform sampler2D uLight;
uniform vec2 uBuf;
out vec4 o;
void main() {
  float a = texture(uTex, vUv).a * vCol.a;
  vec3 light = texture(uLight, gl_FragCoord.xy / uBuf).rgb;
  vec3 c = vCol.rgb + light * 0.7;
  o = vec4(c * a, a);
}`;

const SPRITE_VS = `#version 300 es
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 aXf;
layout(location=2) in vec4 aRot;
layout(location=3) in vec4 aUv;
layout(location=4) in vec2 aAnchor;
uniform vec2 uRes;
out vec2 vUv;
out vec2 vMix;
void main() {
  vec2 local = (aCorner - aAnchor) * aXf.zw;
  float cs = cos(aRot.x), sn = sin(aRot.x);
  local = vec2(local.x * cs - local.y * sn, local.x * sn + local.y * cs);
  local.y *= aRot.y;
  vec2 p = aXf.xy + local;
  vUv = mix(aUv.xy, aUv.zw, aCorner);
  vMix = aRot.zw;
  vec2 clip = p / uRes * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const SPRITE_FS = `#version 300 es
precision mediump float;
in vec2 vUv;
in vec2 vMix;
uniform sampler2D uTex;
uniform sampler2D uLight;
uniform vec2 uBuf;
out vec4 o;
void main() {
  vec4 t = texture(uTex, vUv);
  vec3 light = texture(uLight, gl_FragCoord.xy / uBuf).rgb;
  vec3 c = t.rgb * (0.2 + light * 1.3) + t.rgb * vMix.y * 1.8;
  o = vec4(c, t.a) * vMix.x;
}`;

const FULL_VS = `#version 300 es
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const LAYER_FS = `#version 300 es
precision mediump float;
uniform sampler2D uTex;
uniform sampler2D uLight;
uniform vec2 uBuf;
uniform vec2 uRes;
uniform vec2 uShift;
uniform float uMargin;
uniform vec2 uTexSize;
uniform float uTop;
uniform float uAlbedo;
uniform float uHaze;
out vec4 o;
void main() {
  vec2 fc = gl_FragCoord.xy / uBuf;
  vec2 css = vec2(fc.x, 1.0 - fc.y) * uRes;
  vec2 tuv = (css - uShift + uMargin - vec2(0.0, uTop)) / uTexSize;
  if (tuv.y < 0.0 || tuv.y > 1.0) discard; // outside this layer's band
  vec4 t = texture(uTex, tuv);
  vec3 light = texture(uLight, fc).rgb;
  // Surfaces take the colour of the light that falls on them; a little is
  // also scattered by dust and haze regardless of the surface colour.
  vec3 c = t.rgb * (1.0 + light * 2.2) + light * uAlbedo * t.a + light * uHaze * 0.06;
  o = vec4(c, t.a);
}`;

const LIGHT_VS = `#version 300 es
layout(location=0) in vec2 aCorner;
layout(location=1) in vec4 aGeo;
layout(location=2) in vec3 aCol;
uniform vec2 uRes;
out vec2 vLocal;
out vec3 vCol;
void main() {
  vec2 c = aCorner * 2.0 - 1.0;
  vLocal = c;
  vCol = aCol;
  vec2 p = aGeo.xy + c * aGeo.zw;
  vec2 clip = p / uRes * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const LIGHT_FS = `#version 300 es
precision mediump float;
in vec2 vLocal;
in vec3 vCol;
out vec4 o;
void main() {
  float d2 = dot(vLocal, vLocal);
  float f = max(0.0, 1.0 - d2);
  f = f * f * (0.35 + 0.65 / (1.0 + d2 * 12.0));
  o = vec4(vCol * f, 0.0);
}`;

const PREFILTER_FS = `#version 300 es
precision mediump float;
uniform sampler2D uSrc;
uniform vec2 uSrcTexel;
uniform vec2 uDst;
uniform float uThreshold;
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / uDst;
  vec3 c = texture(uSrc, uv + uSrcTexel * vec2(-0.5, -0.5)).rgb
         + texture(uSrc, uv + uSrcTexel * vec2(0.5, -0.5)).rgb
         + texture(uSrc, uv + uSrcTexel * vec2(-0.5, 0.5)).rgb
         + texture(uSrc, uv + uSrcTexel * vec2(0.5, 0.5)).rgb;
  c *= 0.25;
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThreshold + 0.25, 0.0, 0.5);
  soft = soft * soft / 0.5;
  float w = max(soft, br - uThreshold) / max(br, 1e-4);
  o = vec4(c * w, 1.0);
}`;

const DOWN_FS = `#version 300 es
precision mediump float;
uniform sampler2D uSrc;
uniform vec2 uSrcTexel;
uniform vec2 uDst;
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / uDst;
  vec2 h = uSrcTexel;
  vec3 c = texture(uSrc, uv).rgb * 4.0;
  c += texture(uSrc, uv + vec2(-h.x, -h.y)).rgb;
  c += texture(uSrc, uv + vec2(h.x, -h.y)).rgb;
  c += texture(uSrc, uv + vec2(-h.x, h.y)).rgb;
  c += texture(uSrc, uv + vec2(h.x, h.y)).rgb;
  o = vec4(c / 8.0, 1.0);
}`;

const UP_FS = `#version 300 es
precision mediump float;
uniform sampler2D uSrc;
uniform vec2 uSrcTexel;
uniform vec2 uDst;
out vec4 o;
void main() {
  vec2 uv = gl_FragCoord.xy / uDst;
  vec2 h = uSrcTexel;
  vec3 c = texture(uSrc, uv + vec2(-h.x * 2.0, 0.0)).rgb;
  c += texture(uSrc, uv + vec2(-h.x, h.y)).rgb * 2.0;
  c += texture(uSrc, uv + vec2(0.0, h.y * 2.0)).rgb;
  c += texture(uSrc, uv + vec2(h.x, h.y)).rgb * 2.0;
  c += texture(uSrc, uv + vec2(h.x * 2.0, 0.0)).rgb;
  c += texture(uSrc, uv + vec2(h.x, -h.y)).rgb * 2.0;
  c += texture(uSrc, uv + vec2(0.0, -h.y * 2.0)).rgb;
  c += texture(uSrc, uv + vec2(-h.x, -h.y)).rgb * 2.0;
  o = vec4(c / 12.0, 1.0);
}`;

const COMPOSITE_FS = `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2 uBuf;
uniform float uBloomK;
uniform float uUseBloom;
out vec4 o;
vec3 shoulder(vec3 x) {
  // Identity in the darks, a soft roll-off above 0.6 so hot cores go white
  // instead of clipping into flat blobs.
  vec3 a = vec3(0.6);
  vec3 over = max(x - a, 0.0);
  return min(x, a) + (1.0 - a) * (1.0 - exp(-over / (1.0 - a)));
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec2 uv = gl_FragCoord.xy / uBuf;
  vec3 c = texture(uScene, uv).rgb;
  if (uUseBloom > 0.5) c += texture(uBloom, uv).rgb * uBloomK;
  // Very bright light bleeds towards white, like it does in the eye.
  float peak = max(c.r, max(c.g, c.b));
  c += vec3(max(peak - 1.6, 0.0) * 0.18);
  c = shoulder(c);
  c += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
  o = vec4(c, 1.0);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return s;
}

function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`Program link failed: ${gl.getProgramInfoLog(p)}`);
  const u = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(p, i);
    u[info.name] = gl.getUniformLocation(p, info.name);
  }
  return { p, u };
}

export class GLRenderer {
  /** Throws if WebGL2 is not available. */
  constructor(canvas) {
    this.kind = 'webgl';
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 unavailable');
    this.gl = gl;
    this.bloom = true;
    this.layers = null;
    this.atlas = null;
    this.smokeTex = null;
    this.lost = false;
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.lost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.lost = false;
      this._init();
      if (this._layerData) this.setLayers(this._layerData);
      if (this._atlasData) this.setTextures(...this._atlasData);
      this.resize(this.w, this.h, this.dpr);
    });
    this._init();
  }

  _init() {
    const gl = this.gl;
    this.half = !!(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
    gl.getExtension('OES_texture_float_linear');
    this.progs = {
      glow: program(gl, GLOW_VS, GLOW_FS),
      smoke: program(gl, SMOKE_VS, SMOKE_FS),
      sprite: program(gl, SPRITE_VS, SPRITE_FS),
      layer: program(gl, FULL_VS, LAYER_FS),
      light: program(gl, LIGHT_VS, LIGHT_FS),
      prefilter: program(gl, FULL_VS, PREFILTER_FS),
      down: program(gl, FULL_VS, DOWN_FS),
      up: program(gl, FULL_VS, UP_FS),
      composite: program(gl, FULL_VS, COMPOSITE_FS),
    };

    this.corner = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.corner);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);

    // [location, size, offset] per instanced attribute, stride in floats.
    const glowAttrs = [[1, 4, 0], [2, 2, 4], [3, 4, 6]];
    const smokeAttrs = [[1, 4, 0], [2, 4, 4], [3, 1, 8]];
    const spriteAttrs = [[1, 4, 0], [2, 4, 4], [3, 4, 8], [4, 2, 12]];
    const lightAttrs = [[1, 4, 0], [2, 3, 4]];
    this.vaos = {
      farGlow: this._vao(glowAttrs, 10),
      nearGlow: this._vao(glowAttrs, 10),
      farSmoke: this._vao(smokeAttrs, 9),
      nearSmoke: this._vao(smokeAttrs, 9),
      sprites: this._vao(spriteAttrs, 14),
      clouds: this._vao(spriteAttrs, 14),
      lights: this._vao(lightAttrs, 7),
    };
    this.emptyVao = gl.createVertexArray();
    this.targets = null;
    this.layerTex = [];
  }

  _vao(attrs, stride) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    const buf = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.corner);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    for (const [loc, size, off] of attrs) {
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride * 4, off * 4);
      gl.vertexAttribDivisor(loc, 1);
    }
    gl.bindVertexArray(null);
    return { vao, buf, stride, size: 0 };
  }

  _upload(v, batch) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, v.buf);
    const bytes = batch.n * v.stride * 4;
    if (bytes > v.size) {
      v.size = Math.max(bytes, v.size * 2, 4096);
      gl.bufferData(gl.ARRAY_BUFFER, v.size, gl.DYNAMIC_DRAW);
    }
    if (batch.n) gl.bufferSubData(gl.ARRAY_BUFFER, 0, batch.data, 0, batch.n * v.stride);
  }

  _texture(source, { linear = true, premultiply = true } = {}) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, linear ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, linear ? gl.LINEAR : gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  _target(w, h) {
    const gl = this.gl;
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (this.half) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE && this.half) {
      // Half float not renderable after all: fall back to 8 bit.
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.deleteFramebuffer(fb);
      gl.deleteTexture(tex);
      this.half = false;
      return this._target(w, h);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fb, w, h };
  }

  _freeTargets() {
    const gl = this.gl;
    if (!this.targets) return;
    const all = [this.targets.scene, this.targets.light, ...this.targets.mips];
    for (const t of all) {
      gl.deleteFramebuffer(t.fb);
      gl.deleteTexture(t.tex);
    }
    this.targets = null;
  }

  resize(w, h, dpr) {
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    const bw = Math.max(1, Math.round(w * dpr));
    const bh = Math.max(1, Math.round(h * dpr));
    this.canvas.width = bw;
    this.canvas.height = bh;
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.bw = bw;
    this.bh = bh;
    if (this.lost) return;
    this._freeTargets();
    const mips = [];
    let mw = bw, mh = bh;
    for (let i = 0; i < 5; i++) {
      mw = Math.max(1, mw >> 1);
      mh = Math.max(1, mh >> 1);
      mips.push(this._target(mw, mh));
    }
    this.targets = {
      scene: this._target(bw, bh),
      light: this._target(Math.max(1, bw >> 2), Math.max(1, bh >> 2)),
      mips,
    };
  }

  /** layers: result of buildLayers(). */
  setLayers(data) {
    this._layerData = data;
    if (this.lost) return;
    const gl = this.gl;
    for (const l of this.layerTex) gl.deleteTexture(l.tex);
    this.layerTex = data.layers.map((l) => ({ ...l, tex: this._texture(l.canvas) }));
    this.margin = data.margin;
  }

  setTextures(atlas, smoke, clouds) {
    this._atlasData = [atlas, smoke, clouds];
    if (this.lost) return;
    this.atlasTex = this._texture(atlas);
    this.smokeTex = this._texture(smoke);
    this.cloudTex = clouds ? this._texture(clouds) : null;
  }

  _bindTarget(t) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fb : null);
    gl.viewport(0, 0, t ? t.w : this.bw, t ? t.h : this.bh);
  }

  _drawInstanced(prog, v, batch, setup) {
    if (!batch.n) return;
    const gl = this.gl;
    this._upload(v, batch);
    gl.useProgram(prog.p);
    gl.uniform2f(prog.u.uRes, this.w, this.h);
    setup?.(prog.u);
    gl.bindVertexArray(v.vao);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, batch.n);
  }

  _layer(l, view) {
    const gl = this.gl;
    const pr = this.progs.layer;
    const [dx, dy] = view.layerShift(l.p);
    gl.useProgram(pr.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, l.tex);
    gl.uniform1i(pr.u.uTex, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.targets.light.tex);
    gl.uniform1i(pr.u.uLight, 1);
    gl.uniform2f(pr.u.uBuf, this.bw, this.bh);
    gl.uniform2f(pr.u.uRes, this.w, this.h);
    gl.uniform2f(pr.u.uShift, dx, dy);
    gl.uniform1f(pr.u.uMargin, this.margin);
    gl.uniform2f(pr.u.uTexSize, this.w + this.margin * 2, l.height);
    gl.uniform1f(pr.u.uTop, l.top);
    gl.uniform1f(pr.u.uAlbedo, l.albedo);
    gl.uniform1f(pr.u.uHaze, l.haze);
    // Only shade the rows the layer covers on screen.
    const y0 = l.top - this.margin + dy, y1 = y0 + l.height;
    const sy0 = Math.max(0, Math.floor((this.h - y1) * this.dpr)), sy1 = Math.min(this.bh, Math.ceil((this.h - y0) * this.dpr));
    if (sy1 <= sy0) return;
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(0, sy0, this.bw, sy1 - sy0);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.SCISSOR_TEST);
  }

  _fullscreen(prog, src, dst, uniforms) {
    const gl = this.gl;
    this._bindTarget(dst);
    gl.useProgram(prog.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.uniform1i(prog.u.uSrc, 0);
    gl.uniform2f(prog.u.uSrcTexel, 1 / src.w, 1 / src.h);
    gl.uniform2f(prog.u.uDst, dst.w, dst.h);
    uniforms?.(prog.u);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  render(frame, view) {
    if (this.lost || !this.targets || !this.layerTex.length) return;
    const gl = this.gl;
    const P = this.progs;
    const T = this.targets;
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);

    // 1. light map
    this._bindTarget(T.light);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.blendFunc(gl.ONE, gl.ONE);
    this._drawInstanced(P.light, this.vaos.lights, frame.lights);

    // 2. scene
    this._bindTarget(T.scene);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const [sky, far, near, floor] = this.layerTex;
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this._layer(sky, view);

    const smokeSetup = (u) => {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.smokeTex);
      gl.uniform1i(u.uTex, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, T.light.tex);
      gl.uniform1i(u.uLight, 1);
      gl.uniform2f(u.uBuf, this.bw, this.bh);
    };
    const glowSetup = (u) => gl.uniform1f(u.uDpr, this.dpr);

    this._drawInstanced(P.smoke, this.vaos.farSmoke, frame.far.smoke, smokeSetup);
    gl.blendFunc(gl.ONE, gl.ONE);
    this._drawInstanced(P.glow, this.vaos.farGlow, frame.far.glow, glowSetup);

    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    // Clouds: in front of distant shells (they veil them a little), behind
    // the skyline and everything near; lit by the fireworks via the light map.
    if (this.cloudTex) {
      this._drawInstanced(P.sprite, this.vaos.clouds, frame.clouds, (u) => {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.cloudTex);
        gl.uniform1i(u.uTex, 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, T.light.tex);
        gl.uniform1i(u.uLight, 1);
        gl.uniform2f(u.uBuf, this.bw, this.bh);
      });
    }
    this._layer(far, view);
    this._layer(near, view);
    this._layer(floor, view);

    this._drawInstanced(P.sprite, this.vaos.sprites, frame.sprites, (u) => {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
      gl.uniform1i(u.uTex, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, T.light.tex);
      gl.uniform1i(u.uLight, 1);
      gl.uniform2f(u.uBuf, this.bw, this.bh);
    });
    this._drawInstanced(P.smoke, this.vaos.nearSmoke, frame.near.smoke, smokeSetup);
    gl.blendFunc(gl.ONE, gl.ONE);
    this._drawInstanced(P.glow, this.vaos.nearGlow, frame.near.glow, glowSetup);

    // 3. bloom
    gl.disable(gl.BLEND);
    const mips = T.mips;
    const levels = this.bloom ? mips.length : 0;
    if (levels) {
      this._fullscreen(P.prefilter, T.scene, mips[0], (u) => gl.uniform1f(u.uThreshold, this.half ? 0.85 : 0.6));
      for (let i = 1; i < levels; i++) this._fullscreen(P.down, mips[i - 1], mips[i]);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = levels - 1; i > 0; i--) this._fullscreen(P.up, mips[i], mips[i - 1]);
      gl.disable(gl.BLEND);
    }

    // 4. composite
    this._bindTarget(null);
    const c = P.composite;
    gl.useProgram(c.p);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, T.scene.tex);
    gl.uniform1i(c.u.uScene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, mips[0].tex);
    gl.uniform1i(c.u.uBloom, 1);
    gl.uniform2f(c.u.uBuf, this.bw, this.bh);
    gl.uniform1f(c.u.uBloomK, 0.85);
    gl.uniform1f(c.u.uUseBloom, levels ? 1 : 0);
    gl.bindVertexArray(this.emptyVao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }
}

