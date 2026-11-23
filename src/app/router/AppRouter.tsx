import { lazy, Suspense, type ComponentType } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/app/layouts/AppShell'
import { RootLayout } from '@/app/layouts/RootLayout'
import { Spinner } from '@/components/design-system/Spinner'
import { env } from '@/config/env'
import { EntrancePage } from '@/features/entrance/EntrancePage'
import { LoginPage } from '@/features/auth/LoginPage'
import { ProtectedRoute } from '@/features/auth/ProtectedRoute'
import {
  AuthCallbackPage,
  NotFoundPage,
  OfflinePage,
  PrivacyPlaceholderPage,
  PublicHandoffPage,
} from './PublicPages'

function page<T extends Record<string, ComponentType>>(load: () => Promise<T>, name: keyof T) {
  return lazy(() => load().then((module) => ({ default: module[name] as ComponentType })))
}

const ClientHomePage = page(() => import('@/features/client-home/ClientHomePage'), 'ClientHomePage')
const LogHowIFeelPage = page(() => import('@/features/check-in/LogHowIFeelPage'), 'LogHowIFeelPage')
const ProgressPage = page(() => import('@/features/progress/ProgressPage'), 'ProgressPage')
const VisitsPage = page(() => import('@/features/visits/VisitsPage'), 'VisitsPage')
const BookVisitPage = page(() => import('@/features/visits/BookVisitPage'), 'BookVisitPage')
const ArrivalPage = page(() => import('@/features/arrival/ArrivalPage'), 'ArrivalPage')
const FollowUpPage = page(() => import('@/features/follow-up/FollowUpPage'), 'FollowUpPage')
const MePage = page(() => import('@/features/me/MePage'), 'MePage')
const ClientReportPage = page(() => import('@/features/reports/ClientReportPage'), 'ClientReportPage')
const TodayPage = page(() => import('@/features/therapist-home/TodayPage'), 'TodayPage')
const ClientsPage = page(() => import('@/features/clients/ClientsPage'), 'ClientsPage')
const ClientProfilePage = page(() => import('@/features/clients/ClientProfilePage'), 'ClientProfilePage')
const ReportBuilderPage = page(() => import('@/features/reports/ReportBuilderPage'), 'ReportBuilderPage')
const SessionModePage = page(() => import('@/features/session/SessionModePage'), 'SessionModePage')
const FinishSessionPage = page(() => import('@/features/session/FinishSessionPage'), 'FinishSessionPage')
const CalendarPage = page(() => import('@/features/calendar/CalendarPage'), 'CalendarPage')
const ConnectedTodayPage = page(() => import('@/features/today/ConnectedTodayPage'), 'ConnectedTodayPage')
const ConnectedClientsPage = page(() => import('@/features/clients/ConnectedClientsPage'), 'ConnectedClientsPage')
const ConnectedClientAppointmentsPage = page(
  () => import('@/features/appointments/ConnectedClientAppointmentsPage'),
  'ConnectedClientAppointmentsPage',
)
const SettingsPage = lazy(() =>
  import('@/features/settings/SettingsPages').then((module) => ({ default: module.SettingsPage })),
)

const demo = env.demoMode

export function AppRouter() {
  return (
    <HashRouter>
      <Suspense fallback={<Spinner label="Opening AURA" fullPage />}>
        <Routes>
          <Route element={<RootLayout />}>
            <Route index element={<EntrancePage />} />
            <Route path="login/:role" element={<LoginPage />} />
            <Route path="auth/callback" element={<AuthCallbackPage />} />
            <Route path="handoff/:token" element={<PublicHandoffPage />} />
            <Route path="offline" element={<OfflinePage />} />
            <Route path="privacy-placeholder" element={<PrivacyPlaceholderPage />} />

            <Route element={<ProtectedRoute role="therapist" />}>
              {demo ? (
                <>
                  <Route path="therapist/session/:appointmentId" element={<SessionModePage />} />
                  <Route path="therapist/arrival/:appointmentId" element={<ArrivalPage />} />
                </>
              ) : null}
              <Route element={<AppShell role="therapist" />}>
                <Route path="therapist/today" element={demo ? <TodayPage /> : <ConnectedTodayPage />} />
                <Route path="therapist/clients" element={demo ? <ClientsPage /> : <ConnectedClientsPage />} />
                {demo ? (
                  <>
                    <Route path="therapist/clients/:clientId" element={<ClientProfilePage />} />
                    <Route path="therapist/clients/:clientId/report" element={<ReportBuilderPage />} />
                    <Route path="therapist/clients/:clientId/report/:reportId" element={<ReportBuilderPage />} />
                    <Route path="therapist/session/:appointmentId/finish" element={<FinishSessionPage />} />
                    <Route path="therapist/calendar" element={<CalendarPage />} />
                  </>
                ) : null}
                <Route path="therapist/settings" element={<SettingsPage role="therapist" />} />
              </Route>
            </Route>

            <Route element={<ProtectedRoute role="client" />}>
              {demo ? (
                <>
                  <Route path="client/log" element={<LogHowIFeelPage />} />
                  <Route path="client/arrival/:appointmentId" element={<ArrivalPage />} />
                  <Route path="client/follow-up/:appointmentId" element={<FollowUpPage />} />
                </>
              ) : null}
              <Route element={<AppShell role="client" />}>
                {demo ? (
                  <>
                    <Route path="client/home" element={<ClientHomePage />} />
                    <Route path="client/progress" element={<ProgressPage />} />
                    <Route path="client/visits" element={<VisitsPage />} />
                    <Route path="client/visits/book" element={<BookVisitPage />} />
                    <Route path="client/me" element={<MePage />} />
                    <Route path="client/reports/:reportId" element={<ClientReportPage />} />
                  </>
                ) : (
                  <>
                    <Route path="client/visits" element={<ConnectedClientAppointmentsPage />} />
                    <Route path="client/home" element={<Navigate to="/client/visits" replace />} />
                  </>
                )}
                <Route path="client/appointments" element={<Navigate to="/client/visits" replace />} />
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
