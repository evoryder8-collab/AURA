import { NavLink } from 'react-router-dom'
import {
  CalendarDays,
  CircleUserRound,
  Clock3,
  History,
  House,
  LayoutList,
  Settings,
  Sparkles,
  TrendingUp,
  UsersRound,
} from 'lucide-react'
import { env } from '@/config/env'
import { useDemoStore } from '@/data/demo/store'
import { useAuth } from '@/features/auth/auth-context'
import type { AuraRole } from '@/features/auth/auth-context'

type NavItem = {
  to: string
  label: string
  icon: typeof LayoutList
  primary?: boolean
}

const therapistItemsBeforeSession: NavItem[] = [
  { to: '/therapist/today', label: 'Today', icon: LayoutList, primary: true },
  { to: '/therapist/clients', label: 'Clients', icon: UsersRound, primary: true },
]

const therapistItemsAfterSession: NavItem[] = [
  { to: '/therapist/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/therapist/settings', label: 'Settings', icon: Settings },
]

const clientItems: NavItem[] = [
  { to: '/client/home', label: 'Home', icon: House, primary: true },
  { to: '/client/progress', label: 'Progress', icon: TrendingUp, primary: true },
  { to: '/client/appointments', label: 'Appointments', icon: CalendarDays, primary: true },
  { to: '/client/history', label: 'History', icon: History },
  { to: '/client/settings', label: 'Settings', icon: Settings },
]

const connectedClientItems: NavItem[] = [
  { to: '/client/appointments', label: 'Appointments', icon: CalendarDays, primary: true },
  { to: '/client/settings', label: 'Settings', icon: Settings, primary: true },
]

export function PortalNav({ role }: { role: AuraRole }) {
  const auth = useAuth()
  const demoTherapist = useDemoStore((state) =>
    state.therapists.find((therapist) => therapist.id === auth.demoTherapistId),
  )
  const demoClient = useDemoStore((state) =>
    state.clients.find((client) => client.id === auth.demoClientId),
  )
  const activeDemoSessionId = useDemoStore(
    (state) =>
      state.appointments.find(
        (appointment) =>
          appointment.status === 'confirmed' &&
          !appointment.session?.finishedAt &&
          appointment.therapistId === auth.demoTherapistId,
      )?.id,
  )
  const therapistItems: NavItem[] = [
    ...therapistItemsBeforeSession,
    ...(env.demoMode && activeDemoSessionId
      ? [
          {
            to: `/therapist/session/${activeDemoSessionId}`,
            label: 'Session',
            icon: Clock3,
            primary: true,
          },
        ]
      : []),
    ...therapistItemsAfterSession,
  ]
  const connectedTherapistItems: NavItem[] = [
    ...therapistItemsBeforeSession,
    { to: '/therapist/settings', label: 'Settings', icon: Settings, primary: true },
  ]
  const items =
    role === 'therapist'
      ? env.demoMode
        ? therapistItems
        : connectedTherapistItems
      : env.demoMode
        ? clientItems
        : connectedClientItems
  const accountLabel = env.demoMode
    ? role === 'therapist'
      ? (demoTherapist?.displayName.replace(' — fictional demo', '') ?? 'Demo Therapist')
      : (demoClient?.preferredName ?? 'Demo Client')
    : role === 'therapist'
      ? 'Authenticated therapist'
      : 'Authenticated client'
  const sessionLabel = env.demoMode
    ? role === 'therapist'
      ? (demoTherapist?.professionalTitle ?? 'Synthetic team account')
      : 'Synthetic client account'
    : auth.user
      ? 'Protected session'
      : 'Session unavailable'
  return (
    <>
      <aside className="portal-sidebar" aria-label={`${role} navigation`}>
        <NavLink
          to={
            role === 'therapist'
              ? '/therapist/today'
              : env.demoMode
                ? '/client/home'
                : '/client/appointments'
          }
          className="wordmark"
        >
          <span className="wordmark__halo">
            <Sparkles size={14} />
          </span>
          <span>AURA</span>
        </NavLink>
        <p className="portal-sidebar__role">
          {role === 'therapist' ? 'Practice portal' : 'Personal portal'}
        </p>
        <nav className="portal-nav">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              aria-label={label}
              className={({ isActive }) => `portal-nav__item${isActive ? ' is-active' : ''}`}
            >
              <Icon size={19} /> <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="portal-sidebar__footer">
          <CircleUserRound size={19} />
          <div>
            <strong>{accountLabel}</strong>
            <span>{sessionLabel}</span>
          </div>
        </div>
      </aside>
      <nav className="mobile-nav" aria-label={`${role} primary navigation`}>
        {items
          .filter((item) => item.primary)
          .map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => `mobile-nav__item${isActive ? ' is-active' : ''}`}
            >
              <Icon size={20} /> <span>{label}</span>
            </NavLink>
          ))}
      </nav>
    </>
  )
}
