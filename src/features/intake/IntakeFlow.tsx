import { ArrowLeft, ArrowRight, Check, Plus, Save, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { differenceInYears, isValid, parseISO } from 'date-fns'
import { Button } from '@/components/design-system/Button'
import { Field, Input, Select, Textarea } from '@/components/design-system/FormField'
import { Modal } from '@/components/design-system/Modal'
import { useDemoStore } from '@/data/demo/store'
import type { IntakeDraft } from '@/data/demo/model'
import { BodyMap } from '@/features/body-map/BodyMap'
import { FlowerPicker } from '@/features/body-map/FlowerPicker'

const steps = [
  'Identity',
  'Health profile',
  'Recent procedures',
  'Medications',
  'Restrictions',
  'Functional goals',
  'Body map',
  'Consent',
  'Review',
]

const consentChoices: Array<[keyof ConsentValues, string, string]> = [
  [
    'healthData',
    'Store relevant health and treatment records',
    'Required to use the connected treatment workflow',
  ],
  ['photography', 'Progress photography', 'Optional · private storage and fresh authentication'],
  ['reminders', 'Appointment and follow-up reminders', 'Optional · in-app only in this test build'],
  ['handoff', 'Professional handoff sharing', 'Optional · reviewed again before every handoff'],
  ['aiProcessing', 'AI-assisted narration', 'Optional · pattern logic remains deterministic'],
]

type ConsentValues = {
  healthData: boolean
  photography: boolean
  reminders: boolean
  handoff: boolean
  aiProcessing: boolean
}

type AdditionalGoal = NonNullable<IntakeDraft['additionalGoals']>[number]

export function IntakeFlow({
  open,
  onOpenChange,
  clientId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId: string
}) {
  const client = useDemoStore((state) => state.clients.find((item) => item.id === clientId))
  const completeIntake = useDemoStore((state) => state.completeIntake)
  const saveIntakeDraft = useDemoStore((state) => state.saveIntakeDraft)
  const updateConsent = useDemoStore((state) => state.updateConsent)
  const draft = client?.intakeDraft
  const [step, setStep] = useState(draft?.step ?? 0)
  const [name, setName] = useState(draft?.preferredName ?? client?.preferredName ?? '')
  const [email, setEmail] = useState(draft?.email ?? client?.email ?? '')
  const [phone, setPhone] = useState(draft?.phone ?? client?.phone ?? '')
  const [dob, setDob] = useState(draft?.dateOfBirth ?? client?.dateOfBirth ?? '')
  const [healthNotes, setHealthNotes] = useState(draft?.healthNotes ?? '')
  const [healthFlags, setHealthFlags] = useState<string[]>(draft?.healthFlags ?? [])
  const [procedure, setProcedure] = useState<'no' | 'yes'>(draft?.hasRecentProcedure ? 'yes' : 'no')
  const [procedureRegion, setProcedureRegion] = useState(draft?.procedureRegion ?? 'right_shoulder')
  const [procedureType, setProcedureType] = useState(draft?.procedureType ?? '')
  const [procedureDate, setProcedureDate] = useState(draft?.procedureDate ?? '')
  const [clearance, setClearance] = useState(draft?.clearance ?? 'not_required')
  const [medications, setMedications] = useState(draft?.medications ?? '')
  const [restrictions, setRestrictions] = useState(draft?.restrictions ?? '')
  const [goal, setGoal] = useState(draft?.goalWording ?? 'Move through my day with more ease')
  const [goalCategory, setGoalCategory] = useState(draft?.goalCategory ?? 'Daily activity')
  const [goalScore, setGoalScore] = useState(draft?.goalScore ?? 4)
  const [additionalGoals, setAdditionalGoals] = useState<AdditionalGoal[]>(
    draft?.additionalGoals ?? [],
  )
  const [regions, setRegions] = useState<string[]>(draft?.bodyRegions ?? ['lower_back'])
  const [pain, setPain] = useState(draft?.painScore ?? 4)
  const [consents, setConsents] = useState<ConsentValues>(
    draft?.consents ?? {
      healthData: true,
      photography: false,
      reminders: true,
      handoff: false,
      aiProcessing: false,
    },
  )
  const [guardianName, setGuardianName] = useState(draft?.guardianName ?? '')
  const [guardianRelationship, setGuardianRelationship] = useState(
    draft?.guardianRelationship ?? '',
  )
  const [guardianConfirmed, setGuardianConfirmed] = useState(draft?.guardianConfirmed ?? false)

  const title = useMemo(() => `${step + 1}. ${steps[step]}`, [step])

  const parsedDob = parseISO(dob)
  const guardianReviewRequired = isValid(parsedDob) && differenceInYears(new Date(), parsedDob) < 18
  const guardianReady =
    !guardianReviewRequired ||
    (guardianConfirmed && Boolean(guardianName.trim()) && Boolean(guardianRelationship.trim()))
  const canFinish =
    consents.healthData &&
    Boolean(name.trim()) &&
    Boolean(dob) &&
    Boolean(goal.trim()) &&
    additionalGoals.every((item) => Boolean(item.wording.trim())) &&
    guardianReady

  const buildDraft = (savedStep = step): IntakeDraft => ({
    step: savedStep,
    preferredName: name.trim(),
    email: email.trim(),
    phone: phone.trim(),
    dateOfBirth: dob,
    healthNotes: healthNotes.trim(),
    healthFlags,
    hasRecentProcedure: procedure === 'yes',
    procedureRegion,
    procedureType: procedureType.trim(),
    procedureDate,
    clearance,
    medications: medications.trim(),
    restrictions: restrictions.trim(),
    goalWording: goal.trim(),
    goalCategory,
    goalScore,
    additionalGoals,
    bodyRegions: regions,
    painScore: pain,
    consents,
    guardianName: guardianName.trim(),
    guardianRelationship: guardianRelationship.trim(),
    guardianConfirmed,
    savedAt: new Date().toISOString(),
  })

  const moveToStep = (nextStep: number) => {
    saveIntakeDraft(clientId, buildDraft(nextStep))
    setStep(nextStep)
  }

  const closeAndSave = () => {
    saveIntakeDraft(clientId, buildDraft(step))
    onOpenChange(false)
  }

  const toggleHealthFlag = (flag: string, checked: boolean) => {
    setHealthFlags((values) =>
      checked ? [...new Set([...values, flag])] : values.filter((value) => value !== flag),
    )
  }

  const updateAdditionalGoal = (index: number, patch: Partial<AdditionalGoal>) => {
    setAdditionalGoals((items) =>
      items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    )
  }

  const finish = () => {
    const goalInputs: AdditionalGoal[] = [
      {
        category: goalCategory,
        wording: goal,
        score: goalScore,
        region: regions[0] ?? 'not_specified',
      },
      ...additionalGoals,
    ]
    const goalRecords = goalInputs.map((item, index) => ({
      id: `goal-${clientId}-${Date.now()}-${index + 1}`,
      category: item.category,
      wording: item.wording,
      region: item.region,
      baseline: item.score,
      current: item.score,
      importance: 'very_important' as const,
      targetDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 42).toISOString(),
      status: 'active' as const,
    }))
    const completed = buildDraft(steps.length - 1)
    completeIntake(clientId, client?.goals.length ? undefined : goalRecords, completed)
    Object.entries(consents).forEach(([key, value]) =>
      updateConsent(clientId, key as keyof typeof consents, value),
    )
    onOpenChange(false)
  }

  const content = [
    <div className="form-stack" key="identity">
      <div className="form-grid">
        <Field label="Preferred name">
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field
          label="Date of birth"
          hint="Guardian requirements must be reviewed if the person is under the applicable age."
        >
          <Input type="date" value={dob} onChange={(event) => setDob(event.target.value)} />
        </Field>
      </div>
      <div className="form-grid">
        <Field label="Email">
          <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </Field>
        <Field label="Phone">
          <Input value={phone} onChange={(event) => setPhone(event.target.value)} />
        </Field>
      </div>
      {guardianReviewRequired && (
        <div className="form-stack guardian-review">
          <p className="scope-note">
            A guardian review is required for this synthetic workflow. Local rules and identity
            still require professional verification.
          </p>
          <div className="form-grid">
            <Field label="Guardian name">
              <Input
                value={guardianName}
                onChange={(event) => setGuardianName(event.target.value)}
              />
            </Field>
            <Field label="Relationship">
              <Input
                value={guardianRelationship}
                onChange={(event) => setGuardianRelationship(event.target.value)}
              />
            </Field>
          </div>
          <label className="consent-row">
            <span>
              <strong>Guardian participation recorded</strong>
              <small>This confirms only the test workflow step, not legal sufficiency.</small>
            </span>
            <input
              type="checkbox"
              checked={guardianConfirmed}
              onChange={(event) => setGuardianConfirmed(event.target.checked)}
            />
          </label>
        </div>
      )}
    </div>,
    <div className="form-stack" key="health">
      <p className="intake-prompt">
        Share only information that is relevant to receiving care today.
      </p>
      <Field label="Relevant health profile" hint="Synthetic text only in this build.">
        <Textarea
          value={healthNotes}
          onChange={(event) => setHealthNotes(event.target.value)}
          placeholder="For example: sensitivities, conditions, or changes to discuss…"
        />
      </Field>
      <div className="choice-chips">
        {[
          ['pregnancy', 'Pregnancy relevant'],
          ['anticoagulant', 'Anticoagulant recorded'],
          ['skin', 'Skin condition to discuss'],
          ['allergy', 'Allergy to discuss'],
        ].map(([value, label]) => (
          <label key={value}>
            <input
              type="checkbox"
              checked={healthFlags.includes(value ?? '')}
              onChange={(event) => toggleHealthFlag(value ?? '', event.target.checked)}
            />{' '}
            {label}
          </label>
        ))}
      </div>
    </div>,
    <div className="form-stack" key="procedures">
      <p className="intake-prompt">Have you had a recent procedure relevant to this session?</p>
      <div className="large-choice">
        <button
          className={procedure === 'no' ? 'is-active' : ''}
          onClick={() => setProcedure('no')}
        >
          No
        </button>
        <button
          className={procedure === 'yes' ? 'is-active' : ''}
          onClick={() => setProcedure('yes')}
        >
          Yes
        </button>
      </div>
      {procedure === 'yes' && (
        <div className="form-grid">
          <Field label="Body region">
            <Select
              value={procedureRegion}
              onChange={(event) => setProcedureRegion(event.target.value)}
            >
              <option value="right_shoulder">Right shoulder</option>
              <option value="lower_back">Lower back</option>
              <option value="left_knee">Left knee</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <Field label="Procedure type">
            <Input
              value={procedureType}
              onChange={(event) => setProcedureType(event.target.value)}
              placeholder="Synthetic description"
            />
          </Field>
          <Field label="Approximate date">
            <Input
              type="date"
              value={procedureDate}
              onChange={(event) => setProcedureDate(event.target.value)}
            />
          </Field>
          <Field label="Clearance">
            <Select value={clearance} onChange={(event) => setClearance(event.target.value)}>
              <option value="not_required">Not required</option>
              <option value="confirmed">Confirmed</option>
              <option value="missing">Not yet confirmed</option>
            </Select>
          </Field>
        </div>
      )}
    </div>,
    <div className="form-stack" key="medications">
      <p className="intake-prompt">Record only medications relevant to safe session planning.</p>
      <Field
        label="Relevant medication details"
        hint="Do not stop or alter medication based on this application."
      >
        <Textarea
          value={medications}
          onChange={(event) => setMedications(event.target.value)}
          placeholder="Name and relevance, or ‘None to add’"
        />
      </Field>
    </div>,
    <div className="form-stack" key="restrictions">
      <p className="intake-prompt">Are there areas or approaches to avoid until reviewed?</p>
      <Field label="Conditions or restrictions">
        <Textarea
          value={restrictions}
          onChange={(event) => setRestrictions(event.target.value)}
          placeholder="Describe the recorded fact, clearance, or stated restriction…"
        />
      </Field>
      <p className="scope-note">
        AURA records supplied information. It does not diagnose or invent restrictions.
      </p>
    </div>,
    <div className="form-stack" key="goals">
      <p className="intake-prompt">What would you most like to feel more possible?</p>
      <Field label="Goal category">
        <Select value={goalCategory} onChange={(event) => setGoalCategory(event.target.value)}>
          <option>Daily activity</option>
          <option>Sport & recreation</option>
          <option>Work activity</option>
          <option>Sleep & rest</option>
          <option>Mobility</option>
          <option>Other</option>
        </Select>
      </Field>
      <Field label="In your own words">
        <Textarea value={goal} onChange={(event) => setGoal(event.target.value)} />
      </Field>
      <FlowerPicker
        label="How possible does this feel today?"
        value={goalScore}
        onChange={setGoalScore}
      />
      {additionalGoals.map((item, index) => (
        <div className="additional-goal" key={`additional-goal-${index + 1}`}>
          <div className="additional-goal__head">
            <strong>Additional goal {index + 2}</strong>
            <button
              type="button"
              className="icon-button"
              aria-label={`Remove goal ${index + 2}`}
              onClick={() =>
                setAdditionalGoals((items) => items.filter((_, itemIndex) => itemIndex !== index))
              }
            >
              <Trash2 size={16} />
            </button>
          </div>
          <div className="form-grid">
            <Field label={`Goal ${index + 2} category`}>
              <Select
                value={item.category}
                onChange={(event) => updateAdditionalGoal(index, { category: event.target.value })}
              >
                <option>Daily activity</option>
                <option>Sport & recreation</option>
                <option>Work activity</option>
                <option>Sleep & rest</option>
                <option>Mobility</option>
                <option>Other</option>
              </Select>
            </Field>
            <Field label={`Goal ${index + 2} body region`}>
              <Select
                value={item.region}
                onChange={(event) => updateAdditionalGoal(index, { region: event.target.value })}
              >
                <option value="general">General</option>
                <option value="upper_back">Upper back</option>
                <option value="lower_back">Lower back</option>
                <option value="left_hip">Left hip</option>
                <option value="right_shoulder">Right shoulder</option>
              </Select>
            </Field>
          </div>
          <Field label={`Goal ${index + 2} in your own words`}>
            <Textarea
              value={item.wording}
              onChange={(event) => updateAdditionalGoal(index, { wording: event.target.value })}
            />
          </Field>
          <FlowerPicker
            label={`How possible does goal ${index + 2} feel today?`}
            value={item.score}
            onChange={(score) => updateAdditionalGoal(index, { score })}
          />
        </div>
      ))}
      {additionalGoals.length < 2 && (
        <Button
          variant="secondary"
          icon={<Plus size={16} />}
          onClick={() =>
            setAdditionalGoals((items) => [
              ...items,
              { wording: '', category: 'Daily activity', score: 4, region: 'general' },
            ])
          }
        >
          Add another goal
        </Button>
      )}
    </div>,
    <div className="intake-body-map" key="body">
      <div>
        <p className="intake-prompt">Where would you like attention today?</p>
        <p className="microcopy">
          Choose a region on the front or back. Every target is keyboard and touch accessible.
        </p>
        <BodyMap value={regions} onChange={setRegions} />
      </div>
      <FlowerPicker value={pain} onChange={setPain} />
    </div>,
    <div className="form-stack" key="consent">
      <p className="intake-prompt">Choose what you consent to in this test workflow.</p>
      {consentChoices.map(([key, label, description]) => (
        <label className="consent-row" key={key}>
          <span>
            <strong>{label}</strong>
            <small>{description}</small>
          </span>
          <input
            type="checkbox"
            checked={consents[key]}
            onChange={(event) => setConsents({ ...consents, [key]: event.target.checked })}
          />
        </label>
      ))}
    </div>,
    <div className="review-sheet" key="review">
      <div className="review-sheet__mark">
        <Check size={24} />
      </div>
      <p className="eyebrow">Ready for therapist review</p>
      <h3>{name || 'Demo client'}’s intake</h3>
      <dl>
        <div>
          <dt>{additionalGoals.length > 0 ? 'Goals' : 'Goal'}</dt>
          <dd>
            {[{ wording: goal, score: goalScore }, ...additionalGoals]
              .map((item) => `${item.wording} · ${item.score}/10`)
              .join(' • ')}
          </dd>
        </div>
        <div>
          <dt>Body focus</dt>
          <dd>{regions.join(', ').replaceAll('_', ' ') || 'None selected'}</dd>
        </div>
        <div>
          <dt>Current rating</dt>
          <dd>{pain}/10</dd>
        </div>
        <div>
          <dt>Procedure</dt>
          <dd>
            {procedure === 'yes'
              ? `${procedureRegion.replaceAll('_', ' ')} · clearance ${clearance}`
              : 'None recorded'}
          </dd>
        </div>
        <div>
          <dt>Relevant details</dt>
          <dd>
            {[healthNotes, medications, restrictions].filter(Boolean).length} structured section(s)
            recorded
          </dd>
        </div>
        <div>
          <dt>Health-data consent</dt>
          <dd>{consents.healthData ? 'Granted' : 'Not granted'}</dd>
        </div>
        {guardianReviewRequired && (
          <div>
            <dt>Guardian review</dt>
            <dd>
              {guardianConfirmed
                ? `${guardianName} · ${guardianRelationship}`
                : 'Required before confirmation'}
            </dd>
          </div>
        )}
      </dl>
      <p className="scope-note">
        This structured intake supports therapist judgment. It is not a diagnosis or
        jurisdiction-specific legal determination.
      </p>
    </div>,
  ][step]

  return (
    <Modal
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) closeAndSave()
      }}
      title={title ?? 'Intake'}
      description="First-visit intake · progress is saved to this synthetic device until confirmation."
      wide
    >
      <div className="intake-progress" aria-label={`Step ${step + 1} of ${steps.length}`}>
        <span style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
      </div>
      <ol className="intake-steps" aria-label="Intake sections">
        {steps.map((item, index) => (
          <li
            key={item}
            className={index === step ? 'is-current' : index < step ? 'is-complete' : ''}
          >
            <span>{index < step ? <Check size={12} /> : index + 1}</span>
            <small>{item}</small>
          </li>
        ))}
      </ol>
      <div className="intake-content">{content}</div>
      <div className="form-actions intake-actions">
        <Button variant="ghost" icon={<Save size={16} />} onClick={closeAndSave}>
          Save & close
        </Button>
        {step > 0 && (
          <Button
            variant="secondary"
            icon={<ArrowLeft size={16} />}
            onClick={() => moveToStep(step - 1)}
          >
            Back
          </Button>
        )}
        {step < steps.length - 1 ? (
          <Button iconAfter={<ArrowRight size={16} />} onClick={() => moveToStep(step + 1)}>
            Continue
          </Button>
        ) : (
          <Button icon={<Check size={16} />} disabled={!canFinish} onClick={finish}>
            Confirm intake
          </Button>
        )}
      </div>
    </Modal>
  )
}
