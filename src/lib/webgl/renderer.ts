const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render driver|microsoft basic/i

/**
 * True when WebGL runs on the CPU (no usable GPU). Rich scenes then fall back to their still
 * versions instead of stalling the page. Unknown renderers count as hardware.
 */
export function isSoftwareRenderer(gl: WebGLRenderingContext | WebGL2RenderingContext): boolean {
  try {
    const info = gl.getExtension('WEBGL_debug_renderer_info')
    const name = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
    return typeof name === 'string' && SOFTWARE.test(name)
  } catch {
    return false
  }
}
