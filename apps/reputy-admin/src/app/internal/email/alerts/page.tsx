import { BackofficeLayout } from '@/components/internal/backoffice-layout'
import { AlertsTable } from '@/components/internal/email/alerts-table'
import { fetchEmailAlerts } from '@/lib/internal/email-actions'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ window?: string }>
}

export default async function EmailAlertsPage({ searchParams }: Props) {
  const params = await searchParams
  const window = params.window || '7d'

  // SSR fetch
  const data = await fetchEmailAlerts(window)

  return (
    <BackofficeLayout>
      <AlertsTable data={data} />
    </BackofficeLayout>
  )
}
