import { CheckCircle2, ShieldCheck } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { Button } from '@/components/design-system/Button'
import { useDemoStore } from '@/data/demo/store'
import type { DoctorReport } from '@/domain/care'
import { reportInputs } from './inputs'
import { buildReportView, fmtLong, lowerFirst, recipientInSentence, sharedItems } from './model'
import { ReportExport } from './ReportExport'
import { useBodyAssets } from './body'
import { ReportPreview } from './ReportPreview'

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

export function ReportReview({ report, mode, onClose }: { report: DoctorReport; mode: 'client' | 'together'; onClose?: () => void }) {
  const state = useDemoStore()
  const consentToReport = useDemoStore((store) => store.consentToReport)
  const withdrawReport = useDemoStore((store) => store.withdrawReport)
  const body = useBodyAssets()
  const view = useMemo(() => buildReportView(reportInputs(state, report)), [state, report])
  const [photosAgreed, setPhotosAgreed] = useState(false)
  const [confirmWithdraw, setConfirmWithdraw] = useState(false)
  const photoId = useId()
  const preparer = state.therapists.find((therapist) => therapist.id === report.preparedBy)
  const client = state.clients.find((item) => item.id === report.clientId)
  const recipient = recipientInSentence(report.recipient, 'my')
  const consentWords = `I agree to share this with ${recipient} for ${lowerFirst(report.purpose)}`
  const photoCount = view.photos?.length ?? 0
  // Asking about photographs only makes sense when the report shows some.
  const sharesPhotos = report.includePhotos && photoCount > 0

  return (
    <div className="report-review stack">
      <header className="stack">
        <p className="eyebrow">Report for a doctor</p>
        <h1 className="title-lg">
          {mode === 'together' ? `${client?.preferredName ?? 'Client'}, this is for you to read` : `${preparer?.preferredName ?? 'Your therapist'} prepared a report for ${recipientInSentence(report.recipient, 'your')}`}
        </h1>
        <p className="lead">
          {mode === 'together'
            ? `${preparer?.preferredName ?? 'Your therapist'} prepared it. Nothing is shared unless you agree, and you can say no.`
            : 'Read what it says. Nothing is shared unless you agree.'}
        </p>
      </header>

      <section className="report-shared card" aria-labelledby={`${photoId}-what`}>
        <h2 className="card__title" id={`${photoId}-what`}>
          What will be shared
        </h2>
        <dl className="report-facts">
          <div>
            <dt>With</dt>
            <dd>{report.recipient}</dd>
          </div>
          <div>
            <dt>Why</dt>
            <dd>{view.purpose}</dd>
          </div>
          <div>
            <dt>Covering</dt>
            <dd>{view.period}</dd>
          </div>
          <div>
            <dt>Photographs</dt>
            <dd>{sharesPhotos ? `Included (${plural(photoCount, 'photograph', 'photographs')})` : 'Not included'}</dd>
          </div>
        </dl>
        <h3 className="report-subtitle">What it contains</h3>
        <ul className="report-list">
          {sharedItems(view).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p className="report-never">
          <ShieldCheck size={18} aria-hidden="true" /> Your therapists’ private notes are never included.
        </p>
      </section>

      <section className="stack" aria-label="The document">
        <h2 className="title-md">The whole document</h2>
        <ReportPreview view={view} body={body} label="The report as it will be shared" />
      </section>

      <section className="report-consent card" aria-live="polite">
        {report.status === 'awaiting_consent' ? (
          <div className="stack">
            <h2 className="card__title">Your choice</h2>
            {sharesPhotos ? (
              <label className="report-check" htmlFor={photoId}>
                <input id={photoId} type="checkbox" checked={photosAgreed} onChange={(event) => setPhotosAgreed(event.target.checked)} />
                <span>I agree to include my photographs ({plural(photoCount, 'photograph', 'photographs')}).</span>
              </label>
            ) : null}
            <Button
              variant="gold"
              size="lg"
              fullWidth
              className="report-agree"
              icon={<CheckCircle2 size={20} aria-hidden="true" />}
              disabled={sharesPhotos && !photosAgreed}
              onClick={() => consentToReport(report.id, report.clientId)}
            >
              {consentWords}
            </Button>
            {sharesPhotos && !photosAgreed ? (
              <p className="field__hint">This report includes photographs, so agree to them first.</p>
            ) : null}
            <Button variant="ghost" fullWidth onClick={() => withdrawReport(report.id)}>
              Don’t share this report
            </Button>
          </div>
        ) : null}

        {report.status === 'consented' && report.consent ? (
          <div className="stack">
            <h2 className="card__title">You agreed to share it</h2>
            <p>
              On {fmtLong(report.consent.consentedAt)} you agreed to share this with {recipientInSentence(report.consent.recipient, 'your')} for {lowerFirst(report.consent.purpose)}.
            </p>
            {mode === 'client' ? <ReportExport report={report} view={view} body={body} /> : null}
            {confirmWithdraw ? (
              <div className="stack report-withdraw" role="group" aria-label="Withdraw your agreement">
                <p>Withdrawing stops AURA producing this document. A copy already downloaded or handed over is not recalled.</p>
                <div className="row row--wrap">
                  <Button variant="danger" onClick={() => withdrawReport(report.id)}>
                    Withdraw my agreement
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmWithdraw(false)}>
                    Keep it
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="ghost" onClick={() => setConfirmWithdraw(true)}>
                Withdraw my agreement
              </Button>
            )}
          </div>
        ) : null}

        {report.status === 'withdrawn' ? (
          <div className="stack">
            <h2 className="card__title">Not shared</h2>
            <p>You chose not to share this report, so AURA will not produce it. Your therapist can ask you again if anything changes.</p>
          </div>
        ) : null}

        {mode === 'together' && onClose && report.status !== 'awaiting_consent' ? (
          <Button variant="secondary" fullWidth onClick={onClose}>
            Hand back to {preparer?.preferredName ?? 'your therapist'}
          </Button>
        ) : null}
      </section>
    </div>
  )
}
