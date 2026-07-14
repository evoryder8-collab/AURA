import { ArrowRight, BriefcaseBusiness, Heart, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { AuraRole } from '@/features/auth/auth-context'

const choices = [
  {
    role: 'therapist' as const,
    title: 'I am a Therapist',
    description: 'Manage your practice, sessions, clients, and professional records.',
    icon: BriefcaseBusiness,
    number: '01',
  },
  {
    role: 'client' as const,
    title: 'I am a Client',
    description: 'View your appointments, body journey, goals, and progress.',
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
        <p className="entrance__kicker">One calm space · two private experiences</p>
        <h1 id="entrance-title">
          How are you
          <br />
          entering today?
        </h1>
        <div className="role-choices">
          {choices.map(({ role, title, description, icon: Icon, number }) => (
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
              <span className="role-choice__arrow" aria-hidden="true">
                <ArrowRight size={20} />
              </span>
              {selected === role && <span className="role-choice__remembered">Last used</span>}
            </Link>
          ))}
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
