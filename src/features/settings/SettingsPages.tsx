import { Clock3, Database, LogOut, ShieldCheck, Sparkles } from 'lucide-react'
import { useSyncExternalStore, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/design-system/Button'
import { Card } from '@/components/design-system/Card'
import { PageHeader } from '@/components/design-system/PageHeader'
import { env } from '@/config/env'
import { useAuth, type AuraRole } from '@/features/auth/auth-context'
import { fmtTime, PRACTICE_TIME_ZONE } from '@/lib/formatting/time'
import { MfaSettings } from './MfaSettings'
import { ResetDemoData } from './ResetDemoData'
import './settings.css'

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

/** Follows the device's reduce-motion setting live. */
function usePrefersReducedMotion() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(REDUCED_MOTION)
      query.addEventListener('change', onChange)
      return () => query.removeEventListener('change', onChange)
    },
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  )
}

function SettingRow({
  icon,
  title,
  children,
}: {
  icon: ReactNode
  title: string
  children: ReactNode
}) {
  return (
    <div className="setting-row">
      <span className="setting-row__icon" aria-hidden="true">
        {icon}
      </span>
      <div className="setting-row__copy">
        <strong>{title}</strong>
        <span>{children}</span>
      </div>
    </div>
  )
}

export function SettingsPage({ role }: { role: AuraRole }) {
  const auth = useAuth()
  const navigate = useNavigate()
  const reducedMotion = usePrefersReducedMotion()
  const signOut = async () => {
    await auth.signOut()
    navigate('/')
  }

  return (
    <div className="page settings-page">
      <PageHeader
        eyebrow={role === 'therapist' ? 'Practice' : 'Personal'}
        title="Settings"
        lead={
          env.demoMode
            ? 'This is a synthetic demo. Its fictional data stays in this browser.'
            : 'Your protected AURA account.'
        }
      />

      <div className="settings-grid">
        <Card as="section" title="This device" aria-label="This device">
          <SettingRow icon={<Sparkles size={19} />} title="Motion">
            {reducedMotion
              ? 'Your device asks for reduced motion, so AURA’s animations settle to still frames.'
              : 'Animations are on. Turn on Reduce motion in your device’s accessibility settings and AURA will hold still.'}
          </SettingRow>
          <SettingRow icon={<Clock3 size={19} />} title="Practice time zone">
            Times are shown in{' '}
            <strong className="nowrap">{PRACTICE_TIME_ZONE.replaceAll('_', ' ')}</strong>, where it
            is now <span className="num">{fmtTime(Date.now())}</span>.
          </SettingRow>
          <SettingRow icon={<Database size={19} />} title="Where your data lives">
            {env.demoMode
              ? 'Fictional demo data is stored in this browser only (IndexedDB). Nothing is sent to a server or synced.'
              : 'Your records load from your protected AURA account each time you open the app.'}
          </SettingRow>
        </Card>

        <Card as="section" title="Security" aria-label="Security">
          {env.demoMode ? null : <MfaSettings role={role} />}
          <SettingRow icon={<ShieldCheck size={19} />} title="Confirm it’s you">
            {role === 'client'
              ? 'AURA asks you to confirm it’s you before you take or view progress photos and before you change a consent choice.'
              : 'AURA asks you to confirm it’s you before you take or view a client’s progress photos.'}
            {env.demoMode ? ' In this demo you type DEMO.' : ''}
          </SettingRow>
          <div>
            <Button
              variant="secondary"
              icon={<LogOut size={16} aria-hidden="true" />}
              onClick={() => void signOut()}
            >
              {env.demoMode ? 'Sign out' : 'Sign out everywhere'}
            </Button>
          </div>
          {env.setupErrors.map((error) => (
            <p key={error} className="form-error" role="alert">
              {error}
            </p>
          ))}
        </Card>

        {env.demoMode ? (
          <Card as="section" title="Demo data" aria-label="Demo data">
            <ResetDemoData />
          </Card>
        ) : null}
      </div>
    </div>
  )
}
