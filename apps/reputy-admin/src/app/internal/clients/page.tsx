import { BackofficeLayout } from '@/components/internal/backoffice-layout'
import { ClientsList } from '@/components/internal/clients-list'
import { AtRiskBanner } from '@/components/internal/at-risk-banner'
import { fetchInternal, ListOrgsResponse, AtRiskOrgsResponse } from '@/lib/internal/fetch-internal'

export const dynamic = 'force-dynamic'

export default async function ClientsPage() {
  const [result, atRiskResult] = await Promise.all([
    fetchInternal<ListOrgsResponse>('/internal/orgs', { revalidate: 0 }),
    fetchInternal<AtRiskOrgsResponse>('/internal/admin/at-risk-orgs', { revalidate: 0 }),
  ])
  
  return (
    <BackofficeLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Clients</h1>
          <p className="text-slate-400 mt-1">
            Gérez tous les clients Reputy
          </p>
        </div>

        {/* P1b: At-risk banner — paying orgs not yet activated */}
        <AtRiskBanner
          atRiskOrgs={atRiskResult.ok ? atRiskResult.data?.orgs || [] : []}
        />
        
        <ClientsList 
          initialOrgs={result.ok ? result.data?.orgs || [] : []}
          error={result.ok ? undefined : result.error}
        />
      </div>
    </BackofficeLayout>
  )
}
