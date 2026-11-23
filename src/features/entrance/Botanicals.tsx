import { useId } from 'react'

/*
 * Soft botanical shadows thrown across the dusk wall: a palm frond, a monstera leaf and a
 * frangipani branch. Shapes are generated once from a few curves so they stay light to ship;
 * each is blurred inside its own SVG (rasterised once), and only its wrapper sways, which the
 * compositor can animate without repainting.
 */

type Pt = readonly [number, number]

const fmt = ([x, y]: Pt) => `${Math.round(x * 10) / 10} ${Math.round(y * 10) / 10}`
const add = (a: Pt, b: Pt, k = 1): Pt => [a[0] + b[0] * k, a[1] + b[1] * k]
const turn = ([x, y]: Pt, angle: number): Pt => [
  x * Math.cos(angle) - y * Math.sin(angle),
  x * Math.sin(angle) + y * Math.cos(angle),
]
const unit = ([x, y]: Pt): Pt => {
  const length = Math.hypot(x, y) || 1
  return [x / length, y / length]
}

/** A lens-shaped leaflet from `base` along `dir`, bowed downwards by `droop` of its length. */
function blade(base: Pt, dir: Pt, length: number, width: number, droop: number) {
  const tip = add(add(base, dir, length), [0, 1], droop * length * 0.7)
  const mid = add(add(base, dir, length * 0.45), [0, 1], droop * length)
  const normal: Pt = [-dir[1], dir[0]]
  return `M${fmt(base)}Q${fmt(add(mid, normal, width))} ${fmt(tip)}Q${fmt(add(mid, normal, -width))} ${fmt(base)}Z`
}

/** A broad leaf with a rounded tip. */
function broadLeaf(base: Pt, dir: Pt, length: number, width: number) {
  const tip = add(base, dir, length)
  const normal: Pt = [-dir[1], dir[0]]
  const near = (k: number) => fmt(add(add(base, dir, length * 0.18), normal, width * k))
  const far = (k: number) => fmt(add(add(tip, dir, -length * 0.12), normal, width * 1.05 * k))
  return `M${fmt(base)}C${near(1)} ${far(1)} ${fmt(tip)}C${far(-1)} ${near(-1)} ${fmt(base)}Z`
}

function quadratic(p0: Pt, c: Pt, p1: Pt) {
  return {
    at: (t: number): Pt => {
      const u = 1 - t
      return [
        u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0],
        u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1],
      ]
    },
    along: (t: number): Pt =>
      unit([
        2 * (1 - t) * (c[0] - p0[0]) + 2 * t * (p1[0] - c[0]),
        2 * (1 - t) * (c[1] - p0[1]) + 2 * t * (p1[1] - c[1]),
      ]),
  }
}

const palmPath = (() => {
  const rib = quadratic([0, 0], [250, -95], [540, 110])
  const upper: string[] = []
  const lower: string[] = []
  for (let i = 0; i <= 20; i++) {
    const t = i / 20
    const p = rib.at(t)
    const d = rib.along(t)
    const width = 7 * (1 - t) + 1
    upper.push(fmt(add(p, [-d[1], d[0]], width)))
    lower.unshift(fmt(add(p, [-d[1], d[0]], -width)))
  }
  const parts = [`M${upper.join('L')}L${lower.join('L')}Z`]
  const count = 30
  for (let i = 0; i < count; i++) {
    const t = 0.05 + (0.93 * i) / (count - 1)
    const base = rib.at(t)
    const d = rib.along(t)
    const length =
      40 + 200 * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.92)) ** 0.8 * (1 - 0.3 * t)
    for (const side of [-1, 1]) {
      const spread = side * (1.2 - 0.38 * t) + (i % 2 ? 0.07 : -0.07)
      parts.push(
        blade(base, unit(add(turn(d, spread), [0, 1], 0.32)), length, 13 * (1 - 0.4 * t), 0.1),
      )
    }
  }
  return parts.join('')
})()

/** Monstera: an ovate blade with a heart-shaped base, split from the margin towards the midrib. */
const monstera = (() => {
  const outline =
    'M0 0C20 30 50 45 90 40C150 32 186 -60 176 -150C166 -270 72 -360 0 -405' +
    'C-72 -360 -166 -270 -176 -150C-186 -60 -150 32 -90 40C-50 45 -20 30 0 0Z'
  const cuts: string[] = []
  const holes: Array<{ at: Pt; angle: number }> = []
  // Fixed jitter so every visit draws the same, slightly irregular leaf.
  const jitter = [0.05, -0.07, 0.02, 0.09, -0.04, 0.06, -0.08, 0.03]
  for (let k = 0; k < 7; k++) {
    const y = -34 - k * 48
    for (const side of [-1, 1]) {
      const wobble = jitter[(k + (side > 0 ? 3 : 0)) % jitter.length] ?? 0
      const rise = 0.42 + k * 0.07 + wobble
      const dir: Pt = [side * Math.cos(rise), -Math.sin(rise)]
      const start = add([0, y], dir, 42 - k * 2 + wobble * 60)
      const bend = add(add([0, y], dir, 140), [0, -1], 30 + wobble * 120)
      cuts.push(`M${fmt(start)}Q${fmt(bend)} ${fmt(add([0, y - 90], dir, 300))}`)
      if (k < 6 && (k + (side > 0 ? 1 : 0)) % 3 !== 2) {
        holes.push({
          at: add([0, y - 25], dir, 24 + wobble * 40),
          angle: (-side * rise * 180) / Math.PI,
        })
      }
    }
  }
  return { outline, cuts: cuts.join(''), holes }
})()

const frangipani = (() => {
  const crown: Pt = [170, -170]
  const heading = -0.95
  const leaves: string[] = []
  for (let j = 0; j < 6; j++) {
    const angle = heading + (j - 2.5) * 0.5
    leaves.push(broadLeaf(crown, [Math.cos(angle), Math.sin(angle)], 150 + ((j * 29) % 36), 34))
  }
  const stalkEnd: Pt = [330, -300]
  return {
    branch: `M0 0Q70 -30 ${fmt(crown)}`,
    stalk: `M${fmt(crown)}Q250 -210 ${fmt(stalkEnd)}`,
    leaves: leaves.join(''),
    flowers: [
      [stalkEnd[0], stalkEnd[1], 1],
      [stalkEnd[0] - 52, stalkEnd[1] - 40, 0.9],
      [stalkEnd[0] + 30, stalkEnd[1] - 62, 0.8],
    ] as Array<[number, number, number]>,
  }
})()

/** One frangipani petal: narrow at the centre, round and broad at the end, overlapping its neighbour. */
const petal = 'M0 0C4 -10 22 -22 34 -14C44 -6 36 8 20 8C10 8 4 5 0 0Z'

function Blur({ id, amount }: { id: string; amount: number }) {
  return (
    <filter id={id} x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">
      <feGaussianBlur stdDeviation={amount} />
    </filter>
  )
}

export function Botanicals() {
  const id = useId().replace(/:/g, '')
  return (
    <>
      <div className="dusk__plant dusk__plant--palm">
        <svg viewBox="-40 -300 860 680" preserveAspectRatio="xMidYMid meet">
          <defs>
            <Blur id={`${id}-palm`} amount={4.5} />
          </defs>
          <path d={palmPath} filter={`url(#${id}-palm)`} />
        </svg>
      </div>
      <div className="dusk__plant dusk__plant--monstera">
        <svg viewBox="-220 -440 440 760" preserveAspectRatio="xMidYMid meet">
          <defs>
            <Blur id={`${id}-monstera`} amount={7} />
            <mask
              id={`${id}-monstera-cut`}
              maskUnits="userSpaceOnUse"
              x="-220"
              y="-440"
              width="440"
              height="520"
            >
              <path d={monstera.outline} fill="#fff" />
              <path
                d={monstera.cuts}
                fill="none"
                stroke="#000"
                strokeWidth={13}
                strokeLinecap="round"
              />
              {monstera.holes.map(({ at, angle }) => (
                <ellipse
                  key={`${at[0]}-${at[1]}`}
                  cx={at[0]}
                  cy={at[1]}
                  rx={11}
                  ry={5.5}
                  transform={`rotate(${angle} ${at[0]} ${at[1]})`}
                  fill="#000"
                />
              ))}
            </mask>
          </defs>
          <g filter={`url(#${id}-monstera)`}>
            <rect x="-220" y="-440" width="440" height="520" mask={`url(#${id}-monstera-cut)`} />
            <path
              d="M0 0Q12 150 90 320"
              fill="none"
              stroke="currentColor"
              strokeWidth={10}
              strokeLinecap="round"
            />
          </g>
        </svg>
      </div>
      <div className="dusk__plant dusk__plant--frangipani">
        <svg viewBox="-20 -420 460 450" preserveAspectRatio="xMidYMid meet">
          <defs>
            <Blur id={`${id}-frangipani`} amount={3.2} />
          </defs>
          <g filter={`url(#${id}-frangipani)`}>
            <path
              d={frangipani.branch}
              fill="none"
              stroke="currentColor"
              strokeWidth={15}
              strokeLinecap="round"
            />
            <path
              d={frangipani.stalk}
              fill="none"
              stroke="currentColor"
              strokeWidth={4}
              strokeLinecap="round"
            />
            <path d={frangipani.leaves} />
            {frangipani.flowers.map(([x, y, size]) => (
              <g key={`${x}-${y}`} transform={`translate(${x} ${y}) scale(${size * 1.5})`}>
                {[0, 1, 2, 3, 4].map((k) => (
                  <path key={k} d={petal} transform={`rotate(${k * 72 + x})`} />
                ))}
              </g>
            ))}
          </g>
        </svg>
      </div>
    </>
  )
}
