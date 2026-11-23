import { Fragment, type CSSProperties } from 'react'

/**
 * Text whose letters condense out of light, one after another. Screen readers get the plain
 * text once; the animated letters are hidden from them. Each letter carries equal padding and
 * negative margin so iOS Safari never clips its blur to the glyph box.
 */
export function LightText({
  text,
  delayMs = 0,
  stepMs = 55,
}: {
  text: string
  delayMs?: number
  stepMs?: number
}) {
  let index = 0
  return (
    <>
      <span className="visually-hidden">{text}</span>
      <span
        className="light-text"
        aria-hidden="true"
        style={{ '--light-delay': `${delayMs}ms`, '--light-step': `${stepMs}ms` } as CSSProperties}
      >
        {text.split(' ').map((word, w) => (
          <Fragment key={`${w}-${word}`}>
            {w > 0 ? ' ' : null}
            <span className="light-text__word">
              {Array.from(word, (letter) => (
                <span
                  key={index}
                  className="light-text__letter"
                  style={{ '--i': index++ } as CSSProperties}
                >
                  {letter}
                </span>
              ))}
            </span>
          </Fragment>
        ))}
      </span>
    </>
  )
}
