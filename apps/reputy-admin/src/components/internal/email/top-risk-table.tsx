'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ArrowLeft, Download, RefreshCw } from 'lucide-react'
import { WarmupBadge } from './email-health-dashboard'
import type { TopRiskOrg } from '@/lib/internal/email-actions'

interface TopRiskTableProps {
  orgs: TopRiskOrg[]
  window: string
  ok: boolean
  error?: string
}

export function TopRiskTable({ orgs, window: currentWindow, ok, error }: TopRiskTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const limit = searchParams.get('limit') || '50'

  function handleWindowChange(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('window', value)
    router.push(`/internal/email/top-risk?${params.toString()}`)
  }

  function handleLimitChange(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('limit', value)
    router.push(`/internal/email/top-risk?${params.toString()}`)
  }

  if (!ok) {
    return (
      <div className="p-8 text-center">
        <p className="text-lg text-red-400 font-medium">Erreur de chargement</p>
        <p className="text-sm text-slate-400 mt-2">{error || 'Backend inaccessible'}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/internal/email/health">
            <Button variant="ghost" size="icon" className="text-slate-400 hover:text-white">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold text-white">🎯 Top Risk Organisations</h1>
          <Badge variant="outline" className="border-slate-600 text-slate-400">
            {orgs.length} orgs
          </Badge>
        </div>
        <div className="flex items-center gap-3">
          <Select value={currentWindow} onValueChange={handleWindowChange}>
            <SelectTrigger className="w-[120px] bg-slate-800 border-slate-600 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              <SelectItem value="24h">24h</SelectItem>
              <SelectItem value="7d">7 jours</SelectItem>
              <SelectItem value="30d">30 jours</SelectItem>
            </SelectContent>
          </Select>
          <Select value={limit} onValueChange={handleLimitChange}>
            <SelectTrigger className="w-[100px] bg-slate-800 border-slate-600 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
              <SelectItem value="100">100</SelectItem>
            </SelectContent>
          </Select>
          <a
            href={`/internal/email/api/top-risk-csv?window=${currentWindow}&limit=${limit}`}
            download
          >
            <Button className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2">
              <Download className="h-4 w-4" />
              CSV
            </Button>
          </a>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.refresh()}
            className="text-slate-400 hover:text-white"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Table */}
      {orgs.length === 0 ? (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="py-12 text-center">
            <p className="text-4xl mb-3">✅</p>
            <p className="text-lg text-green-400 font-medium">Aucune organisation à risque</p>
            <p className="text-sm text-slate-400 mt-1">Toutes les orgs ont des taux normaux.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-700">
                    <th className="text-left py-3 px-4 font-medium">Organisation</th>
                    <th className="text-left py-3 px-4 font-medium">Plan</th>
                    <th className="text-right py-3 px-4 font-medium">Envoyés</th>
                    <th className="text-right py-3 px-4 font-medium">Bounces</th>
                    <th className="text-right py-3 px-4 font-medium">Complaints</th>
                    <th className="text-right py-3 px-4 font-medium">Bounce %</th>
                    <th className="text-right py-3 px-4 font-medium">Complaint %</th>
                    <th className="text-center py-3 px-4 font-medium">Warmup</th>
                  </tr>
                </thead>
                <tbody>
                  {orgs.map((org) => (
                    <tr
                      key={org.org_id}
                      className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <Link
                          href={`/internal/email/orgs/${org.org_id}`}
                          className="text-blue-400 hover:text-blue-300 hover:underline"
                        >
                          {org.org_name || org.org_id}
                        </Link>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-slate-400 text-xs font-mono">{org.plan || '—'}</span>
                      </td>
                      <td className="text-right py-3 px-4 text-slate-300 tabular-nums">
                        {org.sent}
                      </td>
                      <td className="text-right py-3 px-4 text-slate-300 tabular-nums">
                        {org.bounces}
                      </td>
                      <td className="text-right py-3 px-4 text-slate-300 tabular-nums">
                        {org.complaints}
                      </td>
                      <td className="text-right py-3 px-4 tabular-nums">
                        <RateCell value={org.bounceRate} orangeAt={0.02} redAt={0.05} />
                      </td>
                      <td className="text-right py-3 px-4 tabular-nums">
                        <RateCell value={org.complaintRate} orangeAt={0.0005} redAt={0.001} />
                      </td>
                      <td className="text-center py-3 px-4">
                        <WarmupBadge status={org.warmupStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function RateCell({ value, orangeAt, redAt }: { value: number; orangeAt: number; redAt: number }) {
  const formatted = `${(value * 100).toFixed(3)}%`
  let color: string
  if (value >= redAt) color = 'text-red-400 font-semibold'
  else if (value >= orangeAt) color = 'text-amber-400'
  else color = 'text-green-400'
  return <span className={color}>{formatted}</span>
}
