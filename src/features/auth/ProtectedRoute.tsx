import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Spinner } from '@/components/design-system/Spinner'
import { env } from '@/config/env'
import { useAuth, type AuraRole } from './auth-context'

export function ProtectedRoute({ role }: { role: AuraRole }) {
  const auth = useAuth()
  const location = useLocation()

  if (auth.loading) return <Spinner label="Verifying secure session" fullPage />
  if (!auth.role || auth.mfaChallengeRequired) {
    return <Navigate to={`/login/${role}`} replace state={{ from: location.pathname }} />
  }
  if (auth.role !== role) {
    return (
      <Navigate
        to={
          auth.role === 'therapist'
            ? '/therapist/today'
            : env.demoMode
              ? '/client/home'
              : '/client/appointments'
        }
        replace
      />
    )
  }
  return <Outlet />
}
