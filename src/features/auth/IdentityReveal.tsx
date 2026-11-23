import { useEffect, useId, useRef, useState, type CSSProperties } from 'react'
import { assetUrl } from '@/components/ui/assets'
import { CausticCanvas } from '@/features/entrance/CausticCanvas'
import { LightText } from '@/features/entrance/LightText'
import { approach, runWhileVisible, usePrefersReducedMotion } from '@/features/entrance/motion'
import { initialsOf, type EntranceIdentity } from './entrance-identity'
import './identity-reveal.css'

/**
 * How each supplied cut-out sits in the 4:5 stage, as fractions of the stage. Every portrait
 * is framed on its own: the face lands about a third of the way down and the shoulders
 * dissolve before the stage ends. `light` is where the pool light gathers behind the head.
 */
type Composition = {
  width: number
  left: number
  top: number
  fade: readonly [number, number]
  light: readonly [number, number]
}

const compositions: Record<string, Composition> = {
  // Tall, waist-up: come in close so the face carries the frame.
  'portraits/pratana-hero.webp': {
    width: 0.94,
    left: 0.07,
    top: 0.05,
    fade: [0.5, 0.8],
    light: [0.5, 0.3],
  },
  // Wider, arms crossed: keep the whole pose, let the forearms melt into the dusk.
  'portraits/wassana-hero.webp': {
    width: 1.14,
    left: -0.06,
    top: 0.02,
    fade: [0.6, 0.93],
    light: [0.49, 0.3],
  },
}
const defaultComposition: Composition = {
  width: 0.96,
  left: 0.02,
  top: 0.06,
  fade: [0.55, 0.9],
  light: [0.5, 0.32],
}
/** No photograph: the light gathers behind the initials in the middle of the stage. */
const initialsLight: readonly [number, number] = [0.5, 0.55]

/** The pool-light canvas overhangs the stage so light spills past the shoulders. */
const overhang = { side: 0.22, top: 0.14 }

function useFloat(disabled: boolean, settled: boolean) {
  const figure = useRef<HTMLDivElement>(null)
  const light = useRef<HTMLDivElement>(null)
  const calm = useRef(settled)

  useEffect(() => {
    calm.current = settled
  }, [settled])

  useEffect(() => {
    const figureEl = figure.current
    const lightEl = light.current
    if (disabled || !figureEl || !lightEl) return
    const pointer = { x: 0, y: 0 }
    const eased = { x: 0, y: 0, amount: 1 }
    const finePointer = window.matchMedia('(pointer: fine)').matches
    const onMove = (event: PointerEvent) => {
      pointer.x = (event.clientX / window.innerWidth - 0.5) * 2
      pointer.y = (event.clientY / window.innerHeight - 0.5) * 2
    }
    if (finePointer) window.addEventListener('pointermove', onMove, { passive: true })
    const started = performance.now()
    const stop = runWhileVisible((now, dt) => {
      eased.amount = approach(eased.amount, calm.current ? 0.1 : 1, 1.6, dt)
      eased.x = approach(eased.x, pointer.x * eased.amount, 2.4, dt)
      eased.y = approach(eased.y, pointer.y * eased.amount, 2.4, dt)
      const t = (now - started) / 1000
      const bob = Math.sin(t * 0.85) * 6 * eased.amount
      const sway = Math.sin(t * 0.47) * 2.5 * eased.amount
      // The figure and the light behind it drift against each other: a soft parallax.
      figureEl.style.transform = `translate3d(${(sway - eased.x * 9).toFixed(2)}px, ${(bob - eased.y * 6).toFixed(2)}px, 0)`
      lightEl.style.transform = `translate3d(${(eased.x * 12 - sway).toFixed(2)}px, ${(eased.y * 8 - bob * 0.4).toFixed(2)}px, 0)`
    })
    return () => {
      stop()
      window.removeEventListener('pointermove', onMove)
    }
  }, [disabled])

  return { figure, light }
}

/**
 * The identity moment. A therapist's supplied portrait floats in front of moving pool light
 * with a breathing glow behind the silhouette; a client, who has no photograph, gets their
 * initials and name formed in the same light. Reduced motion shows the finished frame at once.
 */
export function IdentityReveal({
  identity,
  settled = false,
}: {
  identity: EntranceIdentity
  settled?: boolean
}) {
  const reducedMotion = usePrefersReducedMotion()
  const headingId = useId()
  const [portraitFailed, setPortraitFailed] = useState(false)
  const [lightFailed, setLightFailed] = useState(false)
  const { figure, light } = useFloat(reducedMotion, settled)
  const hero = identity.portrait && !portraitFailed ? identity.portrait.hero : null
  const frame = hero ? (compositions[hero] ?? defaultComposition) : defaultComposition
  const lightAt = hero ? frame.light : initialsLight
  const focus: readonly [number, number] = [
    (lightAt[0] + overhang.side) / (1 + overhang.side * 2),
    1 - (lightAt[1] + overhang.top) / (1 + overhang.top),
  ]
  const stageStyle = {
    '--img-width': `${frame.width * 100}%`,
    '--img-left': `${frame.left * 100}%`,
    '--img-top': `${frame.top * 100}%`,
    '--fade-from': `${frame.fade[0] * 100}%`,
    '--fade-to': `${frame.fade[1] * 100}%`,
    '--focus-x': `${focus[0] * 100}%`,
    '--focus-y': `${(1 - focus[1]) * 100}%`,
    '--overhang-side': `${overhang.side * -100}%`,
    '--overhang-top': `${overhang.top * -100}%`,
    ...(hero ? { '--hero': `url("${assetUrl(hero)}")` } : {}),
  } as CSSProperties

  return (
    <section
      className={`reveal ${hero ? 'reveal--portrait' : 'reveal--light'}`}
      aria-labelledby={headingId}
      data-settled={settled ? 'true' : undefined}
    >
      <div className="reveal__stage" style={stageStyle} aria-hidden="true">
        <div className="reveal__light" ref={light}>
          <span className="reveal__breath" />
          {reducedMotion || lightFailed ? null : (
            <CausticCanvas
              className="reveal__pool"
              variant="pool"
              intro
              focus={focus}
              energy={settled ? 0.5 : 1}
              speed={settled ? 0.14 : 1}
              onUnavailable={() => setLightFailed(true)}
            />
          )}
        </div>
        <div className="reveal__figure" ref={figure}>
          {hero ? (
            <div className="reveal__cutout">
              <span className="reveal__aura">
                <span />
              </span>
              <img
                className="reveal__portrait"
                src={assetUrl(hero)}
                alt=""
                decoding="async"
                onError={() => setPortraitFailed(true)}
              />
            </div>
          ) : (
            <span className="reveal__monogram">
              <LightText text={initialsOf(identity.name)} delayMs={150} stepMs={160} />
            </span>
          )}
        </div>
      </div>
      <div className="reveal__caption">
        <h1 id={headingId} className="reveal__name">
          <LightText text={identity.name} delayMs={hero ? 380 : 520} stepMs={32} />
        </h1>
        {identity.subtitle ? <p className="reveal__subtitle">{identity.subtitle}</p> : null}
      </div>
    </section>
  )
}
