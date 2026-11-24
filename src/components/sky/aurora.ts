import { isSoftwareRenderer } from '@/lib/webgl/renderer'

/**
 * The living sky: aurora ribbons with curtain streaks and silk-bright crests, drifting orbs of
 * light and fine dither, drawn at low resolution (soft light needs few pixels) and upscaled.
 * Kept dark overall so white type stays readable; the ribbons are the light.
 */
const vertexSource = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`

const fragmentSource = `
// 16-bit mediump (Apple GPUs) overflows the hash and noise maths into NaN, which paints white.
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;
uniform float uTime;
uniform float uScroll;
uniform float uCalm;
varying vec2 vUv;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(p);
    p *= 2.03;
    amplitude *= 0.5;
  }
  return value;
}

vec3 ribbon(vec2 p, float t, float base, float amp, float freq, float speed, float width, vec3 colour, float phase) {
  float y = base
    + amp * sin(p.x * freq + t * speed + phase)
    + amp * 0.5 * sin(p.x * freq * 2.3 - t * speed * 1.6 + phase * 1.7)
    + (fbm(vec2(p.x * 1.4 + t * 0.06, phase)) - 0.5) * 0.22;
  float d = p.y - y;
  float glow = exp(-(d * d) / (width * width));
  // Aurora curtains rise from the crest and fade upwards, combed into vertical streaks.
  float curtain = smoothstep(-0.035, 0.015, d) * exp(-max(d, 0.0) * 9.0);
  float streaks = 0.5 + 0.5 * fbm(vec2(p.x * 9.0 + t * 0.3, t * 0.12 + phase));
  float silk = exp(-(d * d) / 0.0012);
  return colour * (glow * 0.42 + curtain * 0.26) * streaks + mix(colour, vec3(1.0), 0.35) * silk * 0.3;
}

void main() {
  vec2 uv = vUv;
  float aspect = uRes.x / uRes.y;
  vec2 p = vec2(uv.x * aspect, uv.y);
  float t = uTime * mix(1.0, 0.4, uCalm);
  p.y += uScroll * 0.18;

  vec2 warp = vec2(fbm(p * 1.25 + t * 0.04), fbm(p * 1.25 - t * 0.035 + 7.3));
  p += (warp - 0.5) * 0.38;

  vec3 colour = mix(vec3(0.016, 0.02, 0.055), vec3(0.055, 0.07, 0.19), smoothstep(-0.1, 1.1, uv.y));
  colour += ribbon(p, t, 0.80, 0.07, 1.5, 0.42, 0.07, vec3(0.18, 0.92, 0.78), 0.0);
  colour += ribbon(p, t, 0.55, 0.09, 1.15, -0.33, 0.085, vec3(0.52, 0.38, 1.0), 2.1) * 0.9;
  colour += ribbon(p, t, 0.26, 0.06, 1.9, 0.27, 0.065, vec3(1.0, 0.58, 0.32), 4.3) * 0.85;

  vec2 o1 = vec2(aspect * (0.82 + 0.12 * sin(t * 0.16)), 0.92 + 0.07 * cos(t * 0.13));
  colour += vec3(0.16, 0.78, 0.70) * 0.2 * exp(-dot(p - o1, p - o1) * 3.2);
  vec2 o2 = vec2(aspect * (0.14 + 0.14 * cos(t * 0.11)), 0.12 + 0.09 * sin(t * 0.15));
  colour += vec3(1.0, 0.48, 0.42) * 0.17 * exp(-dot(p - o2, p - o2) * 3.6);
  vec2 o3 = vec2(aspect * (0.5 + 0.3 * sin(t * 0.07 + 1.0)), 0.45 + 0.1 * cos(t * 0.09));
  colour += vec3(0.45, 0.35, 1.0) * 0.1 * exp(-dot(p - o3, p - o3) * 4.0);

  colour *= mix(1.0, 0.5, uCalm);
  // smoothstep needs edge0 < edge1 (reversed edges are undefined and give 0 on ANGLE/Metal).
  float vignette = 1.0 - smoothstep(0.25, 1.3, length((uv - 0.5) * vec2(aspect * 0.85, 1.0)));
  colour *= mix(0.45, 0.6, vignette);
  colour = 1.0 - exp(-colour * 1.15);
  colour += (hash(mod(gl_FragCoord.xy, 64.0) + fract(t)) - 0.5) * (3.0 / 255.0);
  gl_FragColor = vec4(colour, 1.0);
}
`

export type AuroraRenderer = {
  draw: (input: { time: number; scroll: number; calm: number }) => void
  resize: (width: number, height: number) => void
  dispose: () => void
}

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader)
    return null
  }
  return shader
}

/** Returns null without usable WebGL (or on a software renderer); the CSS sky stays visible. */
export function createAuroraRenderer(canvas: HTMLCanvasElement): AuroraRenderer | null {
  let gl: WebGLRenderingContext | null = null
  try {
    gl = canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' })
  } catch {
    return null
  }
  if (!gl || gl.isContextLost()) return null
  if (isSoftwareRenderer(gl)) {
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return null
  }
  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource)
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource)
  const program = gl.createProgram()
  if (!vertex || !fragment || !program) return null
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null
  gl.useProgram(program)

  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const position = gl.getAttribLocation(program, 'aPosition')
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

  const uniforms = {
    res: gl.getUniformLocation(program, 'uRes'),
    time: gl.getUniformLocation(program, 'uTime'),
    scroll: gl.getUniformLocation(program, 'uScroll'),
    calm: gl.getUniformLocation(program, 'uCalm'),
  }
  const context = gl

  return {
    resize(width, height) {
      canvas.width = Math.max(1, Math.round(width))
      canvas.height = Math.max(1, Math.round(height))
      context.viewport(0, 0, canvas.width, canvas.height)
    },
    draw({ time, scroll, calm }) {
      context.uniform2f(uniforms.res, canvas.width, canvas.height)
      context.uniform1f(uniforms.time, time)
      context.uniform1f(uniforms.scroll, scroll)
      context.uniform1f(uniforms.calm, calm)
      context.drawArrays(context.TRIANGLE_STRIP, 0, 4)
    },
    dispose() {
      context.deleteBuffer(buffer)
      context.deleteProgram(program)
      context.deleteShader(vertex)
      // No loseContext(): a canvas keeps one context for life, and a remount (React StrictMode,
      // fast refresh) would get that lost context back and paint white.
      context.deleteShader(fragment)
    },
  }
}
