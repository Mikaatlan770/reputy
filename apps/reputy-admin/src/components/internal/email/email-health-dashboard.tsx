'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AlertTriangle, ArrowRight, Eye, RefreshCw } from 'lucide-react'
import { GlobalHealthKpi, HealthStatusBadge } from './kpi-cards'
import type {
  EmailHealthResponse,
  EmailAlert,
  TopRiskOrg,
} from '@/lib/internal/email-actions'

interface EmailHealthDashboardProps {
  data: EmailHealthResponse
  alertsData?: { alerts: EmailAlert[] } | null
}

export function EmailHealthDashboard({ data, alertsData }: EmailHealthDashboardProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentWindow = searchParams.get('window') || '7d'
  const showAlerts = searchParams.get('alerts') === '1'

  function handleWindowChange(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('window', value)
    router.push(`/internal/email/health?${params.toString()}`)
  }

  function toggleAlerts() {
    const params = new URLSearchParams(searchParams.toString())
    if (showAlerts) {
      params.delete('alerts')
    } else {
      params.set('alerts', '1')
    }
    router.push(`/internal/email/health?${params.toString()}`)
  }

  if (!data.ok) {
    return (
      <div className="p-8 text-center">
        <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
        <p className="text-lg text-red-400 font-medium">Erreur de chargement</p>
        <p className="text-sm text-slate-400 mt-2">{data.error || 'Impossible de contacter le backend'}</p>
        <Button
          className="mt-4"
          variant="outline"
          onClick={() => router.refresh()}
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Réessayer
        </Button>
      </div>
    )
  }

  const global = data.global
  const topRisk = data.topRiskOrgs || []
  const lastWebhook = data.lastSesWebhook
  const alerts = alertsData?.alerts || data.alerts

  // Count warming orgs from topRisk
  const warmingCount = topRisk.filter(o => o.warmupStatus === 'warming' || o.warmupStatus === 'cold').length

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-white">📧 Email Health</h1>
          {alerts && <HealthStatusBadge alerts={alerts} />}
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
          <Button
            variant="outline"
            size="sm"
            onClick={toggleAlerts}
            className={`border-slate-600 ${showAlerts ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'text-slate-300'}`}
          >
            <Eye className="h-4 w-4 mr-1.5" />
            {showAlerts ? 'Alertes ON' : 'Alertes OFF'}
          </Button>
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

      {/* KPI Cards */}
      <GlobalHealthKpi
        sent={global.sentCount || 0}
        bounceRate={global.bounceRate || 0}
        complaintRate={global.complaintRate || 0}
        lastWebhookHoursSince={lastWebhook?.hoursSince ?? null}
        lastWebhookAt={lastWebhook?.lastSeenAt ?? null}
        warmingOrgCount={warmingCount}
      />

      {/* Alerts Summary (only if toggled) */}
      {showAlerts && alerts && alerts.length > 0 && (
        <Card className="bg-slate-800/50 border-red-500/20">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-400" />
                Alertes actives ({alerts.length})
              </CardTitle>
              <Link href={`/internal/email/alerts?window=${currentWindow}`}>
                <Button variant="ghost" size="sm" className="text-amber-400 hover:text-amber-300">
                  Voir tout <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-2">
              {alerts.slice(0, 5).map((alert, i) => (
                <div
                  key={alert.id || i}
                  className="flex items-center gap-3 p-2 rounded-lg bg-slate-700/30"
                >
                  <SeverityDot severity={alert.severity} />
                  <span className="text-xs font-mono text-slate-400 w-48 truncate">{alert.type}</span>
                  <span className="text-sm text-slate-300 flex-1 truncate">{alert.message}</span>
                  {alert.orgId && (
                    <Link href={`/internal/email/orgs/${alert.orgId}`}>
                      <Badge variant="outline" className="text-xs border-slate-600 text-slate-400 hover:text-white cursor-pointer">
                        {alert.orgName || alert.orgId}
                      </Badge>
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top Risk Orgs */}
      {topRisk.length > 0 && (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base text-white">
                🎯 Top Risk Organisations
              </CardTitle>
              <Link href={`/internal/email/top-risk?window=${currentWindow}`}>
                <Button variant="ghost" size="sm" className="text-amber-400 hover:text-amber-300">
                  Voir tout <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-700">
                    <th className="text-left py-2 px-2 font-medium">Organisation</th>
                    <th className="text-right py-2 px-2 font-medium">Envoyés</th>
                    <th className="text-right py-2 px-2 font-medium">Bounces</th>
                    <th className="text-right py-2 px-2 font-medium">Complaints</th>
                    <th className="text-right py-2 px-2 font-medium">Bounce %</th>
                    <th className="text-right py-2 px-2 font-medium">Complaint %</th>
                    <th className="text-center py-2 px-2 font-medium">Warmup</th>
                  </tr>
                </thead>
                <tbody>
                  {topRisk.slice(0, 10).map((org) => (
                    <tr
                      key={org.org_id}
                      className="border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors"
                    >
                      <td className="py-2.5 px-2">
                        <Link
                          href={`/internal/email/orgs/${org.org_id}`}
                          className="text-blue-400 hover:text-blue-300 hover:underline"
                        >
                          {org.org_name || org.org_id}
                        </Link>
                      </td>
                      <td className="text-right py-2.5 px-2 text-slate-300 tabular-nums">
                        {org.sent}
                      </td>
                      <td className="text-right py-2.5 px-2 text-slate-300 tabular-nums">
                        {org.bounces}
                      </td>
                      <td className="text-right py-2.5 px-2 text-slate-300 tabular-nums">
                        {org.complaints}
                      </td>
                      <td className="text-right py-2.5 px-2 tabular-nums">
                        <RateCell value={org.bounceRate} orangeThreshold={0.02} redThreshold={0.05} />
                      </td>
                      <td className="text-right py-2.5 px-2 tabular-nums">
                        <RateCell value={org.complaintRate} orangeThreshold={0.0005} redThreshold={0.001} />
                      </td>
                      <td className="text-center py-2.5 px-2">
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

      {/* Quick Links */}
      <div className="flex flex-wrap gap-3">
        <Link href={`/internal/email/alerts?window=${currentWindow}`}>
          <Button variant="outline" className="border-slate-600 text-slate-300 hover:text-white gap-2">
            <AlertTriangle className="h-4 w-4" />
            Toutes les alertes
          </Button>
        </Link>
        <Link href={`/internal/email/top-risk?window=${currentWindow}`}>
          <Button variant="outline" className="border-slate-600 text-slate-300 hover:text-white gap-2">
            🎯 Top risk complet
          </Button>
        </Link>
      </div>
    </div>
  )
}

// ============ HELPER COMPONENTS ============

function SeverityDot({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    red: 'bg-red-500',
    orange: 'bg-amber-500',
    info: 'bg-blue-500',
  }
  return <span className={`w-2 h-2 rounded-full flex-shrink-0 ${colors[severity] || 'bg-slate-500'}`} />
}

function RateCell({ value, orangeThreshold, redThreshold }: {
  value: number
  orangeThreshold: number
  redThreshold: number
}) {
  const formatted = `${(value * 100).toFixed(3)}%`
  let color: string
  if (value >= redThreshold) color = 'text-red-400 font-semibold'
  else if (value >= orangeThreshold) color = 'text-amber-400'
  else color = 'text-green-400'
  return <span className={color}>{formatted}</span>
}

export function WarmupBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    warm: 'bg-green-500/20 text-green-400 border-green-500/30',
    warming: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    cold: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  }
  return (
    <Badge className={`text-[10px] px-1.5 py-0.5 ${styles[status] || 'bg-slate-500/20 text-slate-400'}`}>
      {status}
    </Badge>
  )
}
