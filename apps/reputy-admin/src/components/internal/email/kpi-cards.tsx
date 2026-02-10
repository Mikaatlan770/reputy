'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Send,
  AlertTriangle,
  ShieldAlert,
  Webhook,
  Flame,
} from 'lucide-react'

interface KpiCardProps {
  label: string
  value: string | number
  icon: React.ReactNode
  color?: string
  subtitle?: string
  alert?: boolean
}

function KpiCard({ label, value, icon, color = 'text-slate-300', subtitle, alert }: KpiCardProps) {
  return (
    <Card className={`bg-slate-800/50 border-slate-700 ${alert ? 'border-red-500/40 ring-1 ring-red-500/20' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-slate-400 font-medium">{label}</p>
          <span className={color}>{icon}</span>
        </div>
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
        {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
      </CardContent>
    </Card>
  )
}

interface GlobalHealthKpiProps {
  sent: number
  bounceRate: number
  complaintRate: number
  lastWebhookHoursSince: number | null
  lastWebhookAt: string | null
  warmingOrgCount?: number
}

export function GlobalHealthKpi({
  sent,
  bounceRate,
  complaintRate,
  lastWebhookHoursSince,
  lastWebhookAt,
  warmingOrgCount = 0,
}: GlobalHealthKpiProps) {
  const formatRate = (rate: number) => `${(rate * 100).toFixed(3)}%`
  const formatTimeAgo = (hours: number | null): string => {
    if (hours === null) return 'N/A'
    if (hours < 1) return '< 1h'
    if (hours < 24) return `${Math.round(hours)}h`
    return `${Math.round(hours / 24)}d`
  }

  const bounceAlert = bounceRate >= 0.05
  const complaintAlert = complaintRate >= 0.001
  const webhookAlert = lastWebhookHoursSince !== null && lastWebhookHoursSince > 24

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <KpiCard
        label="Emails envoyés"
        value={sent.toLocaleString('fr-FR')}
        icon={<Send className="h-4 w-4" />}
        color="text-blue-400"
      />
      <KpiCard
        label="Bounce rate"
        value={formatRate(bounceRate)}
        icon={<AlertTriangle className="h-4 w-4" />}
        color={bounceAlert ? 'text-red-400' : bounceRate >= 0.02 ? 'text-amber-400' : 'text-green-400'}
        alert={bounceAlert}
        subtitle={bounceRate >= 0.05 ? '⚠️ SES Danger' : bounceRate >= 0.02 ? '⚠️ Élevé' : '✅ OK'}
      />
      <KpiCard
        label="Complaint rate"
        value={formatRate(complaintRate)}
        icon={<ShieldAlert className="h-4 w-4" />}
        color={complaintAlert ? 'text-red-400' : complaintRate >= 0.0005 ? 'text-amber-400' : 'text-green-400'}
        alert={complaintAlert}
        subtitle={complaintRate >= 0.001 ? '🔴 SES Danger' : complaintRate >= 0.0005 ? '🟠 Attention' : '✅ OK'}
      />
      <KpiCard
        label="Last webhook SES"
        value={formatTimeAgo(lastWebhookHoursSince)}
        icon={<Webhook className="h-4 w-4" />}
        color={webhookAlert ? 'text-red-400' : 'text-slate-300'}
        alert={webhookAlert}
        subtitle={lastWebhookAt ? new Date(lastWebhookAt).toLocaleString('fr-FR') : 'Jamais reçu'}
      />
      <KpiCard
        label="Orgs en warm-up"
        value={warmingOrgCount}
        icon={<Flame className="h-4 w-4" />}
        color={warmingOrgCount > 0 ? 'text-amber-400' : 'text-slate-400'}
      />
    </div>
  )
}

interface HealthStatusBadgeProps {
  alerts?: Array<{ severity: string }>
}

export function HealthStatusBadge({ alerts }: HealthStatusBadgeProps) {
  if (!alerts || alerts.length === 0) {
    return (
      <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-sm px-3 py-1">
        🟢 OK
      </Badge>
    )
  }

  const hasRed = alerts.some(a => a.severity === 'red')
  const hasOrange = alerts.some(a => a.severity === 'orange')

  if (hasRed) {
    return (
      <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-sm px-3 py-1 animate-pulse">
        🔴 Incident
      </Badge>
    )
  }

  if (hasOrange) {
    return (
      <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30 text-sm px-3 py-1">
        🟠 Attention
      </Badge>
    )
  }

  return (
    <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-sm px-3 py-1">
      🟢 OK
    </Badge>
  )
}
