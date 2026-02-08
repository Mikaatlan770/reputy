'use client'

import { useState } from 'react'
import { useAppStore } from '@/lib/store'
import { useAuth, useIsClient } from '@/lib/auth'
import { useReviewStats, statsToKpiData, StatsPeriod } from '@/lib/reviews'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { ReviewsChart } from '@/components/dashboard/reviews-chart'
import { PendingReviews } from '@/components/dashboard/pending-reviews'
import { QuickActions } from '@/components/dashboard/quick-actions'
import { StarDistribution } from '@/components/dashboard/star-distribution'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Star,
  MessageSquare,
  TrendingUp,
  Clock,
  AlertCircle,
  CheckCircle,
  Mail,
  Sparkles,
  CreditCard,
  Package,
  Calendar,
} from 'lucide-react'

// Period options for the selector
const PERIOD_OPTIONS: { value: StatsPeriod; label: string }[] = [
  { value: '7d', label: '7 jours' },
  { value: '30d', label: '30 jours' },
  { value: '90d', label: '90 jours' },
]

// Helper to format delta display
function formatDelta(value: number | null, suffix: string = '%'): { display: string; isPositive: boolean } | null {
  if (value === null) return null
  return {
    display: `${value > 0 ? '+' : ''}${value}${suffix}`,
    isPositive: value >= 0,
  }
}

// Helper to format response time
function formatResponseTime(hours: number | null): string {
  if (hours === null) return '—'
  if (hours < 1) return `${Math.round(hours * 60)}min`
  return `${hours}h`
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
  }).format(cents / 100)
}

function CreditsSection() {
  const { clientOrg } = useAuth()
  const isClient = useIsClient()

  if (!isClient || !clientOrg) return null

  const credits = clientOrg.creditsComputed
  const billing = clientOrg.billingComputed

  if (!credits) return null

  // Use pre-formatted period end from backend or fallback to local formatting
  const periodEnd = billing?.periodEndFormatted 
    || (clientOrg.billing?.periodEnd 
      ? new Date(clientOrg.billing.periodEnd).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
      : 'fin du mois')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Mes crédits</h2>
        {billing && (
          <div className="flex items-center gap-2">
            {/* Show discount badge if has coupon/discount */}
            {billing.hasDiscount && billing.discount?.label && (
              <Badge className="bg-green-500/20 text-green-600">
                {billing.discount.label}
              </Badge>
            )}
            {billing.isNegotiated && billing.discountPercent && !billing.hasDiscount && (
              <Badge className="bg-amber-500/20 text-amber-600">
                -{billing.discountPercent}%
              </Badge>
            )}
            {billing.isProrata && (
              <Badge className="bg-purple-500/20 text-purple-600">
                Prorata
              </Badge>
            )}
            <span className="text-sm text-muted-foreground">
              {/* Use effective billing prices if available */}
              {billing.hasDiscount && billing.priceCatalogCents && billing.priceEffectiveCents ? (
                <>
                  <span className="line-through mr-1">{formatPrice(billing.priceCatalogCents)}</span>
                  <span className="font-semibold text-green-600">{formatPrice(billing.priceEffectiveCents)}</span>
                  <span className="text-xs">/mois</span>
                </>
              ) : billing.priceEffectiveCents !== undefined ? (
                <>
                  <span className="font-semibold text-foreground">{formatPrice(billing.priceEffectiveCents)}</span>
                  <span className="text-xs">/mois</span>
                </>
              ) : (
                <>
                  <span className="font-semibold text-foreground">{formatPrice(billing?.priceMonthlyFinalCents || 0)}</span>
                  <span className="text-xs">/mois</span>
                </>
              )}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Abonnement (mensuel) */}
        <Card className="border-blue-200 bg-blue-50/50 dark:border-blue-900 dark:bg-blue-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-blue-500" />
              Abonnement
              <Badge variant="outline" className="text-[10px] text-blue-600 border-blue-300">
                Expire le {periodEnd}
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* SMS */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="h-4 w-4 text-blue-500" />
                <span className="text-sm">SMS</span>
              </div>
              <div className="text-right">
                <span className="font-semibold">{credits.subscription.smsUsed}</span>
                <span className="text-muted-foreground"> / {credits.subscription.smsTotal}</span>
                {(credits.subscription.smsGiftMonthly || 0) > 0 && (
                  <span className="text-amber-500 text-xs ml-1">(+{credits.subscription.smsGiftMonthly} offerts)</span>
                )}
              </div>
            </div>
            <div className="h-1.5 bg-blue-100 dark:bg-blue-900 rounded-full overflow-hidden">
              <div 
                className="h-full bg-blue-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, credits.subscription.smsTotal > 0 ? (credits.subscription.smsUsed / credits.subscription.smsTotal) * 100 : 0)}%` }}
              />
            </div>

            {/* Email */}
            <div className="flex items-center justify-between mt-3">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-orange-500" />
                <span className="text-sm">Emails</span>
              </div>
              <div className="text-right">
                <span className="font-semibold">{credits.subscription.emailUsed}</span>
                <span className="text-muted-foreground"> / {credits.subscription.emailTotal}</span>
                {(credits.subscription.emailGiftMonthly || 0) > 0 && (
                  <span className="text-amber-500 text-xs ml-1">(+{credits.subscription.emailGiftMonthly} offerts)</span>
                )}
              </div>
            </div>
            <div className="h-1.5 bg-orange-100 dark:bg-orange-900 rounded-full overflow-hidden">
              <div 
                className="h-full bg-orange-500 rounded-full transition-all"
                style={{ width: `${Math.min(100, credits.subscription.emailTotal > 0 ? (credits.subscription.emailUsed / credits.subscription.emailTotal) * 100 : 0)}%` }}
              />
            </div>

            {/* IA (si disponible) */}
            {credits.subscription.aiTotal !== undefined && credits.subscription.aiTotal > 0 && (
              <>
                <div className="flex items-center justify-between mt-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-purple-500" />
                    <span className="text-sm">Crédits IA</span>
                  </div>
                  <div className="text-right">
                    <span className="font-semibold">{credits.subscription.aiUsed || 0}</span>
                    <span className="text-muted-foreground"> / {credits.subscription.aiTotal}</span>
                    {(credits.subscription.aiGiftMonthly || 0) > 0 && (
                      <span className="text-amber-500 text-xs ml-1">(+{credits.subscription.aiGiftMonthly} offerts)</span>
                    )}
                  </div>
                </div>
                <div className="h-1.5 bg-purple-100 dark:bg-purple-900 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-purple-500 rounded-full transition-all"
                    style={{ width: `${Math.min(100, credits.subscription.aiTotal > 0 ? ((credits.subscription.aiUsed || 0) / credits.subscription.aiTotal) * 100 : 0)}%` }}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Packs (persistants) */}
        <Card className="border-emerald-200 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Package className="h-4 w-4 text-emerald-500" />
              Packs achetés
              <Badge variant="outline" className="text-[10px] text-emerald-600 border-emerald-300">
                Persistants
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="flex items-center justify-center gap-1 mb-1">
                  <MessageSquare className="h-3 w-3 text-blue-500" />
                  <span className="text-xs text-muted-foreground">SMS</span>
                </div>
                <p className="text-2xl font-bold text-emerald-600">{credits.pack.smsRemaining}</p>
              </div>
              <div>
                <div className="flex items-center justify-center gap-1 mb-1">
                  <Mail className="h-3 w-3 text-orange-500" />
                  <span className="text-xs text-muted-foreground">Emails</span>
                </div>
                <p className="text-2xl font-bold text-emerald-600">{credits.pack.emailRemaining}</p>
              </div>
              {credits.pack.aiRemaining !== undefined && (
                <div>
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Sparkles className="h-3 w-3 text-purple-500" />
                    <span className="text-xs text-muted-foreground">IA</span>
                  </div>
                  <p className="text-2xl font-bold text-emerald-600">{credits.pack.aiRemaining}</p>
                </div>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-3 text-center">
              Les packs restent jusqu'à consommation
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Total disponible */}
      <Card>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Total disponible ce mois</span>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <MessageSquare className="h-4 w-4 text-blue-500" />
                <span className="font-bold">{credits.total.smsRemaining}</span>
                <span className="text-xs text-muted-foreground">SMS</span>
              </div>
              <div className="flex items-center gap-1">
                <Mail className="h-4 w-4 text-orange-500" />
                <span className="font-bold">{credits.total.emailRemaining}</span>
                <span className="text-xs text-muted-foreground">Emails</span>
              </div>
              {credits.total.aiRemaining !== undefined && (
                <div className="flex items-center gap-1">
                  <Sparkles className="h-4 w-4 text-purple-500" />
                  <span className="font-bold">{credits.total.aiRemaining}</span>
                  <span className="text-xs text-muted-foreground">IA</span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default function DashboardPage() {
  const { currentLocation } = useAppStore()
  const [period, setPeriod] = useState<StatsPeriod>('30d')
  const { stats, loading: statsLoading, error: statsError } = useReviewStats(period)
  const kpi = statsToKpiData(stats)

  // Calculate trend objects from deltas
  const ratingTrend = kpi.avgRatingDelta !== null 
    ? { value: kpi.avgRatingDelta, isPositive: kpi.avgRatingDelta >= 0 }
    : undefined
  const reviewsTrend = kpi.reviewsDeltaPct !== null
    ? { value: kpi.reviewsDeltaPct, isPositive: kpi.reviewsDeltaPct >= 0 }
    : undefined
  const responseTrend = kpi.responseRateDeltaPct !== null
    ? { value: kpi.responseRateDeltaPct, isPositive: kpi.responseRateDeltaPct >= 0 }
    : undefined

  if (statsLoading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">Chargement des données...</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (statsError) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <p className="text-red-500 mb-2">Erreur lors du chargement des données</p>
          <p className="text-muted-foreground text-sm">{statsError}</p>
        </div>
      </div>
    )
  }

  // Period label for subtitles
  const periodLabel = PERIOD_OPTIONS.find(p => p.value === period)?.label || '30 jours'

  return (
    <div className="space-y-6">
      {/* Header with Period Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Bienvenue ! Voici un aperçu de votre e-réputation.
          </p>
        </div>
        
        {/* Period Selector */}
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <div className="flex gap-1 rounded-lg border bg-muted/50 p-1">
            {PERIOD_OPTIONS.map((option) => (
              <Button
                key={option.value}
                variant={period === option.value ? 'default' : 'ghost'}
                size="sm"
                className="text-xs"
                onClick={() => setPeriod(option.value)}
              >
                {option.label}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Credits Section for clients */}
      <CreditsSection />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard
          title="Note moyenne"
          value={kpi.averageRating.toFixed(1)}
          subtitle={`sur ${periodLabel}`}
          icon={Star}
          trend={ratingTrend}
          iconColor="text-amber-500"
          iconBg="bg-amber-50"
        />
        <KpiCard
          title="Total avis"
          value={kpi.totalReviews}
          subtitle="tous temps"
          icon={MessageSquare}
          iconColor="text-blue-500"
          iconBg="bg-blue-50"
        />
        <KpiCard
          title={`Avis ${periodLabel}`}
          value={kpi.totalPeriod}
          subtitle="cette période"
          icon={TrendingUp}
          trend={reviewsTrend}
          iconColor="text-green-500"
          iconBg="bg-green-50"
        />
        <KpiCard
          title="Non répondus"
          value={kpi.unrepliedReviews}
          subtitle="à traiter"
          icon={AlertCircle}
          iconColor="text-red-500"
          iconBg="bg-red-50"
        />
        <KpiCard
          title="Taux réponse"
          value={`${kpi.responseRate}%`}
          subtitle={`sur ${periodLabel}`}
          icon={CheckCircle}
          trend={responseTrend}
          iconColor="text-emerald-500"
          iconBg="bg-emerald-50"
        />
        <KpiCard
          title="Délai réponse"
          value={formatResponseTime(kpi.avgResponseTime)}
          subtitle="moyenne"
          icon={Clock}
          iconColor="text-purple-500"
          iconBg="bg-purple-50"
        />
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart - Takes 2 columns */}
        <div className="lg:col-span-2">
          <ReviewsChart period={period} />
        </div>

        {/* Star Distribution */}
        <div>
          <StarDistribution period={period} />
        </div>
      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending Reviews */}
        <PendingReviews />

        {/* Quick Actions */}
        <QuickActions />
      </div>
    </div>
  )
}
