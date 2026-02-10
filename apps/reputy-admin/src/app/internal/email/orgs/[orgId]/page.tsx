import { BackofficeLayout } from '@/components/internal/backoffice-layout'
import { OrgEmailDetail } from '@/components/internal/email/org-email-detail'
import { fetchOrgEmailStats, fetchOrgPauseState } from '@/lib/internal/email-actions'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ orgId: string }>
  searchParams: Promise<{ window?: string }>
}

export default async function OrgEmailDetailPage({ params, searchParams }: Props) {
  const { orgId } = await params
  const { window: windowParam } = await searchParams
  const window = windowParam || '7d'

  // Parallel SSR fetch — token never exposed
  const [stats, pauseState] = await Promise.all([
    fetchOrgEmailStats(orgId, window),
    fetchOrgPauseState(orgId),
  ])

  return (
    <BackofficeLayout>
      <OrgEmailDetail
        stats={stats}
        pauseState={pauseState}
      />
    </BackofficeLayout>
  )
}
