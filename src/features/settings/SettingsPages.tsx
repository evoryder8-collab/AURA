import { Bell, Database, RotateCcw, ShieldCheck, Smartphone } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge } from '@/components/design-system/Badge'
import { Button } from '@/components/design-system/Button'
import { Card } from '@/components/design-system/Card'
import { PageHeader } from '@/components/design-system/PageHeader'
import { env } from '@/config/env'
import { useDemoStore } from '@/data/demo/store'
import { useAuth, type AuraRole } from '@/features/auth/auth-context'
import { MfaSettings } from './MfaSettings'

export function SettingsPage({ role }: { role: AuraRole }) {
  const auth = useAuth()
  const resetDemo = useDemoStore((state) => state.resetDemo)
  const navigate = useNavigate()
  const [resetDone, setResetDone] = useState(false)
  const signOut = async () => {
    await auth.signOut()
    navigate('/')
  }
  return (
    <div>
      <PageHeader
        eyebrow={`${role === 'therapist' ? 'Practice' : 'Personal'} settings`}
        title={
          <>
            Quiet controls,
            <br />
            clear boundaries.
          </>
        }
        lead="Feature flags and public build configuration are visible here. Secrets never belong in frontend settings."
      />
      <section className="settings-grid">
        <Card eyebrow="Security" title="Account safeguards">
          <MfaSettings role={role} />
          {env.flags.passkeys && (
            <div className="setting-row">
              <Smartphone size={19} />
              <div>
                <strong>Passkeys</strong>
                <span>
                  WebAuthn enrollment is visible only in connected deployments whose authentication
                  provider has enabled it.
                </span>
              </div>
              <Badge>{env.demoMode ? 'Demo preview' : 'Provider controlled'}</Badge>
            </div>
          )}
          <div className="setting-row">
            <ShieldCheck size={19} />
            <div>
              <strong>Fresh authentication</strong>
              <span>
                Required before photos, handoffs, exports, consent changes, and deletion requests.
              </span>
            </div>
            <Badge tone="favourable">Enforced flow</Badge>
          </div>
          <Button variant="secondary" onClick={() => void signOut()}>
            Sign out everywhere
          </Button>
        </Card>
        <Card eyebrow="Environment" title="Test-build status">
          <div className="setting-row">
            <Database size={19} />
            <div>
              <strong>Data source</strong>
              <span>
                {env.demoMode
                  ? 'IndexedDB-backed synthetic fixtures'
                  : 'Protected Supabase data adapter'}
              </span>
            </div>
            <Badge tone={env.demoMode ? 'pending' : 'favourable'}>{env.mode}</Badge>
          </div>
          <div className="setting-row">
            <Bell size={19} />
            <div>
              <strong>Browser notifications</strong>
              <span>Provider abstraction and in-app outbox are ready.</span>
            </div>
            <Badge>{env.flags.browserNotifications ? 'Enabled' : 'Feature off'}</Badge>
          </div>
          {env.setupErrors.map((error) => (
            <p key={error} className="form-error">
              {error}
            </p>
          ))}
        </Card>
        {env.demoMode && (
          <Card tone="gold" eyebrow="Synthetic state" title="Reset the demo">
            <p>
              Restores fictional clients, graphs, appointments, session records, consent choices,
              and handoffs to their initial state.
            </p>
            <Button
              icon={<RotateCcw size={16} />}
              onClick={() => {
                resetDemo()
                setResetDone(true)
              }}
            >
              {resetDone ? 'Demo restored' : 'Reset synthetic data'}
            </Button>
          </Card>
        )}
      </section>
    </div>
  )
}
