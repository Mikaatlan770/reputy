'use client'

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
import { AlertTriangle, ArrowLeft, Eye, RefreshCw } from 'lucide-react'
import { PauseButton } from './pause-button'
import type { EmailAlert, EmailAlertsResponse } from '@/lib/internal/email-actions'

interface AlertsTableProps {
  data: EmailAlertsResponse
}

export function AlertsTable({ data }: AlertsTableProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentWindow = searchParams.get('window') || '7d'

  function handleWindowChange(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('window', value)
    router.push(`/internal/email/alerts?${params.toString()}`)
  }

  if (!data.ok) {
    return (
      <div className="p-8 text-center">
        <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
        <p className="text-lg text-red-400 font-medium">Erreur de chargement</p>
        <p className="text-sm text-slate-400 mt-2">{data.error || 'Impossible de contacter le backend'}</p>
      </div>
    )
  }

  const alerts = data.alerts || []
  const redCount = alerts.filter(a => a.severity === 'red').length
  const orangeCount = alerts.filter(a => a.severity === 'orange').length

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
          <h1 className="text-2xl font-bold text-white">🚨 Alertes Email</h1>
          <div className="flex gap-2">
            {redCount > 0 && (
              <Badge className="bg-red-500/20 text-red-400 border-red-500/30">
                {redCount} RED
              </Badge>
            )}
            {orangeCount > 0 && (
              <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">
                {orangeCount} ORANGE
              </Badge>
            )}
            {alerts.length === 0 && (
              <Badge className="bg-green-500/20 text-green-400 border-green-500/30">
                Aucune alerte
              </Badge>
            )}
          </div>
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
            variant="ghost"
            size="icon"
            onClick={() => router.refresh()}
            className="text-slate-400 hover:text-white"
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Alerts Table */}
      {alerts.length === 0 ? (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="py-12 text-center">
            <p className="text-4xl mb-3">✅</p>
            <p className="text-lg text-green-400 font-medium">Aucune alerte active</p>
            <p className="text-sm text-slate-400 mt-1">
              Tous les indicateurs sont dans les seuils normaux pour la fenêtre {currentWindow}.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="bg-slate-800/50 border-slate-700">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-400 border-b border-slate-700">
                    <th className="text-left py-3 px-4 font-medium w-8"></th>
                    <th className="text-left py-3 px-4 font-medium">Sévérité</th>
                    <th className="text-left py-3 px-4 font-medium">Type</th>
                    <th className="text-left py-3 px-4 font-medium">Organisation</th>
                    <th className="text-left py-3 px-4 font-medium">Message</th>
                    <th className="text-right py-3 px-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.map((alert, i) => (
                    <AlertRow key={alert.id || i} alert={alert} />
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

function AlertRow({ alert }: { alert: EmailAlert }) {
  const severityStyles: Record<string, { bg: string; text: string; label: string }> = {
    red: { bg: 'bg-red-500/10', text: 'text-red-400', label: '🔴 RED' },
    orange: { bg: 'bg-amber-500/10', text: 'text-amber-400', label: '🟠 ORANGE' },
    info: { bg: 'bg-blue-500/10', text: 'text-blue-400', label: 'ℹ️ INFO' },
  }
  const style = severityStyles[alert.severity] || severityStyles.info

  return (
    <tr className={`${style.bg} border-b border-slate-700/50 hover:bg-slate-700/30 transition-colors`}>
      <td className="py-3 px-4">
        <span className={`w-2.5 h-2.5 rounded-full block ${
          { red: 'bg-red-500 animate-pulse', orange: 'bg-amber-500' }[alert.severity] ?? 'bg-blue-500'
        }`} />
      </td>
      <td className="py-3 px-4">
        <Badge className={`${
          { red: 'bg-red-500/20 text-red-400 border-red-500/30', orange: 'bg-amber-500/20 text-amber-400 border-amber-500/30' }[alert.severity] ?? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
        } text-xs`}>
          {style.label}
        </Badge>
      </td>
      <td className="py-3 px-4">
        <span className="font-mono text-xs text-slate-400">{alert.type}</span>
      </td>
      <td className="py-3 px-4">
        {alert.orgId ? (
          <Link
            href={`/internal/email/orgs/${alert.orgId}`}
            className="text-blue-400 hover:text-blue-300 hover:underline text-sm"
          >
            {alert.orgName || alert.orgId}
          </Link>
        ) : (
          <span className="text-slate-500 text-sm">Global</span>
        )}
      </td>
      <td className="py-3 px-4">
        <span className="text-slate-300 text-sm">{alert.message}</span>
      </td>
      <td className="py-3 px-4 text-right">
        <div className="flex items-center justify-end gap-2">
          {alert.orgId && (
            <>
              <Link href={`/internal/email/orgs/${alert.orgId}`}>
                <Button variant="ghost" size="sm" className="text-slate-400 hover:text-white gap-1 text-xs">
                  <Eye className="h-3.5 w-3.5" />
                  Voir
                </Button>
              </Link>
              {alert.severity === 'red' && (
                <PauseButton
                  orgId={alert.orgId}
                  orgName={alert.orgName}
                  isPaused={false}
                  variant="compact"
                />
              )}
            </>
          )}
        </div>
      </td>
    </tr>
  )
}
