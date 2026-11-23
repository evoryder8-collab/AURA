import { CalendarDays, CircleUser, House, LayoutList, LogOut, Plus, Settings, TrendingUp, UsersRound } from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Portrait } from '@/components/ui/Portrait'
import { env } from '@/config/env'
import { useDemoStore } from '@/data/demo/store'
import { useAuth, type AuraRole } from '@/features/auth/auth-context'
import './shell.css'

type NavItem = { to: string; label: string; icon: typeof House }

function navFor(role: AuraRole): NavItem[] {
  if (role === 'therapist') {
    return env.demoMode
      ? [
          { to: '/therapist/today', label: 'Today', icon: LayoutList },
          { to: '/therapist/clients', label: 'Clients', icon: UsersRound },
          { to: '/therapist/calendar', label: 'Calendar', icon: CalendarDays },
          { to: '/therapist/settings', label: 'Settings', icon: Settings },
        ]
      : [
          { to: '/therapist/today', label: 'Today', icon: LayoutList },
          { to: '/therapist/clients', label: 'Clients', icon: UsersRound },
          { to: '/therapist/settings', label: 'Settings', icon: Settings },
        ]
  }
  return env.demoMode
    ? [
        { to: '/client/home', label: 'Home', icon: House },
        { to: '/client/progress', label: 'Progress', icon: TrendingUp },
        { to: '/client/visits', label: 'Visits', icon: CalendarDays },
        { to: '/client/me', label: 'Me', icon: CircleUser },
      ]
    : [
        { to: '/client/visits', label: 'Visits', icon: CalendarDays },
        { to: '/client/settings', label: 'Settings', icon: Settings },
      ]
}

export function AppShell({ role }: { role: AuraRole }) {
  const auth = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const therapist = useDemoStore((state) => state.therapists.find((item) => item.id === auth.demoTherapistId))
  const client = useDemoStore((state) => state.clients.find((item) => item.id === auth.demoClientId))
  const items = navFor(role)
  const canLog = role === 'client' && env.demoMode
  const [first, second, ...rest] = items
  const accountName = env.demoMode
    ? role === 'therapist'
      ? (therapist?.displayName ?? 'Therapist')
      : (client?.displayName ?? 'Client')
    : role === 'therapist'
      ? 'Signed-in therapist'
      : 'Signed-in client'

  const signOut = async () => {
    await auth.signOut()
    navigate('/')
  }

  const tab = ({ to, label, icon: Icon }: NavItem) => (
    <NavLink key={to} to={to} className={({ isActive }) => `tabbar__item${isActive ? ' is-active' : ''}`}>
      <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
      <span>{label}</span>
    </NavLink>
  )

  return (
    <div className={`shell shell--${role}`}>
      <aside className="rail" aria-label="Main">
        <NavLink to={items[0]?.to ?? '/'} className="rail__mark">
          <span className="wordmark">AURA</span>
          <span className="rail__space">{role === 'therapist' ? 'Practice' : 'Personal'}</span>
        </NavLink>
        {canLog ? (
          <NavLink to="/client/log" state={{ from: location.pathname }} className="rail__log">
            <Plus size={18} aria-hidden="true" /> Log how I feel
          </NavLink>
        ) : null}
        <nav className="rail__nav" aria-label={`${role === 'therapist' ? 'Practice' : 'Personal'} navigation`}>
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} className={({ isActive }) => `rail__item${isActive ? ' is-active' : ''}`}>
              <Icon size={20} strokeWidth={1.8} aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="rail__account">
          {role === 'therapist' ? <Portrait name={accountName} portrait={therapist?.portrait} size="sm" /> : null}
          <div className="rail__who">
            <strong>{accountName}</strong>
            <span>{env.demoMode ? 'Synthetic demo account' : 'Protected session'}</span>
          </div>
          <button type="button" className="icon-button" aria-label="Sign out" onClick={() => void signOut()}>
            <LogOut size={18} aria-hidden="true" />
          </button>
        </div>
      </aside>

      <main id="main-content" className="shell__main">
        <Outlet />
      </main>

      <nav className={`tabbar${canLog ? ' tabbar--with-log' : ''}`} aria-label="Main">
        {canLog && first && second ? (
          <>
            {tab(first)}
            {tab(second)}
            <NavLink
              to="/client/log"
              state={{ from: location.pathname }}
              className={({ isActive }) => `tabbar__log${isActive ? ' is-active' : ''}`}
            >
              <span className="tabbar__log-orb" aria-hidden="true">
                <Plus size={26} strokeWidth={2.2} />
              </span>
              <span>Log how I feel</span>
            </NavLink>
            {rest.map(tab)}
          </>
        ) : (
          items.map(tab)
        )}
      </nav>
    </div>
  )
}
