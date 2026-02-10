import { BackofficeLayout } from '@/components/internal/backoffice-layout'
import { EmailHealthDashboard } from '@/components/internal/email/email-health-dashboard'
import { fetchEmailHealth, fetchEmailAlerts } from '@/lib/internal/email-actions'

export const dynamic = 'force-dynamic'

interface Props {
  searchParams: Promise<{ window?: string; alerts?: string }>
}

export default async function EmailHealthPage({ searchParams }: Props) {
  const params = await searchParams
  const window = params.window || '7d'
  const showAlerts = params.alerts === '1'

  // SSR fetch — token never exposed to browser
  const include = ['topRisk', 'lastWebhook']
  if (showAlerts) include.push('alerts')

  const [data, alertsData] = await Promise.all([
    fetchEmailHealth(window, include),
    showAlerts ? fetchEmailAlerts(window) : Promise.resolve(null),
  ])

  return (
    <BackofficeLayout>
      <EmailHealthDashboard
        data={data}
        alertsData={alertsData}
      />
    </BackofficeLayout>
  )
}
