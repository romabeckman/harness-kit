import type { ReportsSummaryDto } from '../../../adapters/inbound/http/dto/ReportsSummaryDto'

export interface IGetReportsSummaryUseCase {
  execute(
    projectIdentifier?: string,
    startDate?: string,
    endDate?: string
  ): Promise<ReportsSummaryDto>
}
