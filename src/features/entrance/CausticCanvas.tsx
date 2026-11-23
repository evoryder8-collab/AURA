import { useEffect, useRef } from 'react'
import { createCausticRenderer, type CausticVariant } from './caustics'
import { approach, runWhileVisible } from './motion'

/** Internal resolution per CSS pixel and the widest buffer we ever draw: soft light needs few pixels. */
const quality: Record<CausticVariant, { scale: number; maxWidth: number }> = {
  wall: { scale: 0.42, maxWidth: 640 },
  pool: { scale: 0.7, maxWidth: 420 },
}

const CINEMATIC_SECONDS = 2.6
const CALM_FRAME_MS = 1000 / 30

export function CausticCanvas({
  variant,
  energy,
  speed,
  focus,
  intro = false,
  className,
  onUnavailable,
}: {
  variant: CausticVariant
  /** Brightness the light eases toward. */
  energy: number
  /** How fast the water moves; eased, so settling never jumps. */
  speed: number
  focus: readonly [number, number]
  /** Start dark and fast, swell, then settle: the reveal moment. */
  intro?: boolean
  className?: string
  onUnavailable?: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const targets = useRef({ energy, speed, focus })
  const unavailable = useRef(onUnavailable)

  useEffect(() => {
    targets.current = { energy, speed, focus }
    unavailable.current = onUnavailable
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const renderer = createCausticRenderer(canvas, variant)
    if (!renderer) {
      unavailable.current?.()
      return
    }

    // A wall scene starts already lit; a reveal starts in the dark and rushes in.
    let shownEnergy = intro ? 0 : targets.current.energy
    let shownSpeed = targets.current.speed
    let clock = Math.random() * 40
    let age = 0
    let lastDraw = -Infinity
    let lost = false

    const { scale, maxWidth } = quality[variant]
    const fit = () => {
      // Layout size, not the on-screen box: parents float and drift with transforms.
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      const ratio = Math.min(scale, maxWidth / Math.max(width, 1))
      renderer.resize(width * ratio, height * ratio)
      // Resizing clears the buffer: repaint at once so the light never blinks.
      renderer.draw(clock, shownEnergy, targets.current.focus)
    }
    const observer = new ResizeObserver(fit)
    observer.observe(canvas)
    fit()

    const stop = runWhileVisible((now, dt) => {
      if (lost) return
      age += dt
      const { energy: e, speed: s, focus: f } = targets.current
      const rush = intro ? Math.exp(-age / 0.9) : 0
      shownEnergy = approach(shownEnergy, e, intro && age < 1 ? 3.2 : 1.4, dt)
      shownSpeed = approach(shownSpeed, s, 1.2, dt)
      clock += dt * shownSpeed * (1 + 2.4 * rush)
      const swell = intro ? 1 + 0.55 * Math.sin(Math.min(age / 1.6, 1) * Math.PI) : 1
      const cinematic = intro && age < CINEMATIC_SECONDS
      if (!cinematic && now - lastDraw < CALM_FRAME_MS - 4) return
      lastDraw = now
      renderer.draw(clock, shownEnergy * swell, f)
    })

    const onLost = (event: Event) => {
      event.preventDefault()
      lost = true
      unavailable.current?.()
    }
    canvas.addEventListener('webglcontextlost', onLost)

    return () => {
      stop()
      observer.disconnect()
      canvas.removeEventListener('webglcontextlost', onLost)
      renderer.dispose()
    }
  }, [intro, variant])

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />
}
