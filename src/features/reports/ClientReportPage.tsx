import { ChevronLeft } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { Spinner } from '@/components/design-system/Spinner'
import { useDemoStore } from '@/data/demo/store'
import { useAuth } from '@/features/auth/auth-context'
import { ReportReview } from './ReportReview'
import './report.css'

/** A client reviews, agrees to, downloads or withdraws a report about themselves, and nobody else's. */
export function ClientReportPage() {
  const { reportId } = useParams()
  const { demoClientId } = useAuth()
  const report = useDemoStore((state) => state.reports.find((item) => item.id === reportId))
  const hydrated = useDemoStore((state) => state.hydrated)
  const visible = report && report.clientId === demoClientId && report.status !== 'draft'
  if (!hydrated) return <Spinner label="Opening the report" fullPage />
  return (
    <div className="page report-page">
      <Link to="/client/me" className="back-link">
        <ChevronLeft size={18} aria-hidden="true" /> Me
      </Link>
      {visible ? (
        <ReportReview report={report} mode="client" />
      ) : (
        <div className="empty" role="status">
          <h1 className="title-md">This report isn’t available</h1>
          <p>It may have been replaced, or it belongs to someone else. Reports prepared for you appear on your Me page.</p>
        </div>
      )}
    </div>
  )
}
