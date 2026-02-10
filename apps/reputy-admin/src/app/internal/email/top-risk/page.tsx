import { BackofficeLayout } from '@/components/internal/backoffice-layout'
import { TopRiskTable } from '@/components/internal/email/top-risk-table'
import { fetchEmailHealth } from '@/lib/internal/email-actions'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ window?: string; limit?: string }>
}

export default async function TopRiskPage({ searchParams }: Props) {
  const params = await searchParams
  const window = params.window || '7d'
  const limit = params.limit || '50'

  // SSR fetch via /health?include=topRisk
  const data = await fetchEmailHealth(window, ['topRisk'])

  return (
    <BackofficeLayout>
      <TopRiskTable
        orgs={data.topRiskOrgs || []}
        window={window}
        ok={data.ok}
        error={data.error}
      />
    </BackofficeLayout>
  )
}
