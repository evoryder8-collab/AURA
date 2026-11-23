/**
 * Raw WebGL renderer for light reflected from water. Two looks share one shader:
 * - `wall`: pool light thrown onto a wall at dusk, plus glints on the water line.
 * - `pool`: a close, brighter patch of the same light, faded to nothing at its edges,
 *   used behind a portrait.
 * The canvas only draws light (premultiplied alpha); the dusk colours underneath are CSS,
 * so a lost context simply leaves the still composition showing.
 */
import { isSoftwareRenderer } from '@/lib/webgl/renderer'

export type CausticVariant = 'wall' | 'pool'

export type CausticRenderer = {
  resize: (width: number, height: number) => void
  draw: (time: number, energy: number, focus: readonly [number, number]) => void
  dispose: () => void
}

const vertexSource = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`

const fragmentSource = (variant: CausticVariant) => `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
#define ${variant === 'wall' ? 'WALL' : 'POOL'}
uniform vec2 u_res;
uniform float u_time;
uniform float u_energy;
uniform vec2 u_focus;

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

// Distance between the nearest two moving cell centres: zero on the bright seams.
float seams(vec2 p, float t) {
  vec2 ip = floor(p);
  vec2 fp = fract(p);
  float f1 = 8.0;
  float f2 = 8.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = 0.5 + 0.42 * sin(t + 6.2831 * hash2(ip + g));
      float d = length(g + o - fp);
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) { f2 = d; }
    }
  }
  return f2 - f1;
}

float caustic(vec2 p, float t) {
  // Two layers of warp bend the cell seams into the curved filaments of real pool light.
  vec2 w = p + 0.55 * vec2(sin(p.y * 1.9 + t * 0.6), cos(p.x * 1.6 - t * 0.5));
  w += 0.22 * vec2(sin(w.y * 3.7 - t * 0.9), cos(w.x * 3.3 + t * 0.7));
  float a = exp(-seams(w, t * 0.8) * 9.0);
  float b = exp(-seams(w * 1.8 + 4.0, t * 1.2) * 11.0);
  return a * 0.6 + b * 0.3 + a * b * 2.0;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float aspect = u_res.x / u_res.y;
  vec3 aqua = vec3(0.60, 0.95, 0.87);
  vec3 lantern = vec3(1.0, 0.85, 0.60);
  vec3 col;
#ifdef WALL
  vec2 p = vec2(uv.x * aspect, uv.y);
  vec2 c = vec2(u_focus.x * aspect, u_focus.y) + 0.05 * vec2(sin(u_time * 0.11), cos(u_time * 0.09));
  vec2 d = (p - c) / vec2(0.5 + 0.18 * aspect, 0.3);
  float patch = exp(-dot(d, d) * 2.0);
  // Light thrown up from a pool stretches sideways and leans with the wall.
  float light = patch > 0.004 ? caustic(vec2(p.x * 4.2, p.y * 7.0 + p.x * 0.8), u_time * 0.5) * patch : 0.0;
  float shore = smoothstep(0.2, 0.0, uv.y);
  float glint = shore > 0.004 ? caustic(vec2(p.x * 2.0, uv.y * 18.0), u_time * 0.6) * shore : 0.0;
  col = mix(aqua, lantern, smoothstep(0.2, 1.0, (1.0 - uv.x) * 0.5 + (1.0 - uv.y) * 0.5)) * light * 0.4;
  col += lantern * glint * 0.16;
#else
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y - 0.5);
  vec2 f = vec2((u_focus.x - 0.5) * aspect, u_focus.y - 0.5);
  float r = length((p - f) / vec2(0.42 * min(aspect, 1.0), 0.4));
  // Fade to nothing well inside the canvas so its edges never show.
  vec2 edge = smoothstep(0.0, 0.22, uv) * smoothstep(0.0, 0.22, 1.0 - uv);
  float fall = smoothstep(1.0, 0.05, r) * edge.x * edge.y;
  float light = caustic(p * 5.0 + vec2(0.0, u_time * 0.04), u_time * 0.6);
  col = mix(lantern, aqua, smoothstep(0.1, 0.9, r)) * (light * 0.7 + 0.16 * (1.0 - r)) * fall;
#endif
  col *= u_energy;
  float a = clamp(max(col.r, max(col.g, col.b)), 0.0, 1.0);
  // A little noise hides 8-bit banding in the soft falloff.
  float n = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  gl_FragColor = vec4(clamp(col + n, 0.0, a), a);
}
`

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return null
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return shader
  gl.deleteShader(shader)
  return null
}

/** Returns null when WebGL is unavailable or the shader cannot compile; callers show the still scene. */
export function createCausticRenderer(
  canvas: HTMLCanvasElement,
  variant: CausticVariant,
): CausticRenderer | null {
  if (typeof window === 'undefined' || !('WebGLRenderingContext' in window)) return null
  let gl: WebGLRenderingContext | null = null
  try {
    gl = canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'low-power',
    })
  } catch {
    return null
  }
  if (!gl) return null
  // Without a GPU the shader would stall the page; the still scene is the better entrance.
  if (isSoftwareRenderer(gl)) {
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return null
  }

  const vertex = compile(gl, gl.VERTEX_SHADER, vertexSource)
  const fragment = compile(gl, gl.FRAGMENT_SHADER, fragmentSource(variant))
  const program = gl.createProgram()
  if (!vertex || !fragment || !program) return null
  gl.attachShader(program, vertex)
  gl.attachShader(program, fragment)
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null
  gl.useProgram(program)

  // One triangle that covers the whole viewport.
  const buffer = gl.createBuffer()
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
  const position = gl.getAttribLocation(program, 'a_pos')
  gl.enableVertexAttribArray(position)
  gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)

  const uniforms = {
    res: gl.getUniformLocation(program, 'u_res'),
    time: gl.getUniformLocation(program, 'u_time'),
    energy: gl.getUniformLocation(program, 'u_energy'),
    focus: gl.getUniformLocation(program, 'u_focus'),
  }
  const context = gl

  return {
    resize(width, height) {
      canvas.width = Math.max(1, Math.round(width))
      canvas.height = Math.max(1, Math.round(height))
      context.viewport(0, 0, canvas.width, canvas.height)
    },
    draw(time, energy, focus) {
      context.uniform2f(uniforms.res, canvas.width, canvas.height)
      context.uniform1f(uniforms.time, time)
      context.uniform1f(uniforms.energy, energy)
      context.uniform2f(uniforms.focus, focus[0], focus[1])
      context.drawArrays(context.TRIANGLES, 0, 3)
    },
    dispose() {
      context.deleteBuffer(buffer)
      context.deleteProgram(program)
      context.deleteShader(vertex)
      context.deleteShader(fragment)
      // Free the GPU context only when the canvas is really gone; a remount reuses it.
      if (!canvas.isConnected) context.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
}
