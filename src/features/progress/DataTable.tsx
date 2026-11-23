import { useId, useState, type ReactNode } from 'react'

/**
 * The accessible alternative to a chart: always present for screen readers,
 * shown on screen with "Show as table".
 */
export function DataTable({
  caption,
  head,
  rows,
}: {
  caption: string
  head: readonly string[]
  rows: ReadonlyArray<{ readonly key: string; readonly cells: readonly ReactNode[] }>
}) {
  const [shown, setShown] = useState(false)
  const id = useId()
  return (
    <div className="data-table">
      <button
        type="button"
        className="data-table__toggle"
        aria-pressed={shown}
        aria-controls={id}
        onClick={() => setShown((value) => !value)}
      >
        {shown ? 'Hide table' : 'Show as table'}
      </button>
      <div
        id={id}
        className={shown ? 'data-table__scroll' : 'visually-hidden'}
        role="region"
        aria-label={caption}
        tabIndex={shown ? 0 : -1}
      >
        <table>
          <caption className="visually-hidden">{caption}</caption>
          <thead>
            <tr>
              {head.map((cell) => (
                <th key={cell} scope="col">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                {row.cells.map((cell, index) => (index === 0 ? <th key={index} scope="row">{cell}</th> : <td key={index}>{cell}</td>))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
