import * as Dialog from '@radix-ui/react-dialog'
import { AlertTriangle, ChevronLeft, Lock, Send, Users, X } from 'lucide-react'
import { useId, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/design-system/Button'
import { Spinner } from '@/components/design-system/Spinner'
import { Field, Input, Textarea } from '@/components/design-system/FormField'
import { Modal } from '@/components/design-system/Modal'
import { Segmented } from '@/components/ui/Segmented'
import type { DemoClient, DemoReport } from '@/data/demo/model'
import { useDemoStore, type ReportDraft } from '@/data/demo/store'
import { therapistCanAccessClient } from '@/data/demo/team'
import {
  REPORT_SECTIONS,
  areaKeyLabel,
  areaPoints,
  figureViews,
  hiddenAreas,
  recordedAreas,
  reportNoteChoices,
  type AreaKey,
  type DoctorReport,
  type ReportFigureView,
  type ReportSection,
  type TherapistNote,
} from '@/domain/care'
import { useAuth } from '@/features/auth/auth-context'
import { ConfirmItsYou } from '@/features/consent/ConfirmItsYou'
import { useConsentGuard } from '@/features/consent/freshAuth'
import { photosInPeriod, reportInputs } from './inputs'
import {
  SECTION_LABEL,
  buildReportView,
  customRange,
  fmtMed,
  fmtPeriod,
  lowerFirst,
  practiceDay,
  presetRange,
  recipientInSentence,
  reportProblems,
  type RangePreset,
} from './model'
import { ReportExport } from './ReportExport'
import { useBodyAssets } from './body'
import { ReportPreview } from './ReportPreview'
import { ReportReview } from './ReportReview'
import './report.css'

type Draft = {
  recipient: string
  purpose: string
  preset: RangePreset
  fromDay: string
  toDay: string
  dateFrom: string
  dateTo: string
  areas: AreaKey[]
  view: ReportFigureView
  sections: ReportSection[]
  includePhotos: boolean
  /** A report note's id, or `new` while writing one. */
  noteChoice: string
  newNote: string
  noteText: string
  recommendation: string
}

const VIEW_OPTIONS: ReadonlyArray<{ value: ReportFigureView; label: string }> = [
  { value: 'auto', label: 'Automatic' },
  { value: 'front', label: 'Front' },
  { value: 'back', label: 'Back' },
  { value: 'paired', label: 'Front and back' },
]

const RANGE_OPTIONS: ReadonlyArray<{ value: RangePreset; label: string }> = [
  { value: 'visits', label: 'Last 6 visits' },
  { value: 'months', label: '3 months' },
  { value: 'custom', label: 'Custom' },
]

const BODY_SECTIONS = REPORT_SECTIONS.filter((section) => section !== 'photos')

const time = (iso: string) => new Date(iso).getTime()

/** The fields a saved report and a draft share, in one order, to tell whether anything changed. */
const comparable = (report: Omit<ReportDraft, 'clientId'>) =>
  JSON.stringify([
    report.preparedBy,
    report.recipient,
    report.purpose,
    report.dateFrom,
    report.dateTo,
    report.areas,
    report.sections,
    report.view,
    report.noteId ?? null,
    report.noteText,
    report.recommendation,
    report.includePhotos,
  ])

export function ReportBuilderPage() {
  const { clientId = '', reportId } = useParams()
  const { demoTherapistId } = useAuth()
  const therapists = useDemoStore((state) => state.therapists)
  const client = useDemoStore((state) => state.clients.find((item) => item.id === clientId))
  const saved = useDemoStore((state) => (reportId ? state.reports.find((item) => item.id === reportId) : undefined))
  // Defaults are worked out once, so they wait for the saved demo record to load.
  const hydrated = useDemoStore((state) => state.hydrated)
  if (!hydrated) return <Spinner label="Opening the report" fullPage />
  const allowed =
    client !== undefined &&
    demoTherapistId &&
    therapistCanAccessClient({ therapists }, demoTherapistId, clientId) &&
    (!reportId || saved?.clientId === clientId)

  if (!allowed || !client || !demoTherapistId) {
    return (
      <div className="page report-page">
        <div className="empty" role="status">
          <h1 className="title-md">This report isn’t available</h1>
          <p>Only a therapist who works with this client can prepare or open a report for them.</p>
          <Link to="/therapist/clients" className="back-link">
            <ChevronLeft size={18} aria-hidden="true" /> Clients
          </Link>
        </div>
      </div>
    )
  }
  return <Builder key={reportId ?? 'new'} client={client} therapistId={demoTherapistId} saved={saved} />
}

function Builder({ client, therapistId, saved }: { client: DemoClient; therapistId: string; saved: DemoReport | undefined }) {
  const state = useDemoStore()
  const { saveReport, requestReportConsent, addNote } = state
  const navigate = useNavigate()
  const location = useLocation()
  const body = useBodyAssets()
  const id = useId()
  const errorsRef = useRef<HTMLDivElement>(null)
  const [now] = useState(() => new Date())
  const [confirming, setConfirming] = useState(false)
  const photoAccess = useConsentGuard(client)('view_photo')
  const clientId = client.id

  const observations = useMemo(() => state.observations.filter((item) => item.clientId === clientId), [state.observations, clientId])
  const visitStarts = useMemo(
    () => state.appointments.filter((item) => item.clientId === clientId && item.status === 'completed').map((item) => item.startsAt),
    [state.appointments, clientId],
  )
  const points = useMemo(() => areaPoints(observations, []), [observations])
  const areaOptions = useMemo(() => recordedAreas(observations), [observations])
  const mostReported = useMemo(() => {
    const counts = new Map<AreaKey, number>()
    for (const point of points) counts.set(point.area, (counts.get(point.area) ?? 0) + 1)
    return [...areaOptions].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0))[0]
  }, [points, areaOptions])
  const noteChoices = useMemo(() => reportNoteChoices(state.notes, clientId), [state.notes, clientId])
  const names = useMemo(() => Object.fromEntries(state.therapists.map((item) => [item.id, item.displayName])), [state.therapists])

  const [draft, setDraft] = useState<Draft>(() => {
    if (saved) {
      const visits = presetRange('visits', visitStarts, now)
      const months = presetRange('months', visitStarts, now)
      const preset: RangePreset = saved.dateFrom === visits.dateFrom ? 'visits' : saved.dateFrom === months.dateFrom ? 'months' : 'custom'
      return {
        recipient: saved.recipient,
        purpose: saved.purpose,
        preset,
        fromDay: practiceDay(saved.dateFrom),
        toDay: practiceDay(saved.dateTo),
        dateFrom: saved.dateFrom,
        dateTo: saved.dateTo,
        areas: [...saved.areas],
        view: saved.view,
        sections: saved.sections.filter((section) => section !== 'photos'),
        includePhotos: saved.includePhotos,
        noteChoice: saved.noteId ?? 'new',
        newNote: '',
        noteText: saved.noteText,
        recommendation: saved.recommendation,
      }
    }
    const range = presetRange('visits', visitStarts, now)
    const label = mostReported ? lowerFirst(areaKeyLabel(mostReported)) : 'reported'
    const note = noteChoices[0]
    return {
      recipient: 'Family doctor',
      purpose: `a review of the persistent ${label} pain`,
      preset: 'visits',
      fromDay: practiceDay(range.dateFrom),
      toDay: practiceDay(range.dateTo),
      ...range,
      areas: mostReported ? [mostReported] : [],
      view: 'auto',
      sections: [...BODY_SECTIONS],
      includePhotos: false,
      noteChoice: note?.id ?? 'new',
      newNote: '',
      noteText: note?.body ?? '',
      recommendation: `I recommend discussing the persistent ${label} pain with your doctor.`,
    }
  })
  const [showErrors, setShowErrors] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [together, setTogether] = useState(Boolean((location.state as { together?: boolean } | null)?.together))
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }))

  const choosePreset = (preset: RangePreset) => {
    if (preset === 'custom') return set('preset', preset)
    const range = presetRange(preset, visitStarts, now)
    setDraft((current) => ({ ...current, preset, ...range, fromDay: practiceDay(range.dateFrom), toDay: practiceDay(range.dateTo) }))
  }
  const chooseDay = (key: 'fromDay' | 'toDay', value: string) => {
    setDraft((current) => {
      const next = { ...current, [key]: value }
      if (!next.fromDay || !next.toDay || next.fromDay > next.toDay) return next
      return { ...next, ...customRange(next.fromDay, next.toDay, now) }
    })
  }
  const rangeInvalid = draft.preset === 'custom' && (!draft.fromDay || !draft.toDay || draft.fromDay > draft.toDay)

  const photosInRange = photosInPeriod(state, clientId, draft.dateFrom, draft.dateTo).length
  const photographyOff = photoAccess.reason === 'consent_missing_or_inactive'
  const mustConfirm = photoAccess.reason === 'fresh_authentication_required' && photosInRange > 0

  const reportDraft: ReportDraft = {
    clientId,
    preparedBy: therapistId,
    recipient: draft.recipient.trim(),
    purpose: draft.purpose.trim(),
    dateFrom: draft.dateFrom,
    dateTo: draft.dateTo,
    areas: areaOptions.filter((area) => draft.areas.includes(area)),
    sections: REPORT_SECTIONS.filter((section) => (section === 'photos' ? draft.includePhotos : draft.sections.includes(section))),
    view: draft.view,
    ...(draft.noteChoice !== 'new' ? { noteId: draft.noteChoice } : {}),
    noteText: draft.noteText.trim(),
    recommendation: draft.recommendation.trim(),
    includePhotos: draft.includePhotos,
  }
  const dirty = !saved || comparable(saved) !== comparable(reportDraft)
  const problems = [...reportProblems(reportDraft), ...(rangeInvalid ? ['Choose a start date on or before the end date.'] : [])]

  const previewReport: DoctorReport = {
    ...reportDraft,
    id: saved?.id ?? 'preview',
    createdAt: saved?.createdAt ?? now.toISOString(),
    updatedAt: dirty ? now.toISOString() : (saved?.updatedAt ?? now.toISOString()),
    status: 'draft',
  }
  const savedView = useMemo(() => (saved ? buildReportView(reportInputs(state, saved)) : null), [state, saved])
  // Unchanged, a sent report previews the copy the client was sent, not today's records.
  const preview = !dirty && savedView ? savedView : buildReportView(reportInputs(state, previewReport))

  const views = figureViews(reportDraft.areas, reportDraft.view)
  const hidden = hiddenAreas(reportDraft.areas, views)

  const save = (after?: 'ask' | 'together') => {
    if (after && problems.length) {
      setShowErrors(true)
      window.requestAnimationFrame(() => errorsRef.current?.focus())
      return
    }
    if (rangeInvalid) return
    const reportId = saveReport(reportDraft, saved?.id)
    if (after) requestReportConsent(reportId)
    setShowErrors(false)
    setMessage(
      after === 'ask'
        ? `Sent to ${client.preferredName}. ${client.preferredName} can read it on the Me page and decide.`
        : after
          ? null
          : 'Draft saved.',
    )
    if (after === 'together') setTogether(true)
    if (!saved) navigate(`/therapist/clients/${clientId}/report/${reportId}`, { replace: true, state: { together: after === 'together' } })
  }

  const writeNote = () => {
    const text = draft.newNote.trim()
    if (!text) return
    const noteId = addNote({ clientId, therapistId, visibility: 'report', body: text })
    setDraft((current) => ({ ...current, noteChoice: noteId, newNote: '', noteText: text }))
  }
  const chooseNote = (note: TherapistNote | 'new') =>
    setDraft((current) =>
      note === 'new' ? { ...current, noteChoice: 'new' } : { ...current, noteChoice: note.id, noteText: note.body },
    )
  const toggle = <T,>(list: readonly T[], value: T) => (list.includes(value) ? list.filter((item) => item !== value) : [...list, value])

  const status = saved?.status
  // Asking again is only needed when something changed or the client hasn't been asked yet.
  const canAsk = !saved || dirty || status === 'draft' || status === 'withdrawn'
  const closeTogether = (open: boolean) => {
    setTogether(open)
    if (!open && (location.state as { together?: boolean } | null)?.together) navigate(location.pathname, { replace: true, state: null })
  }
  const pointsInRange = (area: AreaKey) =>
    points.filter((point) => point.area === area && time(point.observedAt) >= time(draft.dateFrom) && time(point.observedAt) <= time(draft.dateTo))

  return (
    <div className="page report-page">
      <Link to={`/therapist/clients/${clientId}`} className="back-link">
        <ChevronLeft size={18} aria-hidden="true" /> {client.displayName}
      </Link>
      <header className="stack report-head">
        <p className="eyebrow">Prepare report for a doctor</p>
        <h1 className="title-lg">{client.displayName}</h1>
        <p className="lead">Choose what goes in, check the preview, then ask {client.preferredName} to agree before anything is shared.</p>
      </header>

      <div className="report-status card" role="status" aria-live="polite">
        {!saved ? <p>New report · not saved yet</p> : null}
        {status === 'draft' ? <p>Draft · {client.preferredName} hasn’t been asked yet.</p> : null}
        {status === 'awaiting_consent' ? (
          <p>Waiting for {client.preferredName}. {client.preferredName} can read it on the Me page, or review it with you now.</p>
        ) : null}
        {status === 'withdrawn' ? <p>{client.preferredName} chose not to share this report. Change it and ask again if needed.</p> : null}
        {status === 'consented' && saved?.consent && savedView ? (
          <div className="stack">
            <p>
              {client.preferredName} agreed on {fmtMed(saved.consent.consentedAt)} to share it with {saved.consent.recipient} for {lowerFirst(saved.consent.purpose)}.
            </p>
            {dirty ? (
              <p className="report-warning">
                <AlertTriangle size={18} aria-hidden="true" /> You have unsaved changes. Saving them asks {client.preferredName} to agree again.
              </p>
            ) : (
              <ReportExport report={saved} view={savedView} body={body} />
            )}
          </div>
        ) : null}
        {message ? <p className="report-message">{message}</p> : null}
        {saved && saved.status !== 'consented' ? <p className="muted small">The PDF can be downloaded once {client.preferredName} agrees.</p> : null}
      </div>

      <div className="report-builder">
        <form className="report-form stack" onSubmit={(event) => event.preventDefault()} aria-label="Report settings">
          <fieldset className="report-fieldset">
            <legend>Who it is for</legend>
            <Field label="Recipient" hint="For example: Family doctor, or the doctor’s name">
              <Input value={draft.recipient} onChange={(event) => set('recipient', event.target.value)} autoComplete="off" />
            </Field>
            <Field label="Purpose" hint="Reads after “for”, for example: a review of the persistent left shoulder pain">
              <Input value={draft.purpose} onChange={(event) => set('purpose', event.target.value)} autoComplete="off" />
            </Field>
          </fieldset>

          <fieldset className="report-fieldset">
            <legend>Date range</legend>
            <Segmented label="Date range" value={draft.preset} options={RANGE_OPTIONS} onChange={choosePreset} className="report-segmented" />
            {draft.preset === 'custom' ? (
              <div className="grid-2">
                <Field label="From">
                  <Input type="date" value={draft.fromDay} max={practiceDay(now.toISOString())} onChange={(event) => chooseDay('fromDay', event.target.value)} />
                </Field>
                <Field label="To">
                  <Input type="date" value={draft.toDay} max={practiceDay(now.toISOString())} onChange={(event) => chooseDay('toDay', event.target.value)} />
                </Field>
              </div>
            ) : null}
            <p className="field__hint">
              {rangeInvalid ? 'Choose a start date on or before the end date.' : `${fmtPeriod(draft.dateFrom, draft.dateTo)} · ${preview.periodDetail}`}
            </p>
          </fieldset>

          <fieldset className="report-fieldset">
            <legend>Areas</legend>
            {areaOptions.length ? (
              <div className="report-options">
                {areaOptions.map((area) => {
                  const inRange = pointsInRange(area)
                  const latest = inRange.at(-1)
                  return (
                    <label key={area} className="report-check">
                      <input type="checkbox" checked={draft.areas.includes(area)} onChange={() => set('areas', toggle(draft.areas, area))} />
                      <span>
                        <strong>{areaKeyLabel(area)}</strong>
                        <span className="muted small">
                          {latest ? `Latest ${latest.pain}/10 · ${inRange.length} ${inRange.length === 1 ? 'score' : 'scores'} in this period` : 'No score in this period'}
                        </span>
                      </span>
                    </label>
                  )
                })}
              </div>
            ) : (
              <p className="muted">{client.preferredName} hasn’t recorded any area yet.</p>
            )}
          </fieldset>

          <fieldset className="report-fieldset">
            <legend>Body figure</legend>
            <Segmented label="Body figure view" value={draft.view} options={VIEW_OPTIONS} onChange={(value) => set('view', value)} className="report-segmented" />
            <p className="field__hint">
              Shows {views.length === 2 ? 'the front and the back' : `the ${views[0]}`}
              {draft.view === 'auto' ? ', chosen so every selected area is visible' : ''}.
            </p>
            {hidden.length ? (
              <p className="report-warning" role="alert">
                <AlertTriangle size={18} aria-hidden="true" /> This view can’t show {hidden.map((area) => lowerFirst(areaKeyLabel(area))).join(' or ')}. Choose Automatic or Front and back.
              </p>
            ) : null}
          </fieldset>

          <fieldset className="report-fieldset">
            <legend>Sections</legend>
            <div className="report-options">
              {BODY_SECTIONS.map((section) => (
                <label key={section} className="report-check">
                  <input type="checkbox" checked={draft.sections.includes(section)} onChange={() => set('sections', toggle(draft.sections, section))} />
                  <span>{SECTION_LABEL[section]}</span>
                </label>
              ))}
            </div>
            <label className="report-check report-check--photos">
              <input
                type="checkbox"
                checked={draft.includePhotos}
                disabled={(!photosInRange || !photoAccess.allowed) && !draft.includePhotos}
                onChange={(event) => set('includePhotos', event.target.checked)}
                aria-describedby={`${id}-photos`}
              />
              <span>
                <strong>Include photographs</strong>
                <span className="muted small" id={`${id}-photos`}>
                  {photographyOff
                    ? `${client.preferredName} has photography turned off, so no photographs can be included.`
                    : !photosInRange
                      ? 'No photographs were taken in this period.'
                      : mustConfirm
                        ? `${photosInRange} in this period. Confirm it’s you to see and include them.`
                        : `Off unless you include them. ${photosInRange} in this period.`}
                </span>
              </span>
            </label>
            {mustConfirm ? (
              <div>
                <Button variant="secondary" icon={<Lock size={16} aria-hidden="true" />} onClick={() => setConfirming(true)}>
                  Confirm it’s you
                </Button>
              </div>
            ) : null}
            {draft.includePhotos ? (
              <p className="report-warning" role="alert">
                <AlertTriangle size={18} aria-hidden="true" /> {client.preferredName} must agree to share photographs specifically. The report asks about them separately.
              </p>
            ) : null}
          </fieldset>

          <fieldset className="report-fieldset">
            <legend>Note for the report</legend>
            <p className="field__hint">Only notes written for a report are listed. Private notes never appear here and never leave the practice.</p>
            <div className="report-options" role="radiogroup" aria-label="Choose a note">
              {noteChoices.map((note) => (
                <label key={note.id} className="report-check report-check--note">
                  <input type="radio" name={`${id}-note`} checked={draft.noteChoice === note.id} onChange={() => chooseNote(note)} />
                  <span>
                    <strong>
                      {names[note.therapistId] ?? 'Therapist'} · {fmtMed(note.updatedAt)}
                    </strong>
                    <span className="report-note-body">{note.body}</span>
                  </span>
                </label>
              ))}
              <label className="report-check">
                <input type="radio" name={`${id}-note`} checked={draft.noteChoice === 'new'} onChange={() => chooseNote('new')} />
                <span>Write a new note for this report</span>
              </label>
            </div>
            {draft.noteChoice === 'new' ? (
              <div className="stack">
                <Field label="New note for the report" hint="Saved as a report note, visible to the client and the doctor once shared.">
                  <Textarea rows={4} value={draft.newNote} onChange={(event) => set('newNote', event.target.value)} />
                </Field>
                <div>
                  <Button variant="secondary" onClick={writeNote} disabled={!draft.newNote.trim()}>
                    Save note and use it
                  </Button>
                </div>
              </div>
            ) : null}
            <Field label="Wording in the report" hint="This exact wording appears in the document. Editing it here doesn’t change the saved note.">
              <Textarea rows={5} value={draft.noteText} onChange={(event) => set('noteText', event.target.value)} />
            </Field>
          </fieldset>

          <fieldset className="report-fieldset">
            <legend>Recommendation</legend>
            <Field label="Your recommendation" hint="One plain sentence, shown first in the report.">
              <Textarea rows={3} value={draft.recommendation} onChange={(event) => set('recommendation', event.target.value)} />
            </Field>
          </fieldset>

          {showErrors && problems.length ? (
            <div className="report-errors" role="alert" tabIndex={-1} ref={errorsRef}>
              <p>
                <strong>Before asking {client.preferredName}:</strong>
              </p>
              <ul>
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="report-actions">
            {canAsk ? (
              <Button variant="gold" icon={<Send size={18} aria-hidden="true" />} onClick={() => save('ask')}>
                Ask {client.preferredName} to review
              </Button>
            ) : null}
            {canAsk || status === 'awaiting_consent' ? (
              <Button variant="secondary" icon={<Users size={18} aria-hidden="true" />} onClick={() => (canAsk ? save('together') : setTogether(true))}>
                {client.preferredName} is here — review together
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => save()} disabled={!dirty || rangeInvalid}>
              {saved ? 'Save changes' : 'Save draft'}
            </Button>
          </div>
        </form>

        {/* Focusable: on wide screens the preview scrolls on its own, and keyboard users must be able to scroll it. */}
        <section className="report-preview-pane" aria-labelledby={`${id}-preview`} tabIndex={0}>
          <div className="report-preview-head">
            <h2 className="title-md" id={`${id}-preview`}>
              Preview
            </h2>
            <p className="muted small">What {client.preferredName} and {draft.recipient.trim() ? recipientInSentence(draft.recipient, 'the') : 'the doctor'} will read.</p>
          </div>
          {/* Photographs appear only to someone the progress photos would show them to. */}
          <ReportPreview view={photoAccess.allowed ? preview : { ...preview, photos: null }} body={body} label="Live preview of the report" />
        </section>
      </div>

      <Modal open={confirming} onOpenChange={setConfirming} title="Progress photos">
        <ConfirmItsYou reason="Progress photos are private health records." onConfirmed={() => setConfirming(false)} />
      </Modal>

      <Dialog.Root open={together && saved !== undefined} onOpenChange={closeTogether}>
        <Dialog.Portal>
          <Dialog.Overlay className="report-sheet__overlay" />
          <Dialog.Content className="report-sheet" aria-describedby={undefined}>
            <div className="report-sheet__bar">
              <Dialog.Title className="report-sheet__title">Review with {client.preferredName}</Dialog.Title>
              <Dialog.Close className="icon-button" aria-label="Close review">
                <X size={20} aria-hidden="true" />
              </Dialog.Close>
            </div>
            <div className="report-sheet__body">
              {saved ? <ReportReview report={saved} mode="together" onClose={() => closeTogether(false)} /> : null}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
