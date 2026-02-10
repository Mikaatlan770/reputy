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
import {
  AlertTriangle,
  ArrowLeft,
  Clipboard,
  Flame,
  Pause,
  Play,
  RefreshCw,
  Send,
  ShieldAlert,
} from 'lucide-react'
import { PauseButton } from './pause-button'
import { ForceWarmButton } from './force-warm-button'
import type {
  OrgEmailStatsResponse,
  PauseStateResponse,
  WarmupState,
} from '@/lib/internal/email-actions'

interface OrgEmailDetailProps {
  stats: OrgEmailStatsResponse
  pauseState: PauseStateResponse
}

export function OrgEmailDetail({ stats, pauseState }: OrgEmailDetailProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const currentWindow = searchParams.get('window') || '7d'

  function handleWindowChange(value: string) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('window', value)
    router.push(`/internal/email/orgs/${stats.orgId}?${params.toString()}`)
  }

  function copyOrgId() {
    navigator.clipboard.writeText(stats.orgId)
  }

  if (!stats.ok) {
    return (
      <div className="p-8 text-center">
        <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
        <p className="text-lg text-red-400 font-medium">Erreur</p>
        <p className="text-sm text-slate-400 mt-2">{stats.error || 'Organisation introuvable'}</p>
        <Link href="/internal/email/health">
          <Button variant="outline" className="mt-4 border-slate-600 text-slate-300">
            <ArrowLeft className="h-4 w-4 mr-2" /> Retour
          </Button>
        </Link>
      </div>
    )
  }

  const s = stats.stats
  const warmup = stats.warmupState
  const isPaused = pauseState.paused
  const pauseReason = pauseState.reason

  const formatRate = (rate: number) => `${((rate || 0) * 100).toFixed(3)}%`

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
          <div>
            <h1 className="text-2xl font-bold text-white">
              {stats.orgName || stats.orgId}
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-slate-500 font-mono">{stats.orgId}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 text-slate-500 hover:text-white"
                onClick={copyOrgId}
              >
                <Clipboard className="h-3 w-3" />
              </Button>
              {stats.plan && (
                <Badge variant="outline" className="text-[10px] border-slate-600 text-slate-400">
                  {stats.plan}
                </Badge>
              )}
            </div>
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

      {/* Pause Banner */}
      {isPaused && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
          <Pause className="h-5 w-5 text-red-400 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-400">Emails en pause</p>
            {pauseReason && (
              <p className="text-xs text-red-300/70 mt-0.5 font-mono">{pauseReason}</p>
            )}
          </div>
          <PauseButton
            orgId={stats.orgId}
            orgName={stats.orgName}
            isPaused={true}
            currentReason={pauseReason}
            variant="compact"
          />
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <StatCard
          label="Envoyés"
          value={s.sentCount || 0}
          icon={<Send className="h-4 w-4" />}
          color="text-blue-400"
        />
        <StatCard
          label="Bounce rate"
          value={formatRate(s.bounceRate)}
          icon={<AlertTriangle className="h-4 w-4" />}
          color={(s.bounceRate || 0) >= 0.05 ? 'text-red-400' : (s.bounceRate || 0) >= 0.02 ? 'text-amber-400' : 'text-green-400'}
          alert={(s.bounceRate || 0) >= 0.05}
        />
        <StatCard
          label="Complaint rate"
          value={formatRate(s.complaintRate)}
          icon={<ShieldAlert className="h-4 w-4" />}
          color={(s.complaintRate || 0) >= 0.001 ? 'text-red-400' : (s.complaintRate || 0) >= 0.0005 ? 'text-amber-400' : 'text-green-400'}
          alert={(s.complaintRate || 0) >= 0.001}
        />
        <WarmupCard warmup={warmup} />
        <PauseCard isPaused={isPaused} reason={pauseReason} />
      </div>

      {/* Detail cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Stats breakdown */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-base text-white">📊 Détails ({currentWindow})</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <StatRow label="Emails envoyés" value={s.sentCount || 0} />
            <StatRow label="Bounces" value={s.bounceCount || 0} color={(s.bounceCount || 0) > 0 ? 'text-red-400' : undefined} />
            <StatRow label="Complaints" value={s.complaintCount || 0} color={(s.complaintCount || 0) > 0 ? 'text-red-400' : undefined} />
            <StatRow label="Delivered" value={s.deliveredCount || 0} color="text-green-400" />
            <StatRow label="Clicks" value={s.clickCount || 0} color="text-blue-400" />
            <div className="border-t border-slate-700 pt-3 mt-3">
              <StatRow label="Bounce rate" value={formatRate(s.bounceRate)} />
              <StatRow label="Complaint rate" value={formatRate(s.complaintRate)} />
              <StatRow label="Delivery rate" value={formatRate(s.deliveryRate)} />
              <StatRow label="Click rate" value={formatRate(s.clickRate)} />
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-base text-white">⚡ Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Pause/Resume */}
            <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
              <div>
                <p className="text-sm font-medium text-white">
                  {isPaused ? 'Emails en pause' : 'Emails actifs'}
                </p>
                <p className="text-xs text-slate-400">
                  {isPaused ? 'Aucun email ne sera envoyé' : 'Les emails s\'envoient normalement'}
                </p>
              </div>
              <PauseButton
                orgId={stats.orgId}
                orgName={stats.orgName}
                isPaused={isPaused}
                currentReason={pauseReason}
              />
            </div>

            {/* Force warm */}
            {warmup && warmup.status !== 'warm' && (
              <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
                <div>
                  <p className="text-sm font-medium text-white">Warm-up</p>
                  <p className="text-xs text-slate-400">
                    Status: <span className="text-amber-400 font-mono">{warmup.status}</span>
                    {warmup.day !== undefined && warmup.day !== null && (
                      <> — Jour {warmup.day}</>
                    )}
                  </p>
                </div>
                <ForceWarmButton
                  orgId={stats.orgId}
                  orgName={stats.orgName}
                  warmupStatus={warmup.status}
                />
              </div>
            )}

            {/* Lien vers le client */}
            <div className="flex items-center justify-between p-3 bg-slate-700/30 rounded-lg">
              <div>
                <p className="text-sm font-medium text-white">Fiche client</p>
                <p className="text-xs text-slate-400">Voir le détail complet de l&apos;org</p>
              </div>
              <Link href={`/internal/clients/${stats.orgId}`}>
                <Button variant="outline" size="sm" className="border-slate-600 text-slate-300">
                  Voir client
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// ============ HELPERS ============

function StatCard({ label, value, icon, color, alert }: {
  label: string
  value: string | number
  icon: React.ReactNode
  color: string
  alert?: boolean
}) {
  return (
    <Card className={`bg-slate-800/50 border-slate-700 ${alert ? 'border-red-500/40 ring-1 ring-red-500/20' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-slate-400 font-medium">{label}</p>
          <span className={color}>{icon}</span>
        </div>
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
      </CardContent>
    </Card>
  )
}

function WarmupCard({ warmup }: { warmup: WarmupState }) {
  if (!warmup) return null
  const statusColor: Record<string, string> = {
    warm: 'text-green-400',
    warming: 'text-amber-400',
    cold: 'text-blue-400',
  }
  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-slate-400 font-medium">Warm-up</p>
          <Flame className={`h-4 w-4 ${statusColor[warmup.status] || 'text-slate-400'}`} />
        </div>
        <p className={`text-xl font-bold ${statusColor[warmup.status] || 'text-slate-300'}`}>
          {warmup.status}
        </p>
        {warmup.day !== undefined && warmup.day !== null && warmup.status !== 'warm' && (
          <p className="text-[11px] text-slate-500 mt-0.5">Jour {warmup.day}</p>
        )}
        {warmup.limits && (
          <p className="text-[11px] text-slate-500">
            Limite: {warmup.limits.daily}/j · {warmup.limits.hourly}/h
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function PauseCard({ isPaused, reason }: { isPaused: boolean; reason: string | null }) {
  return (
    <Card className={`bg-slate-800/50 border-slate-700 ${isPaused ? 'border-red-500/40 ring-1 ring-red-500/20' : ''}`}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-1">
          <p className="text-xs text-slate-400 font-medium">Pause état</p>
          {isPaused
            ? <Pause className="h-4 w-4 text-red-400" />
            : <Play className="h-4 w-4 text-green-400" />
          }
        </div>
        <p className={`text-xl font-bold ${isPaused ? 'text-red-400' : 'text-green-400'}`}>
          {isPaused ? 'PAUSÉ' : 'ACTIF'}
        </p>
        {isPaused && reason && (
          <p className="text-[11px] text-red-300/60 font-mono truncate mt-0.5">{reason}</p>
        )}
      </CardContent>
    </Card>
  )
}

function StatRow({ label, value, color }: {
  label: string
  value: string | number
  color?: string
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-sm text-slate-400">{label}</span>
      <span className={`text-sm font-medium tabular-nums ${color || 'text-slate-200'}`}>{value}</span>
    </div>
  )
}
