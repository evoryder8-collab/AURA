import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { createDemoState } from '@/data/demo/fixtures'
import { useDemoStore } from '@/data/demo/store'
import { AuthContext, type AuthState } from '@/features/auth/auth-context'
import { useFreshAuthStore } from '@/features/consent/freshAuth'
import { PhotoCapture } from './PhotoCapture'

const MIRA = 'demo-client-mira'
const FAKE_JPEG = 'data:image/jpeg;base64,AAAA'

function authAs(role: 'client' | 'therapist', id: string): AuthState {
  return {
    loading: false,
    role,
    user: null,
    demoClientId: role === 'client' ? id : null,
    demoTherapistId: role === 'therapist' ? id : null,
    mfaChallengeRequired: false,
    error: null,
    signIn: async () => false,
    verifyMfa: async () => false,
    signInWithMagicLink: async () => false,
    enterDemo: () => undefined,
    signOut: async () => undefined,
  }
}

function Harness({ clientId = MIRA }: { clientId?: string }) {
  const [open, setOpen] = useState(true)
  const client = useDemoStore((state) => state.clients.find((item) => item.id === clientId))!
  return <PhotoCapture client={client} open={open} onOpenChange={setOpen} />
}

function renderFlow(auth = authAs('client', MIRA), clientId = MIRA) {
  return render(
    <AuthContext.Provider value={auth}>
      <Harness clientId={clientId} />
    </AuthContext.Provider>,
  )
}

function mockCamera(getUserMedia: ReturnType<typeof vi.fn>) {
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
}

const grantedCamera = () => {
  const stop = vi.fn()
  const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] })
  mockCamera(getUserMedia)
  return { stop, getUserMedia }
}

describe('PhotoCapture', () => {
  let drawImage: ReturnType<typeof vi.fn>

  beforeEach(() => {
    useDemoStore.setState({ ...createDemoState(), hydrated: true })
    useDemoStore.getState().updateConsent(MIRA, 'photography', true)
    useFreshAuthStore.setState({
      confirmedAt: {
        [`client:${MIRA}`]: new Date().toISOString(),
        'therapist:demo-therapist-sora': new Date().toISOString(),
      },
    })
    drawImage = vi.fn()
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage,
    } as never)
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(FAKE_JPEG)
    Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', {
      configurable: true,
      get: () => 1920,
    })
    Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', {
      configurable: true,
      get: () => 1080,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    Reflect.deleteProperty(navigator, 'mediaDevices')
  })

  it('goes from permission to capture, preview, retake and a single save', async () => {
    const { stop, getUserMedia } = grantedCamera()
    const addPhoto = vi.fn(useDemoStore.getState().addPhoto)
    useDemoStore.setState({ addPhoto })
    const user = userEvent.setup()
    renderFlow()

    expect(screen.getByRole('dialog', { name: 'Progress photo' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /before you start/i })).toBeInTheDocument()
    expect(
      screen.getByText(/stored only in this browser for the synthetic demo/i),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /turn on camera/i }))

    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    })
    expect(await screen.findByLabelText(/live camera view/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /^take photo$/i }))
    expect(screen.getByRole('img', { name: /not saved yet/i })).toHaveAttribute('src', FAKE_JPEG)
    expect(stop).toHaveBeenCalledTimes(1)
    // Centre-cropped to the 3:4 viewfinder from a 1920×1080 frame.
    expect(drawImage).toHaveBeenLastCalledWith(
      expect.anything(),
      555,
      0,
      810,
      1080,
      0,
      0,
      810,
      1080,
    )

    await user.click(screen.getByRole('button', { name: /retake/i }))
    expect(getUserMedia).toHaveBeenCalledTimes(2)
    await user.click(await screen.findByRole('button', { name: /^take photo$/i }))
    expect(addPhoto).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /save photo/i }))
    expect(addPhoto).toHaveBeenCalledTimes(1)
    expect(addPhoto).toHaveBeenCalledWith({
      clientId: MIRA,
      view: 'front',
      dataUrl: expect.stringMatching(/^data:image\/jpeg/),
    })
    expect(useDemoStore.getState().photos).toHaveLength(1)
    expect(screen.getByRole('heading', { name: /photo saved/i })).toBeInTheDocument()
    expect(stop).toHaveBeenCalledTimes(2)
  })

  it('takes the photo after a three-second timer in the chosen view', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    grantedCamera()
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderFlow()

    await user.click(screen.getByRole('button', { name: 'Side' }))
    await user.click(screen.getByRole('button', { name: /3-second timer/i }))
    await user.click(screen.getByRole('button', { name: /turn on camera/i }))
    await user.click(await screen.findByRole('button', { name: /take photo in 3 seconds/i }))

    expect(screen.getByRole('status')).toHaveTextContent(/taking the photo in 3/i)
    expect(screen.queryByRole('img', { name: /not saved yet/i })).not.toBeInTheDocument()
    // One second per tick; each tick re-renders before the next timer is set.
    for (const remaining of [2, 1]) {
      await act(() => vi.advanceTimersByTimeAsync(1000))
      expect(screen.getByRole('status')).toHaveTextContent(`Taking the photo in ${remaining}`)
    }
    await act(() => vi.advanceTimersByTimeAsync(1000))

    expect(screen.getByRole('img', { name: /side view photo, not saved yet/i })).toBeInTheDocument()
  })

  it('offers a file picker when camera permission is denied, and saves a downscaled file', async () => {
    const getUserMedia = vi
      .fn()
      .mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'))
    mockCamera(getUserMedia)
    const createObjectURL = vi.fn(() => 'blob:aura-test')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL })
    class LoadedImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      naturalWidth = 3024
      naturalHeight = 4032
      set src(_value: string) {
        queueMicrotask(() => this.onload?.())
      }
    }
    vi.stubGlobal('Image', LoadedImage)
    const user = userEvent.setup()
    renderFlow()

    await user.click(screen.getByRole('button', { name: /turn on camera/i }))
    expect(
      await screen.findByRole('heading', { name: /camera access is off/i }),
    ).toBeInTheDocument()
    const picker = screen.getByLabelText(/take or choose a photo/i)
    expect(picker).toBeVisible()
    expect(picker).toHaveAttribute('type', 'file')
    expect(picker).toHaveAttribute('accept', 'image/*')
    expect(picker).toHaveAttribute('capture', 'environment')

    await user.upload(picker, new File(['pixels'], 'posture.jpg', { type: 'image/jpeg' }))
    expect(await screen.findByRole('img', { name: /not saved yet/i })).toHaveAttribute(
      'src',
      FAKE_JPEG,
    )
    // 3024×4032 scaled so the long edge is 1280.
    expect(drawImage).toHaveBeenLastCalledWith(expect.anything(), 0, 0, 3024, 4032, 0, 0, 960, 1280)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:aura-test')

    await user.click(screen.getByRole('button', { name: /save photo/i }))
    expect(useDemoStore.getState().photos).toEqual([
      expect.objectContaining({ clientId: MIRA, dataUrl: FAKE_JPEG }),
    ])
    vi.unstubAllGlobals()
  })

  it('falls back to the file picker when the browser has no camera API', async () => {
    mockCamera(undefined as unknown as ReturnType<typeof vi.fn>)
    const user = userEvent.setup()
    renderFlow()

    await user.click(screen.getByRole('button', { name: /turn on camera/i }))
    expect(screen.getByRole('heading', { name: /no live camera here/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/take or choose a photo/i)).toBeInTheDocument()
  })

  it('stops the camera when the dialog closes or the flow unmounts', async () => {
    const { stop } = grantedCamera()
    const user = userEvent.setup()
    const view = renderFlow()

    await user.click(screen.getByRole('button', { name: /turn on camera/i }))
    await screen.findByLabelText(/live camera view/i)
    await user.click(screen.getByRole('button', { name: /close dialog/i }))
    expect(stop).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    view.unmount()

    const second = grantedCamera()
    const again = renderFlow()
    await user.click(screen.getByRole('button', { name: /turn on camera/i }))
    await screen.findByLabelText(/live camera view/i)
    again.unmount()
    expect(second.stop).toHaveBeenCalledTimes(1)
  })

  it('releases a camera that is granted after the dialog was already closed', async () => {
    const stop = vi.fn()
    let grant: (stream: unknown) => void = () => undefined
    mockCamera(vi.fn(() => new Promise((resolve) => (grant = resolve))))
    const user = userEvent.setup()
    renderFlow()

    await user.click(screen.getByRole('button', { name: /turn on camera/i }))
    expect(screen.getByText(/choose allow when your browser asks/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /close dialog/i }))
    await act(async () => grant({ getTracks: () => [{ stop }] }))
    await waitFor(() => expect(stop).toHaveBeenCalledTimes(1))
  })

  it('blocks the camera while photography consent is off', () => {
    useDemoStore.getState().updateConsent(MIRA, 'photography', false)
    const { getUserMedia } = grantedCamera()
    renderFlow()

    expect(screen.getByRole('heading', { name: /progress photos are off/i })).toBeInTheDocument()
    expect(screen.getByText(/turn on progress photos under consent/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /turn on camera/i })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/choose a photo/i)).not.toBeInTheDocument()
    expect(getUserMedia).not.toHaveBeenCalled()
  })

  it('asks the person to confirm it is them before the camera can open', async () => {
    useFreshAuthStore.setState({ confirmedAt: {} })
    const user = userEvent.setup()
    renderFlow()

    expect(screen.queryByRole('button', { name: /turn on camera/i })).not.toBeInTheDocument()
    await user.type(screen.getByLabelText(/type demo to confirm/i), 'nope')
    await user.click(screen.getByRole('button', { name: /^confirm$/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/type demo to continue/i)

    await user.clear(screen.getByLabelText(/type demo to confirm/i))
    await user.type(screen.getByLabelText(/type demo to confirm/i), 'DEMO')
    await user.click(screen.getByRole('button', { name: /^confirm$/i }))
    expect(screen.getByRole('button', { name: /turn on camera/i })).toBeInTheDocument()
  })

  it('lets a therapist photograph only clients assigned to them', () => {
    // Wassana is assigned to Mira and Sage, not Noa.
    useDemoStore.getState().updateConsent('demo-client-noa', 'photography', true)
    renderFlow(authAs('therapist', 'demo-therapist-sora'), 'demo-client-noa')
    expect(screen.getByRole('heading', { name: /not available here/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /turn on camera/i })).not.toBeInTheDocument()
  })

  it('opens for a therapist with an assigned, consenting client', () => {
    renderFlow(authAs('therapist', 'demo-therapist-sora'), MIRA)
    expect(screen.getByRole('dialog', { name: /progress photo for mira/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /turn on camera/i })).toBeInTheDocument()
  })
})
