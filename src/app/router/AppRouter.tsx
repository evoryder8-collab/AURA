import { lazy, Suspense } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { PortalLayout } from '@/app/layouts/PortalLayout'
import { RootLayout } from '@/app/layouts/RootLayout'
import { Spinner } from '@/components/design-system/Spinner'
import {
  AuthCallbackPage,
  NotFoundPage,
  OfflinePage,
  PrivacyPlaceholderPage,
  PublicHandoffPage,
} from './PublicPages'
import { EntrancePage } from '@/features/entrance/EntrancePage'
import { LoginPage } from '@/features/auth/LoginPage'
import { ProtectedRoute } from '@/features/auth/ProtectedRoute'

const CalendarPage = lazy(() =>
  import('@/features/appointments/CalendarPage').then((module) => ({
    default: module.CalendarPage,
  })),
)
const ClientAppointmentsPage = lazy(() =>
  import('@/features/appointments/ClientAppointmentsPage').then((module) => ({
    default: module.ClientAppointmentsPage,
  })),
)
const ClientHistoryPage = lazy(() =>
  import('@/features/appointments/ClientHistoryPage').then((module) => ({
    default: module.ClientHistoryPage,
  })),
)
const ClientDashboardPage = lazy(() =>
  import('@/features/clients/ClientDashboardPage').then((module) => ({
    default: module.ClientDashboardPage,
  })),
)
const ClientsPage = lazy(() =>
  import('@/features/clients/ClientsPage').then((module) => ({ default: module.ClientsPage })),
)
const ConsentsPage = lazy(() =>
  import('@/features/consent/ConsentsPage').then((module) => ({ default: module.ConsentsPage })),
)
const CheckInPage = lazy(() =>
  import('@/features/follow-up/CheckInPage').then((module) => ({ default: module.CheckInPage })),
)
const ClientProgressPage = lazy(() =>
  import('@/features/progress/ClientProgressPage').then((module) => ({
    default: module.ClientProgressPage,
  })),
)
const SessionPage = lazy(() =>
  import('@/features/session/SessionPage').then((module) => ({ default: module.SessionPage })),
)
const SettingsPage = lazy(() =>
  import('@/features/settings/SettingsPages').then((module) => ({ default: module.SettingsPage })),
)
const ClientHomePage = lazy(() =>
  import('@/features/today/ClientHomePage').then((module) => ({ default: module.ClientHomePage })),
)
const TodayPage = lazy(() =>
  import('@/features/today/TodayPage').then((module) => ({ default: module.TodayPage })),
)

export function AppRouter() {
  return (
    <HashRouter>
      <Suspense fallback={<Spinner label="Preparing your private view" fullPage />}>
        <Routes>
          <Route element={<RootLayout />}>
            <Route index element={<EntrancePage />} />
            <Route path="login/:role" element={<LoginPage />} />
            <Route path="auth/callback" element={<AuthCallbackPage />} />
            <Route path="handoff/:token" element={<PublicHandoffPage />} />
            <Route path="offline" element={<OfflinePage />} />
            <Route path="privacy-placeholder" element={<PrivacyPlaceholderPage />} />

            <Route element={<ProtectedRoute role="therapist" />}>
              <Route element={<PortalLayout role="therapist" />}>
                <Route path="therapist/today" element={<TodayPage />} />
                <Route path="therapist/clients" element={<ClientsPage />} />
                <Route path="therapist/clients/:clientId" element={<ClientDashboardPage />} />
                <Route path="therapist/session/:appointmentId" element={<SessionPage />} />
                <Route path="therapist/calendar" element={<CalendarPage />} />
                <Route path="therapist/settings" element={<SettingsPage role="therapist" />} />
              </Route>
            </Route>

            <Route element={<ProtectedRoute role="client" />}>
              <Route element={<PortalLayout role="client" />}>
                <Route path="client/home" element={<ClientHomePage />} />
                <Route path="client/check-in/:appointmentId" element={<CheckInPage />} />
                <Route path="client/progress" element={<ClientProgressPage />} />
                <Route path="client/history" element={<ClientHistoryPage />} />
                <Route path="client/appointments" element={<ClientAppointmentsPage />} />
                <Route path="client/consents" element={<ConsentsPage />} />
                <Route path="client/settings" element={<SettingsPage role="client" />} />
              </Route>
            </Route>

            <Route path="*" element={<NotFoundPage />} />
          </Route>
        </Routes>
      </Suspense>
    </HashRouter>
  )
}
