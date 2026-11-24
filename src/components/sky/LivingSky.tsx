import { useEffect, useRef, useState } from 'react'
import { createAuroraRenderer } from './aurora'

const FRAME_MS = 1000 / 30

/**
 * The app's moving backdrop. A CSS sky sits underneath as the still fallback (no WebGL, a
 * software renderer, a lost context); the aurora fades in over it once its first frame is drawn.
 */
export function LivingSky({ calm = false }: { calm?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const calmTarget = useRef(calm ? 1 : 0)
  const [live, setLive] = useState(false)

  useEffect(() => {
    calmTarget.current = calm ? 1 : 0
  }, [calm])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const renderer = createAuroraRenderer(canvas)
    if (!renderer) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let frame = 0
    let last = 0
    let calmNow = calmTarget.current
    let scroll = window.scrollY / Math.max(1, window.innerHeight)
    const started = performance.now()

    const size = () => {
      const scale = window.innerWidth < 700 ? 0.5 : 0.42
      const width = Math.min(720, window.innerWidth * scale)
      renderer.resize(width, width * (window.innerHeight / window.innerWidth))
    }
    const draw = (now: number) => {
      calmNow += (calmTarget.current - calmNow) * 0.05
      const target = window.scrollY / Math.max(1, window.innerHeight)
      scroll += (target - scroll) * 0.12
      // A still sky for reduced motion: a fixed, well-composed moment.
      const time = reducedMotion.matches ? 38 : 18 + (now - started) / 1000
      renderer.draw({ time, scroll, calm: calmNow })
    }
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop)
      if (now - last < FRAME_MS) return
      last = now
      draw(now)
    }
    const start = () => {
      cancelAnimationFrame(frame)
      if (document.visibilityState !== 'visible') return
      if (reducedMotion.matches) draw(performance.now())
      else frame = requestAnimationFrame(loop)
    }
    const onLost = (event: Event) => {
      event.preventDefault()
      cancelAnimationFrame(frame)
      setLive(false)
    }
    const onResize = () => {
      size()
      draw(performance.now())
    }

    size()
    draw(performance.now())
    setLive(true)
    start()
    document.addEventListener('visibilitychange', start)
    reducedMotion.addEventListener('change', start)
    window.addEventListener('resize', onResize)
    canvas.addEventListener('webglcontextlost', onLost)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('visibilitychange', start)
      reducedMotion.removeEventListener('change', start)
      window.removeEventListener('resize', onResize)
      canvas.removeEventListener('webglcontextlost', onLost)
      renderer.dispose()
      setLive(false)
    }
  }, [])

  return (
    <div className="sky" aria-hidden="true">
      <span className="sky__light sky__light--aqua" />
      <span className="sky__light sky__light--violet" />
      <span className="sky__light sky__light--sunset" />
      <canvas ref={canvasRef} className={`sky__aurora${live ? ' is-live' : ''}`} />
      <span className="sky__grain" />
    </div>
  )
}
