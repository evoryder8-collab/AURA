import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { createDemoState, DEMO_CLIENT_IDS, DEMO_THERAPIST_IDS } from '@/data/demo/fixtures'
import { useDemoStore } from '@/data/demo/store'
import { reportIsExportable } from '@/domain/care'
import { AuthContext, type AuthState } from '@/features/auth/auth-context'
import { useFreshAuthStore } from '@/features/consent/freshAuth'
import { ClientReportPage } from './ClientReportPage'
import { ClientReportsList } from './ClientReportsList'
import { ReportBuilderPage } from './ReportBuilderPage'

const MIRA = DEMO_CLIENT_IDS.mira

const auth = (patch: Partial<AuthState>): AuthState => ({
  loading: false,
  role: 'therapist',
  user: null,
  demoClientId: null,
  demoTherapistId: null,
  mfaChallengeRequired: false,
  error: null,
  signIn: async () => false,
  verifyMfa: async () => false,
  signInWithMagicLink: async () => false,
  enterDemo: () => undefined,
  signOut: async () => undefined,
  ...patch,
})

function renderAt(path: string, value: AuthState) {
  return render(
    <AuthContext.Provider value={value}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/therapist/clients/:clientId/report" element={<ReportBuilderPage />} />
          <Route path="/therapist/clients/:clientId/report/:reportId" element={<ReportBuilderPage />} />
          <Route path="/client/reports/:reportId" element={<ClientReportPage />} />
          <Route path="/client/me" element={<ClientReportsList clientId={value.demoClientId ?? ''} />} />
        </Routes>
      </MemoryRouter>
    </AuthContext.Provider>,
  )
}

const asWassana = auth({ role: 'therapist', demoTherapistId: DEMO_THERAPIST_IDS.sora })
const asMira = auth({ role: 'client', demoClientId: MIRA })

/** A report for Mira saved as Wassana would save it, then asked of Mira. */
function awaitingReport(includePhotos = false) {
  const state = useDemoStore.getState()
  const note = state.notes.find((item) => item.id === 'note-mira-report-1')!
  const id = state.saveReport({
    clientId: MIRA,
    preparedBy: DEMO_THERAPIST_IDS.sora,
    recipient: 'Family doctor',
    purpose: 'a review of the persistent left shoulder pain',
    dateFrom: '2026-01-01T00:00:00.000Z',
    dateTo: new Date().toISOString(),
    areas: ['shoulder:left'],
    sections: ['bodyMap', 'painTrend', ...(includePhotos ? (['photos'] as const) : [])],
    view: 'auto',
    noteId: note.id,
    noteText: note.body,
    recommendation: 'I recommend discussing the persistent left shoulder pain with your doctor.',
    includePhotos,
  })
  state.requestReportConsent(id)
  return id
}

beforeEach(() => {
  useDemoStore.setState({ ...createDemoState(), hydrated: true })
  useFreshAuthStore.setState({ confirmedAt: {} })
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 404 })))
})

afterEach(() => vi.unstubAllGlobals())

describe('report builder', () => {
  it('offers only notes written for a report; private notes appear nowhere', () => {
    renderAt(`/therapist/clients/${MIRA}/report`, asWassana)
    const notes = screen.getByRole('radiogroup', { name: /choose a note/i })
    expect(within(notes).getAllByRole('radio')).toHaveLength(2)
    expect(within(notes).getByText(/has continued between visits/)).toBeInTheDocument()
    expect(document.body.textContent).not.toContain('Guarded on left rotation')
    expect(document.body.textContent).not.toContain('Prefers the room warmer')
  })

  it('offers photographs only with photography on and a fresh confirmation, off by default, with their own agreement', async () => {
    const user = userEvent.setup()
    useDemoStore.getState().addPhoto({ clientId: MIRA, view: 'back', dataUrl: 'data:image/jpeg;base64,AA' })
    const view = renderAt(`/therapist/clients/${MIRA}/report`, asWassana)
    const photos = () => screen.getByRole('checkbox', { name: /include photographs/i })
    expect(photos()).toBeDisabled()
    expect(photos()).toHaveAccessibleDescription('Mira has photography turned off, so no photographs can be included.')

    view.unmount()
    useDemoStore.getState().updateConsent(MIRA, 'photography', true)
    renderAt(`/therapist/clients/${MIRA}/report`, asWassana)
    expect(photos()).toBeDisabled()
    expect(photos()).toHaveAccessibleDescription(/1 in this period\. Confirm it’s you/)
    await user.click(screen.getByRole('button', { name: 'Confirm it’s you' }))
    await user.type(screen.getByRole('textbox', { name: /type demo to confirm/i }), 'DEMO')
    await user.keyboard('{Enter}')

    expect(photos()).toBeEnabled()
    expect(photos()).not.toBeChecked()
    expect(screen.queryByText(/must agree to share photographs specifically/)).not.toBeInTheDocument()
    await user.click(photos())
    expect(screen.getByRole('alert')).toHaveTextContent(/must agree to share photographs specifically/)
    expect(screen.getByRole('img', { name: /back view · taken/i })).toBeInTheDocument()
  })

  it('cannot export before the client agrees', async () => {
    const user = userEvent.setup()
    renderAt(`/therapist/clients/${MIRA}/report`, asWassana)
    expect(screen.queryByRole('button', { name: /download pdf/i })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /ask mira to review/i }))
    const report = useDemoStore.getState().reports[0]!
    expect(report.status).toBe('awaiting_consent')
    expect(report.noteText).toMatch(/has continued between visits/)
    expect(report.includePhotos).toBe(false)
    expect(screen.queryByRole('button', { name: /download pdf/i })).not.toBeInTheDocument()
  })

  it('is not available to a therapist who does not work with the client', () => {
    renderAt(`/therapist/clients/${DEMO_CLIENT_IDS.sage}/report`, auth({ demoTherapistId: DEMO_THERAPIST_IDS.amara }))
    expect(screen.getByRole('status')).toHaveTextContent(/this report isn’t available/i)
    expect(screen.queryByRole('form', { name: /report settings/i })).not.toBeInTheDocument()
  })

  it('opens the same review for the client in a full-screen sheet', async () => {
    const user = userEvent.setup()
    const id = awaitingReport()
    renderAt(`/therapist/clients/${MIRA}/report/${id}`, asWassana)
    await user.click(screen.getByRole('button', { name: /mira is here/i }))
    const sheet = await screen.findByRole('dialog', { name: /review with mira/i })
    expect(within(sheet).getByRole('button', { name: /i agree to share this with my family doctor/i })).toBeInTheDocument()
  })
})

describe('client review', () => {
  it('records consent for exactly the recipient and purpose shown, then allows export', async () => {
    const user = userEvent.setup()
    const id = awaitingReport()
    renderAt(`/client/reports/${id}`, asMira)
    expect(screen.getByText('Not included')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /download pdf/i })).not.toBeInTheDocument()
    await user.click(
      screen.getByRole('button', { name: 'I agree to share this with my family doctor for a review of the persistent left shoulder pain' }),
    )
    const report = useDemoStore.getState().reports.find((item) => item.id === id)!
    expect(report.consent).toMatchObject({ recipient: 'Family doctor', purpose: 'a review of the persistent left shoulder pain', includesPhotos: false })
    expect(reportIsExportable(report)).toBe(true)
    expect(screen.getByRole('button', { name: /download pdf/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /print/i })).toBeInTheDocument()
  })

  it('asks separately before photographs are shared', async () => {
    const user = userEvent.setup()
    const id = awaitingReport(true)
    renderAt(`/client/reports/${id}`, asMira)
    const agree = screen.getByRole('button', { name: /i agree to share this/i })
    expect(agree).toBeDisabled()
    await user.click(screen.getByRole('checkbox', { name: /include my photographs/i }))
    await user.click(agree)
    expect(useDemoStore.getState().reports.find((item) => item.id === id)!.consent?.includesPhotos).toBe(true)
  })

  it('lets the client withdraw after agreeing', async () => {
    const user = userEvent.setup()
    const id = awaitingReport()
    useDemoStore.getState().consentToReport(id, MIRA)
    renderAt(`/client/reports/${id}`, asMira)
    await user.click(screen.getByRole('button', { name: /withdraw my agreement/i }))
    await user.click(within(screen.getByRole('group', { name: /withdraw your agreement/i })).getByRole('button', { name: /withdraw my agreement/i }))
    expect(useDemoStore.getState().reports.find((item) => item.id === id)!.status).toBe('withdrawn')
    expect(screen.queryByRole('button', { name: /download pdf/i })).not.toBeInTheDocument()
  })

  it('never shows one client another client’s report', () => {
    const id = awaitingReport()
    renderAt(`/client/reports/${id}`, auth({ role: 'client', demoClientId: DEMO_CLIENT_IDS.noa }))
    expect(screen.getByRole('status')).toHaveTextContent(/this report isn’t available/i)
    expect(document.body.textContent).not.toContain('Mira')
  })

  it('lists the client’s reports with their status and hides drafts', () => {
    const id = awaitingReport()
    useDemoStore.getState().saveReport({ ...useDemoStore.getState().reports.find((item) => item.id === id)!, recipient: 'Physiotherapist' })
    renderAt('/client/me', asMira)
    const list = screen.getByRole('list')
    expect(within(list).getAllByRole('listitem')).toHaveLength(1)
    expect(within(list).getByText('Awaiting your review')).toBeInTheDocument()
  })
})
