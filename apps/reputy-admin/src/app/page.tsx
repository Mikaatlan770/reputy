'use client'

import { useAppStore } from '@/lib/store'
import { kpiData } from '@/lib/mock-data'
import { KpiCard } from '@/components/dashboard/kpi-card'
import { ReviewsChart } from '@/components/dashboard/reviews-chart'
import { PendingReviews } from '@/components/dashboard/pending-reviews'
import { QuickActions } from '@/components/dashboard/quick-actions'
import { StarDistribution } from '@/components/dashboard/star-distribution'
import {
  Star,
  MessageSquare,
  TrendingUp,
  Clock,
  AlertCircle,
  CheckCircle,
} from 'lucide-react'

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


