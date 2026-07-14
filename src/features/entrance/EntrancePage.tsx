import {
  ArrowRight,
  BriefcaseBusiness,
  Flower2,
  Heart,
  Leaf,
  ShieldCheck,
  Sparkles,
  Waves,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { AuraRole } from '@/features/auth/auth-context'

const choices = [
  {
    role: 'therapist' as const,
    title: 'I am a Therapist',
    description: 'Your clients, schedule, sessions, and progress—held in one calm workspace.',
    action: 'Enter practice',
    icon: BriefcaseBusiness,
    number: '01',
  },
  {
    role: 'client' as const,
    title: 'I am a Client',
    description:
      'Your appointments, care team, goals, and progress—easy to understand at a glance.',
    action: 'Enter personal space',
    icon: Heart,
    number: '02',
  },
]

export function EntrancePage() {
  const [selected, setSelected] = useState<AuraRole | null>(
    () => localStorage.getItem('aura-visual-role') as AuraRole | null,
  )

  useEffect(() => {
    if (selected) localStorage.setItem('aura-visual-role', selected)
  }, [selected])

  return (
    <main id="main-content" className="entrance">
      <div className="entrance__orb entrance__orb--one" />
      <div className="entrance__orb entrance__orb--two" />
      <div className="paradise-scene" aria-hidden="true">
        <div className="paradise-scene__sun">
          <Sparkles size={22} />
        </div>
        <div className="paradise-scene__halo paradise-scene__halo--one" />
        <div className="paradise-scene__halo paradise-scene__halo--two" />
        <span className="paradise-scene__leaf paradise-scene__leaf--one">
          <Leaf />
        </span>
        <span className="paradise-scene__leaf paradise-scene__leaf--two">
          <Leaf />
        </span>
        <span className="paradise-scene__leaf paradise-scene__leaf--three">
          <Leaf />
        </span>
        <div className="paradise-scene__lotus">
          <span />
          <Flower2 />
        </div>
        <div className="paradise-scene__water">
          <Waves />
          <i />
          <i />
          <i />
        </div>
      </div>
      <header className="entrance__header">
        <div className="entrance__wordmark">
          <span>
            <Sparkles size={16} />
          </span>
          AURA
        </div>
        <p>Private wellness, thoughtfully recorded.</p>
      </header>
      <section className="entrance__content" aria-labelledby="entrance-title">
        <div className="entrance__story">
          <p className="entrance__kicker">Private care · beautifully connected</p>
          <h1 id="entrance-title">
            Step into
            <br />
            your AURA.
          </h1>
          <p className="entrance__promise">
            A living wellness space where every visit, goal, and gentle improvement becomes easier
            to see.
          </p>
          <div className="entrance__assurances" aria-label="AURA experience qualities">
            <span>
              <ShieldCheck size={14} /> Private by design
            </span>
            <span>
              <Sparkles size={14} /> Clear from the first visit
            </span>
          </div>
        </div>
        <div className="entrance__choices">
          <p className="entrance__choice-label">
            <Sparkles size={14} /> Choose your private space
          </p>
          <div className="role-choices">
            {choices.map(({ role, title, description, action, icon: Icon, number }) => (
              <Link
                key={role}
                to={`/login/${role}`}
                className={`role-choice${selected === role ? ' is-remembered' : ''}`}
                onMouseEnter={() => setSelected(role)}
                onFocus={() => setSelected(role)}
                onClick={() => setSelected(role)}
              >
                <div className="role-choice__top">
                  <span>{number}</span>
                  <Icon size={21} />
                </div>
                <div>
                  <h2>{title}</h2>
                  <p>{description}</p>
                </div>
                <span className="role-choice__action">
                  {action} <ArrowRight size={16} />
                </span>
                {selected === role && <span className="role-choice__remembered">Last used</span>}
              </Link>
            ))}
          </div>
          <p className="entrance__next-step">Next: reveal your profile, then enter securely.</p>
        </div>
      </section>
      <footer className="entrance__footer">
        <span>Secure by design</span>
        <span>•</span>
        <span>Synthetic test environment</span>
      </footer>
    </main>
  )
}
