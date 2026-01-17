import { BackofficeLayout } from '@/components/internal/backoffice-layout'
import { ClientDetail } from '@/components/internal/client-detail'
import { fetchInternal, GetOrgResponse } from '@/lib/internal/fetch-internal'
import { notFound } from 'next/navigation'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ orgId: string }>
}

export default async function ClientDetailPage({ params }: PageProps) {
  const { orgId } = await params
  
  const result = await fetchInternal<GetOrgResponse>(`/internal/orgs/${orgId}`, { revalidate: 0 })
  
  if (!result.ok || !result.data) {
    if (result.status === 404) {
      notFound()
    }
    return (
      <BackofficeLayout>
        <div className="text-red-400">Erreur: {result.error}</div>
      </BackofficeLayout>
    )
  }

  return (
    <BackofficeLayout>
      <ClientDetail 
        org={result.data.org}
        usage={result.data.usage}
        recentUsage={result.data.recentUsage}
        recentTelemetry={result.data.recentTelemetry}
      />
    </BackofficeLayout>
  )
}
