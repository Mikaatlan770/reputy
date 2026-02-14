'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import {
  useReviewStats,
  useReviewAnalytics,
  type StatsPeriod,
} from '@/lib/reviews'
import {
  TrendingUp,
  TrendingDown,
  Clock,
  MessageSquare,
  Lightbulb,
  Calendar,
  Loader2,
  BarChart3,
  Smile,
  Frown,
  Meh,
  Globe,
  Tag,
  AlertCircle,
} from 'lucide-react'

// ============ CONSTANTS ============

const STAR_COLORS = ['#10B981', '#22C55E', '#F59E0B', '#F97316', '#EF4444']
const SENTIMENT_COLORS: Record<string, string> = {
  positive: '#10B981',
  neutral: '#F59E0B',
  negative: '#EF4444',
}
const SENTIMENT_LABELS: Record<string, string> = {
  positive: 'Positif',
  neutral: 'Neutre',
  negative: 'Négatif',
}
const SENTIMENT_ICONS: Record<string, typeof Smile> = {
  positive: Smile,
  neutral: Meh,
  negative: Frown,
}

const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  reputyboard: 'ReputyBoard',
  reputyapp: 'ReputyApp',
  unknown: 'Autre',
}
const PROVIDER_COLORS: Record<string, string> = {
  google: '#4285F4',
  reputyboard: '#242c34',
  reputyapp: '#6366F1',
  unknown: '#94A3B8',
}

const PERIOD_OPTIONS: { value: StatsPeriod; label: string }[] = [
  { value: '7d', label: '7 jours' },
  { value: '30d', label: '30 jours' },
  { value: '90d', label: '90 jours' },
  { value: '365d', label: '1 an' },
]

// ============ HELPERS ============

function formatPeriodLabel(raw: string, period: StatsPeriod): string {
  // raw can be "2026-02-14" or "2026-02" or "2026-W07"
  if (raw.includes('W')) {
    return `Sem. ${raw.split('W')[1]}`
  }
  if (raw.length === 7) {
    // "2026-02" → "Fév. 2026"
    const d = new Date(raw + '-01')
    return d.toLocaleDateString('fr-FR', { month: 'short', year: period === '365d' ? 'numeric' : undefined })
  }
  // "2026-02-14" → "14 fév."
  const d = new Date(raw)
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function getGroupBy(period: StatsPeriod): 'day' | 'week' | 'month' {
  if (period === '7d') return 'day'
  if (period === '30d') return 'day'
  if (period === '90d') return 'week'
  return 'month'
}

// ============ PAGE ============

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<StatsPeriod>('30d')
  const groupBy = getGroupBy(period)

  const { stats, loading: statsLoading, error: statsError, refetch: refetchStats } = useReviewStats(period)
  const { series, loading: seriesLoading, error: seriesError, refetch: refetchSeries } = useReviewAnalytics(period, groupBy)

  const loading = statsLoading || seriesLoading
  const error = statsError || seriesError

  // ============ DERIVED DATA ============

  // Chart data for evolution
  const chartData = series.map((d) => ({
    ...d,
    label: formatPeriodLabel(d.period, period),
  }))

  // Star distribution from real stats
  const starDistData = stats?.starDistributionPeriod || []

  // Sentiment breakdown
  const sentimentData = stats?.sentimentBreakdownPeriod || []

  // Provider breakdown  
  const providerData = stats?.providerBreakdownPeriod || []

  // Response time distribution
  const responseTimeData = stats?.responseTimeDistributionPeriod || []

  // Tag breakdown
  const tagData = stats?.tagBreakdownPeriod || []

  // ============ INSIGHTS (dynamic) ============

  const reviewsDelta = stats?.reviewsDeltaPct
  const avgResponseTime = stats?.avgResponseTimeHours
  const responseRate = stats?.responseRatePeriod ?? 0
  const negativePercent = sentimentData.find(s => s.sentiment === 'negative')?.percentage ?? 0
  const topNegativeTag = tagData.length > 0 ? tagData[0] : null

  // ============ LOADING ============

  if (loading && !stats) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Statistiques</h1>
            <p className="text-muted-foreground mt-1">Analysez vos performances</p>
          </div>
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <Card><CardContent className="p-6"><Skeleton className="h-[300px] w-full" /></CardContent></Card>
          <Card><CardContent className="p-6"><Skeleton className="h-[300px] w-full" /></CardContent></Card>
        </div>
        <Card><CardContent className="p-6"><Skeleton className="h-[120px] w-full" /></CardContent></Card>
      </div>
    )
  }

  // ============ ERROR ============

  if (error && !stats) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Statistiques</h1>
        </div>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <AlertCircle className="h-10 w-10 text-destructive mb-3" />
            <p className="text-destructive font-medium">{error}</p>
            <Button onClick={() => { refetchStats(); refetchSeries() }} variant="outline" className="mt-4">
              Réessayer
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ============ EMPTY STATE ============

  const hasData = (stats?.totalPeriod ?? 0) > 0

  // ============ RENDER ============

  return (
    <div className="space-y-6">
      {/* Header + Period Selector */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Statistiques</h1>
          <p className="text-muted-foreground mt-1">
            Analysez vos performances et identifiez les opportunités
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

      {/* KPI Summary Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Avis (période)</p>
            <p className="text-2xl font-bold">{stats?.totalPeriod ?? 0}</p>
            {reviewsDelta != null && (
              <div className={`flex items-center gap-1 mt-1 text-xs ${reviewsDelta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {reviewsDelta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {reviewsDelta > 0 ? '+' : ''}{reviewsDelta}% vs période précédente
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Note moyenne</p>
            <p className="text-2xl font-bold">{stats?.avgRatingPeriod?.toFixed(1) ?? '—'}</p>
            {stats?.avgRatingDelta != null && (
              <div className={`flex items-center gap-1 mt-1 text-xs ${stats.avgRatingDelta >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {stats.avgRatingDelta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {stats.avgRatingDelta > 0 ? '+' : ''}{stats.avgRatingDelta}
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Taux de réponse</p>
            <p className="text-2xl font-bold">{responseRate}%</p>
            {stats?.responseRateDeltaPct != null && (
              <div className={`flex items-center gap-1 mt-1 text-xs ${stats.responseRateDeltaPct >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {stats.responseRateDeltaPct >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                {stats.responseRateDeltaPct > 0 ? '+' : ''}{stats.responseRateDeltaPct} pts
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">Délai moyen réponse</p>
            <p className="text-2xl font-bold">{avgResponseTime != null ? `${avgResponseTime}h` : '—'}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {stats?.responseTimeNoReplyCount != null && stats.responseTimeNoReplyCount > 0
                ? `${stats.responseTimeNoReplyCount} sans réponse`
                : 'Toutes répondues'
              }
            </p>
          </CardContent>
        </Card>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground ml-2">Mise à jour...</span>
        </div>
      )}

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Vue d&apos;ensemble</TabsTrigger>
          <TabsTrigger value="themes">Thèmes & Sentiment</TabsTrigger>
          <TabsTrigger value="response">Temps de réponse</TabsTrigger>
          <TabsTrigger value="channels">Par source</TabsTrigger>
        </TabsList>

        {/* ============ OVERVIEW TAB ============ */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Evolution Chart */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Évolution des avis</CardTitle>
              </CardHeader>
              <CardContent>
                {!hasData ? (
                  <EmptyChart message="Aucun avis sur cette période" />
                ) : (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                        <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip
                          formatter={(value: number, name: string) => [value, name === 'reviews' ? 'Avis' : 'Note moy.']}
                          labelFormatter={(label) => `Période : ${label}`}
                        />
                        <Area
                          type="monotone"
                          dataKey="reviews"
                          stroke="#3B82F6"
                          fill="#3B82F6"
                          fillOpacity={0.2}
                          name="reviews"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Star Distribution */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Distribution des notes</CardTitle>
              </CardHeader>
              <CardContent>
                {!hasData || starDistData.every(s => s.count === 0) ? (
                  <EmptyChart message="Aucune donnée de notes" />
                ) : (
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={starDistData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={100}
                          paddingAngle={5}
                          dataKey="count"
                          nameKey="stars"
                          label={({ stars, percentage }) => `${stars}★ (${percentage}%)`}
                        >
                          {starDistData.map((_, index) => (
                            <Cell key={index} fill={STAR_COLORS[index % STAR_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => [`${value} avis`]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Insights */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-amber-500" />
                Insights automatiques
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!hasData ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Les insights apparaîtront quand vous aurez des avis.
                </p>
              ) : (
                <div className="grid md:grid-cols-3 gap-4">
                  {/* Tendance avis */}
                  <div className={`p-4 rounded-lg border ${
                    reviewsDelta != null && reviewsDelta >= 0
                      ? 'bg-green-50 border-green-200'
                      : 'bg-red-50 border-red-200'
                  }`}>
                    {reviewsDelta != null && reviewsDelta >= 0
                      ? <TrendingUp className="h-5 w-5 text-green-600 mb-2" />
                      : <TrendingDown className="h-5 w-5 text-red-600 mb-2" />
                    }
                    <p className={`text-sm font-medium ${reviewsDelta != null && reviewsDelta >= 0 ? 'text-green-800' : 'text-red-800'}`}>
                      {reviewsDelta != null && reviewsDelta >= 0 ? 'Tendance positive' : 'Tendance à la baisse'}
                    </p>
                    <p className={`text-xs mt-1 ${reviewsDelta != null && reviewsDelta >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                      {reviewsDelta != null
                        ? `${reviewsDelta > 0 ? '+' : ''}${reviewsDelta}% d'avis vs la période précédente`
                        : 'Pas assez de données pour comparer'
                      }
                    </p>
                  </div>

                  {/* Réactivité */}
                  <div className={`p-4 rounded-lg border ${
                    avgResponseTime != null && avgResponseTime <= 6
                      ? 'bg-blue-50 border-blue-200'
                      : 'bg-amber-50 border-amber-200'
                  }`}>
                    <Clock className={`h-5 w-5 mb-2 ${
                      avgResponseTime != null && avgResponseTime <= 6 ? 'text-blue-600' : 'text-amber-600'
                    }`} />
                    <p className={`text-sm font-medium ${
                      avgResponseTime != null && avgResponseTime <= 6 ? 'text-blue-800' : 'text-amber-800'
                    }`}>
                      {avgResponseTime != null && avgResponseTime <= 6 ? 'Réactivité excellente' : 'Réactivité à améliorer'}
                    </p>
                    <p className={`text-xs mt-1 ${
                      avgResponseTime != null && avgResponseTime <= 6 ? 'text-blue-700' : 'text-amber-700'
                    }`}>
                      {avgResponseTime != null
                        ? `Temps moyen de réponse : ${avgResponseTime}h`
                        : 'Aucune réponse envoyée sur cette période'
                      }
                    </p>
                  </div>

                  {/* Point d'attention */}
                  <div className={`p-4 rounded-lg border ${
                    negativePercent > 20
                      ? 'bg-red-50 border-red-200'
                      : 'bg-amber-50 border-amber-200'
                  }`}>
                    <MessageSquare className={`h-5 w-5 mb-2 ${negativePercent > 20 ? 'text-red-600' : 'text-amber-600'}`} />
                    <p className={`text-sm font-medium ${negativePercent > 20 ? 'text-red-800' : 'text-amber-800'}`}>
                      {negativePercent > 20 ? 'Attention requise' : 'Point d\'attention'}
                    </p>
                    <p className={`text-xs mt-1 ${negativePercent > 20 ? 'text-red-700' : 'text-amber-700'}`}>
                      {negativePercent > 0
                        ? `${negativePercent}% d'avis négatifs${topNegativeTag ? ` — thème fréquent : "${topNegativeTag.tag}"` : ''}`
                        : 'Aucun avis négatif sur cette période 🎉'
                      }
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ THEMES & SENTIMENT TAB ============ */}
        <TabsContent value="themes" className="space-y-6">
          {/* Sentiment Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Smile className="h-5 w-5 text-primary" />
                Répartition du sentiment
              </CardTitle>
            </CardHeader>
            <CardContent>
              {sentimentData.length === 0 ? (
                <EmptyChart message="Aucune donnée de sentiment disponible" />
              ) : (
                <div className="space-y-6">
                  {/* Sentiment bars */}
                  <div className="space-y-3">
                    {['positive', 'neutral', 'negative'].map((key) => {
                      const item = sentimentData.find(s => s.sentiment === key)
                      const count = item?.count || 0
                      const pct = item?.percentage || 0
                      const Icon = SENTIMENT_ICONS[key] || Meh

                      return (
                        <div key={key} className="flex items-center gap-3">
                          <div className="flex items-center gap-2 w-24">
                            <Icon className="h-4 w-4" style={{ color: SENTIMENT_COLORS[key] }} />
                            <span className="text-sm font-medium">{SENTIMENT_LABELS[key]}</span>
                          </div>
                          <div className="flex-1 bg-muted rounded-full h-6 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                              style={{
                                width: `${Math.max(pct, 2)}%`,
                                backgroundColor: SENTIMENT_COLORS[key],
                              }}
                            >
                              {pct >= 10 && (
                                <span className="text-xs font-medium text-white">{pct}%</span>
                              )}
                            </div>
                          </div>
                          <div className="w-20 text-right">
                            <span className="text-sm font-medium">{count}</span>
                            <span className="text-xs text-muted-foreground ml-1">({pct}%)</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>

                  {/* Sentiment pie */}
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={sentimentData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={90}
                          paddingAngle={5}
                          dataKey="count"
                          nameKey="sentiment"
                          label={({ sentiment, percentage }) => `${SENTIMENT_LABELS[sentiment] || sentiment} (${percentage}%)`}
                        >
                          {sentimentData.map((item, index) => (
                            <Cell key={index} fill={SENTIMENT_COLORS[item.sentiment] || '#94A3B8'} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => [`${value} avis`]} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tag Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Tag className="h-5 w-5 text-primary" />
                Thèmes fréquents (top 12)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {tagData.length === 0 ? (
                <EmptyChart message="Aucun thème identifié sur cette période" />
              ) : (
                <div className="h-[400px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={tagData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis type="number" tick={{ fontSize: 12 }} />
                      <YAxis
                        dataKey="tag"
                        type="category"
                        tick={{ fontSize: 12 }}
                        width={120}
                      />
                      <Tooltip formatter={(value: number) => [`${value} avis`, 'Mentions']} />
                      <Bar dataKey="count" fill="#6366F1" radius={[0, 4, 4, 0]} name="Mentions" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ RESPONSE TIME TAB ============ */}
        <TabsContent value="response" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Distribution des temps de réponse
              </CardTitle>
            </CardHeader>
            <CardContent>
              {responseTimeData.length === 0 || responseTimeData.every(d => d.count === 0) ? (
                <EmptyChart message="Aucune réponse envoyée sur cette période" />
              ) : (
                <>
                  <div className="h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={responseTimeData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                        <XAxis dataKey="bucket" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip formatter={(value: number) => [`${value} réponses`]} />
                        <Bar dataKey="count" fill="#3B82F6" radius={[4, 4, 0, 0]} name="Réponses" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* KPI row */}
                  <div className="mt-4 grid grid-cols-3 gap-4">
                    <div className="p-4 bg-muted/50 rounded-lg text-center">
                      <p className="text-xs text-muted-foreground">Délai moyen</p>
                      <p className="text-lg font-bold">
                        {avgResponseTime != null ? `${avgResponseTime}h` : '—'}
                      </p>
                    </div>
                    <div className="p-4 bg-muted/50 rounded-lg text-center">
                      <p className="text-xs text-muted-foreground">Taux de réponse</p>
                      <p className="text-lg font-bold">{responseRate}%</p>
                    </div>
                    <div className="p-4 bg-muted/50 rounded-lg text-center">
                      <p className="text-xs text-muted-foreground">Sans réponse</p>
                      <p className="text-lg font-bold">{stats?.responseTimeNoReplyCount ?? 0}</p>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ CHANNELS/SOURCE TAB ============ */}
        <TabsContent value="channels" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Globe className="h-5 w-5 text-primary" />
                Avis par source
              </CardTitle>
            </CardHeader>
            <CardContent>
              {providerData.length === 0 ? (
                <EmptyChart message="Aucune donnée de source disponible" />
              ) : (
                <div className="space-y-6">
                  {/* Provider chart */}
                  <div className="h-[300px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={providerData.map(p => ({
                        ...p,
                        name: PROVIDER_LABELS[p.provider] || p.provider,
                        fill: PROVIDER_COLORS[p.provider] || '#94A3B8',
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis tick={{ fontSize: 12 }} />
                        <Tooltip formatter={(value: number) => [`${value} avis`]} />
                        <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Avis">
                          {providerData.map((p, index) => (
                            <Cell key={index} fill={PROVIDER_COLORS[p.provider] || '#94A3B8'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Provider cards */}
                  <div className={`grid gap-4 ${providerData.length <= 3 ? `grid-cols-${providerData.length}` : 'grid-cols-2 md:grid-cols-4'}`}>
                    {providerData.map((p) => (
                      <div key={p.provider} className="text-center p-4 bg-muted/50 rounded-lg">
                        <div
                          className="w-3 h-3 rounded-full mx-auto mb-2"
                          style={{ backgroundColor: PROVIDER_COLORS[p.provider] || '#94A3B8' }}
                        />
                        <p className="text-sm font-medium">{PROVIDER_LABELS[p.provider] || p.provider}</p>
                        <p className="text-2xl font-bold mt-1">{p.count}</p>
                        <p className="text-xs text-muted-foreground">{p.percentage}% des avis</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// ============ EMPTY CHART COMPONENT ============

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-[300px] text-center">
      <BarChart3 className="h-10 w-10 text-muted-foreground/40 mb-3" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}
