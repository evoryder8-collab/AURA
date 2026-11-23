import { ArrowRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { DuskScene } from './DuskScene'
import { LightText } from './LightText'

const roles = [
  { role: 'client', label: 'I’m a client', detail: 'Log how you feel and see your visits' },
  {
    role: 'therapist',
    label: 'I’m a therapist',
    detail: 'Your day, your clients and each session',
  },
] as const

/** The way in: the scene animates behind, the two choices work from the first frame. */
export function EntrancePage() {
  return (
    <main id="main-content" className="portal">
      <DuskScene focus={[0.74, 0.72]} />
      <div className="portal__inner">
        <header className="portal__brand">
          <h1 className="portal__wordmark">
            <LightText text="AURA" delayMs={120} stepMs={110} />
          </h1>
          <p className="portal__line">Massage care, connected from one visit to the next.</p>
        </header>
        <nav className="portal__roles" aria-label="Sign in">
          {roles.map(({ role, label, detail }) => (
            <Link key={role} to={`/login/${role}`} className={`role-tile role-tile--${role}`}>
              <span className="role-tile__label">{label}</span>
              <span className="role-tile__detail">{detail}</span>
              <span className="role-tile__go" aria-hidden="true">
                <ArrowRight size={19} strokeWidth={2.2} />
              </span>
            </Link>
          ))}
        </nav>
      </div>
    </main>
  )
}
