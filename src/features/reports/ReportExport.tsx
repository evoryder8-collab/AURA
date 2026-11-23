import { Download, Printer } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/design-system/Button'
import { reportIsExportable, type DoctorReport } from '@/domain/care'
import type { BodyAssets } from './geometry'
import { reportFileName, type ReportView } from './model'

async function makePdf(view: ReportView, body: BodyAssets | null) {
  const { renderReportPdf } = await import('./pdf/render')
  return renderReportPdf(view, body)
}

/** Download and print, offered only once the client agreed to exactly this recipient and purpose. */
export function ReportExport({ report, view, body }: { report: DoctorReport; view: ReportView; body: BodyAssets | null | undefined }) {
  const [busy, setBusy] = useState<'download' | 'print' | null>(null)
  const [error, setError] = useState<string | null>(null)
  if (!reportIsExportable(report)) return null

  const run = async (kind: 'download' | 'print') => {
    setBusy(kind)
    setError(null)
    try {
      const url = URL.createObjectURL(await makePdf(view, body ?? null))
      if (kind === 'download') {
        const link = document.createElement('a')
        link.href = url
        link.download = reportFileName(report)
        link.click()
      } else {
        const frame = document.createElement('iframe')
        frame.className = 'report-print-frame'
        frame.title = 'Report for printing'
        frame.src = url
        frame.onload = () => {
          try {
            frame.contentWindow?.focus()
            frame.contentWindow?.print()
          } catch {
            window.open(url, '_blank', 'noopener')
          }
        }
        document.body.append(frame)
        window.setTimeout(() => frame.remove(), 120_000)
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 120_000)
    } catch {
      setError('The PDF could not be prepared. Please try again.')
    } finally {
      setBusy(null)
    }
  }

  const waiting = body === undefined
  return (
    <div className="report-export">
      <div className="row row--wrap">
        <Button variant="gold" icon={<Download size={18} aria-hidden="true" />} disabled={waiting || busy !== null} onClick={() => void run('download')}>
          {busy === 'download' ? 'Preparing PDF…' : 'Download PDF'}
        </Button>
        <Button variant="secondary" icon={<Printer size={18} aria-hidden="true" />} disabled={waiting || busy !== null} onClick={() => void run('print')}>
          {busy === 'print' ? 'Preparing…' : 'Print'}
        </Button>
      </div>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}
