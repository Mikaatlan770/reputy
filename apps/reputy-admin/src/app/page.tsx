'use client'

import { useAppStore } from '@/lib/store'
import { useAuth, useIsClient } from '@/lib/auth'
import { kpiData } from '@/lib/mock-data'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { ReviewsChart } from '@/components/dashboard/reviews-chart'
import { PendingReviews } from '@/components/dashboard/pending-reviews'
import { QuickActions } from '@/components/dashboard/quick-actions'
import { StarDistribution } from '@/components/dashboard/star-distribution'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
} from 'lucide-react'

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

  const periodEnd = clientOrg.billing?.periodEnd 
    ? new Date(clientOrg.billing.periodEnd).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })
    : 'fin du mois'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Mes crédits</h2>
        {billing && (
          <div className="flex items-center gap-2">
            {billing.isNegotiated && billing.discountPercent && (
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
              {billing.isNegotiated && billing.priceMonthlyFinalCents !== billing.priceBaseCents ? (
                <>
                  <span className="line-through mr-1">{formatPrice(billing.priceBaseCents)}</span>
                  <span className="font-semibold text-foreground">{formatPrice(billing.priceMonthlyFinalCents)}</span>
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
  const kpi = currentLocation ? kpiData[currentLocation.id] : null

  if (!kpi) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Chargement...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Bienvenue ! Voici un aperçu de votre e-réputation.
        </p>
      </div>

      {/* Credits Section for clients */}
      <CreditsSection />

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <KpiCard
          title="Note moyenne"
          value={kpi.averageRating.toFixed(1)}
          subtitle="sur Google"
          icon={Star}
          trend={{ value: 2.5, isPositive: true }}
          iconColor="text-amber-500"
          iconBg="bg-amber-50"
        />
        <KpiCard
          title="Total avis"
          value={kpi.totalReviews}
          subtitle="tous canaux"
          icon={MessageSquare}
          iconColor="text-blue-500"
          iconBg="bg-blue-50"
        />
        <KpiCard
          title="Avis 30 jours"
          value={kpi.reviews30Days}
          subtitle="ce mois"
          icon={TrendingUp}
          trend={{ value: 15, isPositive: true }}
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
          subtitle="objectif: 95%"
          icon={CheckCircle}
          iconColor="text-emerald-500"
          iconBg="bg-emerald-50"
        />
        <KpiCard
          title="Délai réponse"
          value={`${kpi.avgResponseTime}h`}
          subtitle="moyenne"
          icon={Clock}
          trend={{ value: 8, isPositive: true }}
          iconColor="text-purple-500"
          iconBg="bg-purple-50"
        />
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Chart - Takes 2 columns */}
        <div className="lg:col-span-2">
          <ReviewsChart />
        </div>

        {/* Star Distribution */}
        <div>
          <StarDistribution />
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
