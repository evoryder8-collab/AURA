import { LogOut, Settings } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { Badge } from '@/components/design-system/Badge'
import { Button } from '@/components/design-system/Button'
import { Card } from '@/components/design-system/Card'
import { Portrait } from '@/components/ui/Portrait'
import { clientAppointments, clientBonus } from '@/data/demo/selectors'
import { useDemoStore } from '@/data/demo/store'
import { therapistsForClient } from '@/data/demo/team'
import { useAuth } from '@/features/auth/auth-context'
import { ConsentSection } from '@/features/consent/ConsentSection'
import { ProgressPhotos } from '@/features/photos/ProgressPhotos'
import { ClientReportsList } from '@/features/reports/ClientReportsList'
import { ResetDemoData } from '@/features/settings/ResetDemoData'
import { fmtDate } from '@/lib/formatting/time'
import './me.css'

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`

export function MePage() {
  const auth = useAuth()
  const navigate = useNavigate()
  const clients = useDemoStore((state) => state.clients)
  const therapists = useDemoStore((state) => state.therapists)
  const appointments = useDemoStore((state) => state.appointments)
  const bonusCredits = useDemoStore((state) => state.bonusCredits)
  const client = clients.find((item) => item.id === auth.demoClientId)

  const signOut = async () => {
    await auth.signOut()
    navigate('/')
  }

  if (!client) {
    return (
      <div className="page">
        <div className="empty" role="alert">
          <strong>This profile is not available.</strong>
          <span>Sign out and choose a demo client again.</span>
          <Button variant="secondary" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    )
  }

  const team = therapistsForClient({ therapists, clients }, client.id)
  const completed = clientAppointments({ appointments }, client.id).filter(
    (item) => item.status === 'completed',
  )
  const bonus = clientBonus({ bonusCredits }, client.id)
  const nameOf = (therapistId: string) => therapists.find((item) => item.id === therapistId)

  return (
    <div className="page me-page">
      <header className="me-hero rise">
        <p className="eyebrow">Your profile</p>
        <h1 className="title-xl">{client.displayName}</h1>
        <div className="row row--wrap">
          <Badge tone="gold">Synthetic demo client</Badge>
          <span className="small muted">
            Known as {client.preferredName} · with AURA since {fmtDate(client.createdAt)}
          </span>
        </div>
      </header>

      <div className="me-columns">
        <div className="me-column">
          <Card as="section" title="Your care team" aria-label="Your care team">
            {team.length ? (
              <ul className="list me-team">
                {team.map((therapist) => {
                  const visits = completed.filter(
                    (item) => item.therapistId === therapist.id,
                  ).length
                  return (
                    <li key={therapist.id} className="me-team__member">
                      <Portrait
                        name={therapist.displayName}
                        portrait={therapist.portrait}
                        size="md"
                      />
                      <div className="me-team__copy">
                        <strong>{therapist.displayName}</strong>
                        <span className="small muted">{therapist.professionalTitle}</span>
                        <span className="small">{therapist.specialties.join(' · ')}</span>
                      </div>
                      <span className="me-team__visits small">
                        <span className="num">{plural(visits, 'visit', 'visits')}</span> together
                      </span>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="muted">No therapist is linked to your record yet.</p>
            )}
          </Card>

          <Card as="section" title="Free extra care" aria-label="Free extra care" tone="gold">
            <p className="me-bonus__total">
              <span className="num">+{bonus.lifetimeMinutes}</span>
              <span className="me-bonus__unit">
                free {bonus.lifetimeMinutes === 1 ? 'minute' : 'minutes'}
              </span>
            </p>
            <p className="small muted">
              Time your therapists added beyond what you booked, at no charge, across all your visits.
            </p>
            {bonus.byTherapist.length ? (
              <ul className="list me-bonus__list">
                {bonus.byTherapist.map((item) => {
                  const therapist = nameOf(item.therapistId)
                  const name = therapist?.displayName ?? 'A former therapist'
                  return (
                    <li key={item.therapistId} className="me-bonus__row">
                      <Portrait name={name} portrait={therapist?.portrait} size="xs" />
                      <span className="me-bonus__name">{name}</span>
                      <span className="small">
                        <strong className="num">{`${item.minutes}\u00a0min`}</strong>
                        <span className="muted">
                          {' '}
                          on {plural(item.visits, 'visit', 'visits')}
                        </span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="small muted">No extra time has been recorded yet.</p>
            )}
          </Card>

          {/* The reports list brings its own heading and explanation. */}
          <Card as="div">
            <ClientReportsList clientId={client.id} />
          </Card>
        </div>

        <div className="me-column">
          <ProgressPhotos client={client} />

          <Card as="section" title="Consent" aria-label="Consent">
            <p className="small muted me-section-lead">
              Choose what AURA may do with your records. You can change these at any time.
            </p>
            <ConsentSection client={client} />
          </Card>

          <Card as="section" title="Account and demo" aria-label="Account and demo">
            <div className="stack">
              <div className="row row--wrap">
                <Link className="button button--secondary button--md" to="/client/settings">
                  <Settings size={16} aria-hidden="true" /> Settings
                </Link>
                <Button
                  variant="ghost"
                  icon={<LogOut size={16} aria-hidden="true" />}
                  onClick={() => void signOut()}
                >
                  Sign out
                </Button>
              </div>
              <hr className="divider me-divider" />
              <ResetDemoData />
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
