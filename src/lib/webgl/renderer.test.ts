import { describe, expect, it } from 'vitest'
import { isSoftwareRenderer } from './renderer'

const fake = (name: string | null, withInfo = true) =>
  ({
    RENDERER: 0x1f01,
    getExtension: () => (withInfo ? { UNMASKED_RENDERER_WEBGL: 0x9246 } : null),
    getParameter: () => name,
  }) as unknown as WebGLRenderingContext

describe('software renderer detection', () => {
  it('flags CPU renderers and trusts real GPUs', () => {
    expect(isSoftwareRenderer(fake('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)'))).toBe(true)
    expect(isSoftwareRenderer(fake('llvmpipe (LLVM 15.0.7, 256 bits)'))).toBe(true)
    expect(isSoftwareRenderer(fake('Apple GPU'))).toBe(false)
    expect(isSoftwareRenderer(fake('ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)'))).toBe(false)
    expect(isSoftwareRenderer(fake(null, false))).toBe(false)
  })
})
