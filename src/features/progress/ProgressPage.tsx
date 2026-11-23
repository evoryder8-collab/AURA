import { useAuth } from '@/features/auth/auth-context'
import { ProgressExplorer } from './ProgressExplorer'

/** The signed-in client's own progress. The client id comes from the session, never from the URL. */
export function ProgressPage() {
  const { demoClientId } = useAuth()
  return (
    <div className="page progress-page">
      {demoClientId ? (
        <ProgressExplorer clientId={demoClientId} audience="client" />
      ) : (
        <p className="empty">Progress is available once you are signed in as a client.</p>
      )}
    </div>
  )
}
