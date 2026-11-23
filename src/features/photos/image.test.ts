import { frameToJpeg, MAX_PHOTO_EDGE, PHOTO_QUALITY, VIEWFINDER_ASPECT } from './image'

describe('frameToJpeg', () => {
  afterEach(() => vi.restoreAllMocks())

  function mockCanvas() {
    const drawImage = vi.fn()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
    } as never)
    const toDataURL = vi
      .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue('data:image/jpeg;base64,AAAA')
    return { drawImage, toDataURL }
  }

  it('never upscales and keeps a small frame whole', () => {
    const { drawImage, toDataURL } = mockCanvas()
    expect(frameToJpeg(document.createElement('canvas'), 800, 600)).toBe(
      'data:image/jpeg;base64,AAAA',
    )
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 800, 600, 0, 0, 800, 600)
    expect(toDataURL).toHaveBeenCalledWith('image/jpeg', PHOTO_QUALITY)
  })

  it('caps the longest edge at 1280px', () => {
    const { drawImage } = mockCanvas()
    frameToJpeg(document.createElement('canvas'), 4000, 3000)
    expect(drawImage).toHaveBeenCalledWith(
      expect.anything(),
      0,
      0,
      4000,
      3000,
      0,
      0,
      MAX_PHOTO_EDGE,
      960,
    )
  })

  it('centre-crops a portrait phone frame to 3:4 before scaling', () => {
    const { drawImage } = mockCanvas()
    frameToJpeg(document.createElement('canvas'), 1080, 1920, VIEWFINDER_ASPECT)
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 240, 1080, 1440, 0, 0, 960, 1280)
  })

  it('returns nothing for an empty frame or a missing canvas context', () => {
    mockCanvas()
    expect(frameToJpeg(document.createElement('canvas'), 0, 0)).toBeNull()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    expect(frameToJpeg(document.createElement('canvas'), 10, 10)).toBeNull()
  })
})
