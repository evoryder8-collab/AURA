import {
  Bell,
  CalendarDays,
  History,
  House,
  LayoutList,
  LogOut,
  Menu,
  Settings,
  ShieldCheck,
  TrendingUp,
  UsersRound,
  X,
} from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Button } from '@/components/design-system/Button'
import { PortalNav } from '@/components/navigation/PortalNav'
import { env } from '@/config/env'
import { useDemoStore } from '@/data/demo/store'
import { useAuth, type AuraRole } from '@/features/auth/auth-context'

export function PortalLayout({ role }: { role: AuraRole }) {
  const auth = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const demoRequestCount = useDemoStore(
    (state) =>
      state.appointments.filter(
        (appointment) =>
          appointment.status === 'requested' &&
          (role === 'client'
            ? appointment.clientId === auth.demoClientId
            : appointment.therapistId === auth.demoTherapistId),
      ).length,
  )

  const signOut = async () => {
    await auth.signOut()
    navigate('/')
  }

  const navigation =
    role === 'therapist'
      ? [
          { to: '/therapist/today', label: 'Today', icon: LayoutList },
          { to: '/therapist/clients', label: 'Clients', icon: UsersRound },
          ...(env.demoMode
            ? [{ to: '/therapist/calendar', label: 'Calendar', icon: CalendarDays }]
            : []),
          { to: '/therapist/settings', label: 'Settings', icon: Settings },
        ]
      : [
          ...(env.demoMode
            ? [
                { to: '/client/home', label: 'Home', icon: House },
                { to: '/client/progress', label: 'Progress', icon: TrendingUp },
              ]
            : []),
          { to: '/client/appointments', label: 'Appointments', icon: CalendarDays },
          ...(env.demoMode
            ? [
                { to: '/client/history', label: 'History', icon: History },
                { to: '/client/consents', label: 'Consent', icon: ShieldCheck },
              ]
            : []),
          { to: '/client/settings', label: 'Settings', icon: Settings },
        ]

  return (
    <div className={`portal-shell portal-shell--${role}`}>
      <PortalNav role={role} />
      <div className="portal-main-wrap">
        <header className="topbar">
          <button
            className="icon-button topbar__menu"
            aria-label="Open all navigation"
            onClick={() => setMenuOpen(true)}
          >
            <Menu size={20} />
          </button>
          <span className="topbar__mark">AURA</span>
          <div className="topbar__actions">
            <button
              className="icon-button"
              aria-label="Notifications"
              aria-expanded={notificationsOpen}
              onClick={() => setNotificationsOpen((value) => !value)}
            >
              <Bell size={18} />
            </button>
            <Button
              variant="ghost"
              size="sm"
              icon={<LogOut size={16} />}
              onClick={() => void signOut()}
            >
              Sign out
            </Button>
          </div>
        </header>
        {notificationsOpen && (
          <div className="notification-popover" role="status">
            {env.demoMode ? (
              <>
                <strong>
                  {demoRequestCount > 0
                    ? `${demoRequestCount} synthetic booking ${demoRequestCount === 1 ? 'notice' : 'notices'}`
                    : 'Synthetic follow-up ready'}
                </strong>
                <span>Next-day follow-up is ready.</span>
                <span>
                  {demoRequestCount > 0
                    ? `${demoRequestCount} appointment request ${demoRequestCount === 1 ? 'awaits' : 'await'} review.`
                    : 'No appointment requests are waiting.'}
                </span>
              </>
            ) : (
              <>
                <strong>In-app notifications</strong>
                <span>No unread notices are available.</span>
              </>
            )}
            <button onClick={() => setNotificationsOpen(false)}>Mark viewed</button>
          </div>
        )}
        <main id="main-content" className="portal-content">
          <Outlet />
        </main>
      </div>
      {menuOpen && (
        <div
          className="context-menu"
          role="dialog"
          aria-modal="true"
          aria-label="All portal navigation"
        >
          <button
            className="icon-button"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          >
            <X size={20} />
          </button>
          <div className="context-menu__heading">
            <span>{role === 'therapist' ? 'Practice portal' : 'Personal portal'}</span>
            <strong>Where would you like to go?</strong>
          </div>
          <nav className="context-menu__links" aria-label="Portal destinations">
            {navigation.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={() => setMenuOpen(false)}
                className={({ isActive }) => `context-menu__link${isActive ? ' is-active' : ''}`}
              >
                <Icon size={18} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>
          <Button
            variant="ghost"
            fullWidth
            icon={<LogOut size={17} />}
            onClick={() => void signOut()}
          >
            Sign out
          </Button>
        </div>
      )}
    </div>
  )
}
