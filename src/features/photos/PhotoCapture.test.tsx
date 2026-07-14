import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createDemoState } from '@/data/demo/fixtures'
import { useDemoStore } from '@/data/demo/store'
import { PhotoCapture } from './PhotoCapture'

describe('PhotoCapture', () => {
  afterEach(() => vi.restoreAllMocks())

  it('opens a live environment camera and releases it cleanly', async () => {
    useDemoStore.setState({ ...createDemoState(), hydrated: true })
    const client = useDemoStore.getState().clients.find((item) => item.id === 'demo-client-mira')!
    const stop = vi.fn()
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] })
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia },
    })
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
    const user = userEvent.setup()

    render(<PhotoCapture client={client} open onOpenChange={vi.fn()} />)
    await user.type(screen.getByLabelText(/synthetic verification phrase/i), 'DEMO')
    await user.click(screen.getByRole('button', { name: /continue securely/i }))
    await user.click(screen.getByRole('button', { name: /open live camera/i }))

    expect(getUserMedia).toHaveBeenCalledWith({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    })
    expect(screen.getByRole('button', { name: /take photo in 3 seconds/i })).toBeVisible()
    expect(screen.getByLabelText(/live camera preview/i)).toHaveClass('is-visible')

    await user.click(screen.getByRole('button', { name: /close camera/i }))
    expect(stop).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: /open live camera/i })).toBeVisible()
  })
})
