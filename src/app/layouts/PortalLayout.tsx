import { Bell, LogOut, Menu, X } from 'lucide-react'
import { useState } from 'react'
import { Outlet, useNavigate } from 'react-router-dom'
import { Button } from '@/components/design-system/Button'
import { PortalNav } from '@/components/navigation/PortalNav'
import { env } from '@/config/env'
import { useAuth, type AuraRole } from '@/features/auth/auth-context'

export function PortalLayout({ role }: { role: AuraRole }) {
  const auth = useAuth()
  const navigate = useNavigate()
  const [menuOpen, setMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)

  const signOut = async () => {
    await auth.signOut()
    navigate('/')
  }

  return (
    <div className={`portal-shell portal-shell--${role}`}>
      <PortalNav role={role} />
      <div className="portal-main-wrap">
        <header className="topbar">
          <button
            className="icon-button topbar__menu"
            aria-label="Open contextual menu"
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
                <strong>Two synthetic reminders</strong>
                <span>Next-day follow-up is ready.</span>
                <span>One appointment request awaits review.</span>
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
          aria-label="Contextual navigation"
        >
          <button
            className="icon-button"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          >
            <X size={20} />
          </button>
          <Button
            variant="secondary"
            fullWidth
            onClick={() =>
              navigate(role === 'therapist' ? '/therapist/settings' : '/client/settings')
            }
          >
            Open settings
          </Button>
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
