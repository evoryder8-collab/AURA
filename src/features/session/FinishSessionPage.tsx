import { ArrowLeft, Check, Minus, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { Button } from '@/components/design-system/Button'
import { Input, Select, Textarea } from '@/components/design-system/FormField'
import { ScoreScale } from '@/components/ui/ScoreScale'
import { Segmented } from '@/components/ui/Segmented'
import {
  ROM_METHOD_LABEL,
  ROM_MOVEMENTS,
  areaLabel,
  bonusCreditId,
  bonusSummary,
  maxBonusMinutes,
  type BonusCredit,
  type NoteVisibility,
  type RomMethod,
  type RomMovement,
} from '@/domain/care'
import { suggestBonusCareMinutes } from '@/domain/rules'
import { getAppointment, getClient, getTherapist, sessionPointsFor } from '@/data/demo/selectors'
import { useDemoStore } from '@/data/demo/store'
import { useAuth } from '@/features/auth/auth-context'
import { bonusSentence, latestBonusCredit } from '@/features/client-home/bonusSentence'
import { fmtTime, minutesLabel } from '@/lib/formatting/time'
import './session.css'
import './finish.css'

export function FinishSessionPage() {
  const { appointmentId } = useParams()
  const auth = useAuth()
  const navigate = useNavigate()
  const state = useDemoStore()
  const appointment = getAppointment(state, appointmentId)
  const client = getClient(state, appointment?.clientId)
  const therapist = getTherapist(state, appointment?.therapistId)
  const summary = appointment?.session?.summary
  const confirmed = state.bonusCredits.find((credit) => credit.id === bonusCreditId(appointment?.id ?? ''))
  const limit = summary ? maxBonusMinutes(summary) : 0
  // Seeded by the documented threshold rule: under 3 extra minutes suggests 0, and it can be raised.
  const [chosen, setMinutes] = useState(() =>
    summary ? suggestBonusCareMinutes(summary.actualMinutes, summary.bookedMinutes).suggestedConfirmationMinutes : 0,
  )
  const minutes = Math.min(chosen, limit)
  const [stiffness, setStiffness] = useState<Record<string, number | null>>({})
  const [rom, setRom] = useState<{ movement: RomMovement; side: 'left' | 'right'; degrees: string; method: RomMethod }>({
    movement: 'neck_rotation',
    side: 'left',
    degrees: '',
    method: 'goniometer',
  })
  const [note, setNote] = useState('')
  const [visibility, setVisibility] = useState<NoteVisibility>('private')
  const [saved, setSaved] = useState<string[]>([])

  if (!appointment || appointment.therapistId !== auth.demoTherapistId) {
    return (
      <div className="page">
        <p className="empty">This session isn’t available to you.</p>
      </div>
    )
  }
  if (!summary) return <Navigate to={`/therapist/session/${appointment.id}`} replace />

  const points = sessionPointsFor(state, appointment)
  // The client's home sentence, built by the same calls from the ledger as it will be once confirmed.
  const draft: BonusCredit = {
    id: bonusCreditId(appointment.id),
    appointmentId: appointment.id,
    clientId: appointment.clientId,
    therapistId: appointment.therapistId,
    minutes,
    bookedMinutes: summary.bookedMinutes,
    actualMinutes: summary.actualMinutes,
    visitDate: appointment.session?.startedAt ?? appointment.startsAt,
    confirmedAt: new Date().toISOString(),
  }
  const ledger = bonusSummary(confirmed ? state.bonusCredits : [...state.bonusCredits, draft], appointment.clientId)
  const shown = latestBonusCredit(ledger)
  const shownTherapist = getTherapist(state, shown?.therapistId)
  const preview = shown && shownTherapist ? bonusSentence(shown, ledger, shownTherapist, Date.now()) : ''

  const saveMeasures = () => {
    const done: string[] = []
    for (const point of points) {
      const value = stiffness[point.area]
      if (value !== undefined && value !== null) {
        state.recordStiffness(appointment.id, point.area, value)
        done.push(`${areaLabel(point.region, point.side)} stiffness ${value}/10`)
      }
    }
    const degrees = Number(rom.degrees)
    if (rom.degrees && Number.isFinite(degrees) && degrees >= 0 && degrees <= 200) {
      state.recordRom({ appointmentId: appointment.id, movement: rom.movement, side: rom.side, degrees, method: rom.method })
      done.push(`${rom.side === 'left' ? 'Left' : 'Right'} ${ROM_MOVEMENTS[rom.movement].label.toLocaleLowerCase()} ${degrees}°`)
      setRom((current) => ({ ...current, degrees: '' }))
    }
    if (note.trim() && client && therapist) {
      state.addNote({ clientId: client.id, therapistId: therapist.id, visibility, body: note, appointmentId: appointment.id })
      done.push(visibility === 'private' ? 'Private note' : 'Note for a doctor’s report')
      setNote('')
    }
    setSaved(done)
  }

  return (
    <div className="page finish">
      <Link to="/therapist/today" className="back-link">
        <ArrowLeft size={18} aria-hidden="true" /> Today
      </Link>
      <header>
        <p className="eyebrow">
          {client?.displayName} · {fmtTime(appointment.session?.startedAt ?? appointment.startsAt)}–
          {fmtTime(appointment.session?.finishedAt ?? Date.now())}
        </p>
        <h1 className="title-lg">Session time</h1>
      </header>

      <section className="finish__times" aria-label="Session time">
        <div>
          <span className="eyebrow">Booked</span>
          <strong className="num">{summary.bookedMinutes}</strong>
          <span>minutes</span>
        </div>
        <div>
          <span className="eyebrow">Actual</span>
          <strong className="num">{summary.actualMinutes}</strong>
          <span>minutes</span>
        </div>
        <div className="is-extra">
          <span className="eyebrow">Extra</span>
          <strong className="num">{summary.extraMinutes}</strong>
          <span>minutes</span>
        </div>
      </section>

      <section className="finish__bonus card card--gold" aria-labelledby="bonus-title">
        <h2 id="bonus-title" className="title-md">
          Bonus Care minutes
        </h2>
        {confirmed ? (
          <p className="finish__confirmed" role="status">
            <Check size={18} aria-hidden="true" /> {minutesLabel(confirmed.minutes)} confirmed for {client?.preferredName}. This visit counts once.
          </p>
        ) : (
          <>
            <p className="muted">Confirm the extra time you gave, or adjust it.</p>
            <div className="finish__stepper">
              <button type="button" className="icon-button" aria-label="One minute less" onClick={() => setMinutes(Math.max(0, minutes - 1))}>
                <Minus size={20} aria-hidden="true" />
              </button>
              <label>
                <span className="visually-hidden">Bonus Care minutes</span>
                <input
                  className="input num"
                  inputMode="numeric"
                  value={minutes}
                  onChange={(event) => {
                    const value = Number(event.target.value.replace(/\D/g, ''))
                    setMinutes(Number.isFinite(value) ? Math.min(limit, value) : 0)
                  }}
                />
              </label>
              <button type="button" className="icon-button" aria-label="One minute more" onClick={() => setMinutes(Math.min(limit, minutes + 1))}>
                <Plus size={20} aria-hidden="true" />
              </button>
            </div>
            <Button size="lg" fullWidth onClick={() => state.confirmBonus(appointment.id, minutes)}>
              Confirm {minutesLabel(minutes)}
            </Button>
            <Button variant="ghost" fullWidth onClick={() => {
                state.resumeSession(appointment.id)
                navigate(`/therapist/session/${appointment.id}`)
              }}>
              Finished by mistake? Resume the session
            </Button>
          </>
        )}
        {preview ? (
          <div className="finish__preview">
            <span className="eyebrow">{confirmed ? `${client?.preferredName} sees` : `${client?.preferredName} will see`}</span>
            <p>{preview}</p>
          </div>
        ) : null}
      </section>

      <section className="card finish__measures" aria-labelledby="measures-title">
        <h2 id="measures-title" className="title-md">
          Quick measures <span className="muted small">optional</span>
        </h2>
        {points.map((point) => (
          <div key={point.area} className="field">
            <span className="field__label">{areaLabel(point.region, point.side)} — stiffness by palpation</span>
            <ScoreScale
              label={`${areaLabel(point.region, point.side)} stiffness, 0 to 10`}
              value={stiffness[point.area] ?? null}
              onChange={(value) => setStiffness((current) => ({ ...current, [point.area]: value }))}
              lowLabel="Supple"
              highLabel="Very stiff"
              tone="ease"
            />
          </div>
        ))}
        <fieldset className="finish__rom">
          <legend className="field__label">Range of motion</legend>
          <Select value={rom.movement} onChange={(event) => setRom((current) => ({ ...current, movement: event.target.value as RomMovement }))} aria-label="Movement">
            {(Object.keys(ROM_MOVEMENTS) as RomMovement[]).map((movement) => (
              <option key={movement} value={movement}>
                {ROM_MOVEMENTS[movement].label}
              </option>
            ))}
          </Select>
          <Segmented label="Side measured" value={rom.side} onChange={(side) => setRom((current) => ({ ...current, side }))} options={[{ value: 'left', label: 'Left' }, { value: 'right', label: 'Right' }]} />
          <label className="finish__degrees">
            <Input inputMode="numeric" value={rom.degrees} placeholder="e.g. 55" aria-label="Degrees" onChange={(event) => setRom((current) => ({ ...current, degrees: event.target.value.replace(/[^\d]/g, '').slice(0, 3) }))} />
            <span aria-hidden="true">°</span>
          </label>
          <Select value={rom.method} onChange={(event) => setRom((current) => ({ ...current, method: event.target.value as RomMethod }))} aria-label="Measurement method">
            {(Object.keys(ROM_METHOD_LABEL) as RomMethod[]).map((method) => (
              <option key={method} value={method}>
                {ROM_METHOD_LABEL[method]}
              </option>
            ))}
          </Select>
        </fieldset>
        <div className="field">
          <span className="field__label">Session note</span>
          <Segmented
            label="Who the note is for"
            value={visibility}
            onChange={setVisibility}
            options={[
              { value: 'private', label: 'Private working note' },
              { value: 'report', label: 'For a doctor’s report' },
            ]}
          />
          <Textarea value={note} rows={3} maxLength={1200} onChange={(event) => setNote(event.target.value)} aria-label="Session note" />
          <span className="field__hint">
            {visibility === 'private'
              ? 'Private notes stay inside the practice and never appear in a report.'
              : 'Notes for a report can be chosen and edited when you prepare one; nothing is shared without the client’s consent.'}
          </span>
        </div>
        <Button variant="secondary" onClick={saveMeasures}>
          Save measures and note
        </Button>
        {saved.length ? (
          <p className="finish__saved" role="status">
            Saved: {saved.join(' · ')}
          </p>
        ) : null}
      </section>

      <Button size="lg" variant={confirmed ? 'primary' : 'ghost'} onClick={() => navigate('/therapist/today')} disabled={!confirmed}>
        {confirmed ? 'Done' : 'Confirm Bonus Care minutes to finish'}
      </Button>
    </div>
  )
}
