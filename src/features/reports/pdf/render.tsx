import { pdf } from '@react-pdf/renderer'
import type { BodyAssets } from '../geometry'
import type { ReportView } from '../model'
import { ReportDocument } from './ReportDocument'

/** Loaded on demand, so the PDF renderer never weighs on the other screens. */
export function renderReportPdf(view: ReportView, body: BodyAssets | null): Promise<Blob> {
  return pdf(<ReportDocument view={view} body={body} />).toBlob()
}
