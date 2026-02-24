'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  type ReviewStatsAdvanced,
  type AnalyticsSeries,
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

// ============ TYPES ============

type SentimentItem = NonNullable<ReviewStatsAdvanced['sentimentBreakdownPeriod']>[number]
type TagItem = NonNullable<ReviewStatsAdvanced['tagBreakdownPeriod']>[number]
type ChartDataPoint = AnalyticsSeries & { label: string }
type ColorTheme = keyof typeof COLOR_THEMES
type LucideIcon = typeof TrendingUp

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

const COLOR_THEMES = {
  green: { bg: 'bg-green-50', border: 'border-green-200', title: 'text-green-800', body: 'text-green-700', icon: 'text-green-600' },
  red: { bg: 'bg-red-50', border: 'border-red-200', title: 'text-red-800', body: 'text-red-700', icon: 'text-red-600' },
  blue: { bg: 'bg-blue-50', border: 'border-blue-200', title: 'text-blue-800', body: 'text-blue-700', icon: 'text-blue-600' },
  amber: { bg: 'bg-amber-50', border: 'border-amber-200', title: 'text-amber-800', body: 'text-amber-700', icon: 'text-amber-600' },
} as const

const SENTIMENT_KEYS = ['positive', 'neutral', 'negative'] as const

// ============ HELPERS ============

function formatPeriodLabel(raw: string, period: StatsPeriod): string {
  if (raw.includes('W')) {
    return `Sem. ${raw.split('W')[1]}`
  }
  if (raw.length === 7) {
    const d = new Date(raw + '-01')
    return d.toLocaleDateString('fr-FR', { month: 'short', year: period === '365d' ? 'numeric' : undefined })
  }
  const d = new Date(raw)
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

function getGroupBy(period: StatsPeriod): 'day' | 'week' | 'month' {
  if (period === '7d') return 'day'
  if (period === '30d') return 'day'
  if (period === '90d') return 'week'
  return 'month'
}

// ============ INSIGHT BUILDERS ============

function buildTrendInsight(reviewsDelta: number | null | undefined) {
  const isPositive = reviewsDelta != null && reviewsDelta >= 0
  const deltaSign = reviewsDelta != null && reviewsDelta > 0 ? '+' : ''
  const deltaLabel = reviewsDelta != null
    ? `${deltaSign}${reviewsDelta}% d'avis vs la période précédente`
    : 'Pas assez de données pour comparer'
  return {
    icon: isPositive ? TrendingUp : TrendingDown,
    theme: (isPositive ? 'green' : 'red') as ColorTheme,
    title: isPositive ? 'Tendance positive' : 'Tendance à la baisse',
    description: deltaLabel,
  }
}

function buildReactivityInsight(avgResponseTime: number | null | undefined) {
  const isGood = avgResponseTime != null && avgResponseTime <= 6
  return {
    icon: Clock,
    theme: (isGood ? 'blue' : 'amber') as ColorTheme,
    title: isGood ? 'Réactivité excellente' : 'Réactivité à améliorer',
    description: avgResponseTime != null
      ? `Temps moyen de réponse : ${avgResponseTime}h`
      : 'Aucune réponse envoyée sur cette période',
  }
}

function buildAttentionInsight(negativePercent: number, topNegativeTag: TagItem | null) {
  const isCritical = negativePercent > 20
  const tagSuffix = topNegativeTag ? ` — thème fréquent : "${topNegativeTag.tag}"` : ''
  return {
    icon: MessageSquare,
    theme: (isCritical ? 'red' : 'amber') as ColorTheme,
    title: isCritical ? 'Attention requise' : "Point d'attention",
    description: negativePercent > 0
      ? `${negativePercent}% d'avis négatifs${tagSuffix}`
      : 'Aucun avis négatif sur cette période 🎉',
  }
}

// ============ SMALL REUSABLE COMPONENTS ============

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-[300px] text-center">
      <BarChart3 className="h-10 w-10 text-muted-foreground/40 mb-3" />
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  )
}

function DeltaBadge({ delta, suffix }: { delta: number | null | undefined; suffix?: string }) {
  if (delta == null) return null
  const isPositive = delta >= 0
  const Icon = isPositive ? TrendingUp : TrendingDown
  return (
    <div className={`flex items-center gap-1 mt-1 text-xs ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
      <Icon className="h-3 w-3" />
      {delta > 0 ? '+' : ''}{delta}{suffix ?? ''}
    </div>
  )
}

function InsightCard({ icon: Icon, theme, title, description }: {
  icon: LucideIcon
  theme: ColorTheme
  title: string
  description: string
}) {
  const c = COLOR_THEMES[theme]
  return (
    <div className={`p-4 rounded-lg border ${c.bg} ${c.border}`}>
      <Icon className={`h-5 w-5 mb-2 ${c.icon}`} />
      <p className={`text-sm font-medium ${c.title}`}>{title}</p>
      <p className={`text-xs mt-1 ${c.body}`}>{description}</p>
    </div>
  )
}

function LoadingSkeleton() {
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

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Statistiques</h1>
      </div>
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16 text-center">
          <AlertCircle className="h-10 w-10 text-destructive mb-3" />
          <p className="text-destructive font-medium">{error}</p>
          <Button onClick={onRetry} variant="outline" className="mt-4">
            Réessayer
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

function PeriodSelector({ period, onPeriodChange }: { period: StatsPeriod; onPeriodChange: (p: StatsPeriod) => void }) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto whitespace-nowrap">
      <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
      <div className="flex gap-1 rounded-lg border bg-muted/50 p-1">
        {PERIOD_OPTIONS.map((option) => (
          <Button
            key={option.value}
            variant={period === option.value ? 'default' : 'ghost'}
            size="sm"
            className="text-xs"
            onClick={() => onPeriodChange(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
    </div>
  )
}

// ============ KPI ROW ============

function KpiSummaryRow({ stats }: { stats: ReviewStatsAdvanced | null }) {
  const noReplyCount = stats?.responseTimeNoReplyCount
  const noReplyLabel = noReplyCount != null && noReplyCount > 0
    ? `${noReplyCount} sans réponse`
    : 'Toutes répondues'

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Avis (période)</p>
          <p className="text-2xl font-bold">{stats?.totalPeriod ?? 0}</p>
          <DeltaBadge delta={stats?.reviewsDeltaPct} suffix="% vs période précédente" />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Note moyenne</p>
          <p className="text-2xl font-bold">{stats?.avgRatingPeriod?.toFixed(1) ?? '—'}</p>
          <DeltaBadge delta={stats?.avgRatingDelta} />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Taux de réponse</p>
          <p className="text-2xl font-bold">{stats?.responseRatePeriod ?? 0}%</p>
          <DeltaBadge delta={stats?.responseRateDeltaPct} suffix=" pts" />
        </CardContent>
      </Card>
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Délai moyen réponse</p>
          <p className="text-2xl font-bold">{stats?.avgResponseTimeHours != null ? `${stats.avgResponseTimeHours}h` : '—'}</p>
          <p className="text-xs text-muted-foreground mt-1">{noReplyLabel}</p>
        </CardContent>
      </Card>
    </div>
  )
}

// ============ SENTIMENT BAR ============

function SentimentBar({ sentimentKey, data }: { sentimentKey: string; data: SentimentItem[] }) {
  const item = data.find(s => s.sentiment === sentimentKey)
  const count = item?.count || 0
  const pct = item?.percentage || 0
  const Icon = SENTIMENT_ICONS[sentimentKey] || Meh

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 w-24">
        <Icon className="h-4 w-4" style={{ color: SENTIMENT_COLORS[sentimentKey] }} />
        <span className="text-sm font-medium">{SENTIMENT_LABELS[sentimentKey]}</span>
      </div>
      <div className="flex-1 bg-muted rounded-full h-6 overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2"
          style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: SENTIMENT_COLORS[sentimentKey] }}
        >
          {pct >= 10 && <span className="text-xs font-medium text-white">{pct}%</span>}
        </div>
      </div>
      <div className="w-20 text-right">
        <span className="text-sm font-medium">{count}</span>
        <span className="text-xs text-muted-foreground ml-1">({pct}%)</span>
      </div>
    </div>
  )
}

// ============ TAB: OVERVIEW ============

function OverviewTab({ stats, chartData }: { stats: ReviewStatsAdvanced | null; chartData: ChartDataPoint[] }) {
  const hasData = (stats?.totalPeriod ?? 0) > 0
  const starDistData = stats?.starDistributionPeriod ?? []
  const sentimentData = stats?.sentimentBreakdownPeriod ?? []
  const tagData = stats?.tagBreakdownPeriod ?? []

  const negativePercent = sentimentData.find(s => s.sentiment === 'negative')?.percentage ?? 0
  const topNegativeTag = tagData.length > 0 ? tagData[0] : null

  const trendInsight = buildTrendInsight(stats?.reviewsDeltaPct)
  const reactivityInsight = buildReactivityInsight(stats?.avgResponseTimeHours)
  const attentionInsight = buildAttentionInsight(negativePercent, topNegativeTag)

  const starDistEmpty = !hasData || starDistData.every(s => s.count === 0)

  return (
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
            {starDistEmpty ? (
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
                      {starDistData.map((item, index) => (
                        <Cell key={item.stars ?? index} fill={STAR_COLORS[index % STAR_COLORS.length]} />
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <InsightCard {...trendInsight} />
              <InsightCard {...reactivityInsight} />
              <InsightCard {...attentionInsight} />
            </div>
          )}
        </CardContent>
      </Card>
    </TabsContent>
  )
}

// ============ TAB: THEMES & SENTIMENT ============

function ThemesSentimentTab({ stats }: { stats: ReviewStatsAdvanced | null }) {
  const sentimentData = stats?.sentimentBreakdownPeriod ?? []
  const tagData = stats?.tagBreakdownPeriod ?? []

  return (
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
              <div className="space-y-3">
                {SENTIMENT_KEYS.map((key) => (
                  <SentimentBar key={key} sentimentKey={key} data={sentimentData} />
                ))}
              </div>

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
                      {sentimentData.map((item) => (
                        <Cell key={item.sentiment} fill={SENTIMENT_COLORS[item.sentiment] || '#94A3B8'} />
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
  )
}

// ============ TAB: RESPONSE TIME ============

function ResponseTimeTab({ stats }: { stats: ReviewStatsAdvanced | null }) {
  const responseTimeData = stats?.responseTimeDistributionPeriod ?? []
  const avgResponseTime = stats?.avgResponseTimeHours
  const responseRate = stats?.responseRatePeriod ?? 0
  const isEmpty = responseTimeData.length === 0 || responseTimeData.every(d => d.count === 0)

  return (
    <TabsContent value="response" className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Distribution des temps de réponse
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isEmpty ? (
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

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
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
  )
}

// ============ TAB: CHANNELS ============

function ChannelsTab({ stats }: { stats: ReviewStatsAdvanced | null }) {
  const providerData = stats?.providerBreakdownPeriod ?? []

  const chartProviderData = providerData.map(p => ({
    ...p,
    name: PROVIDER_LABELS[p.provider] || p.provider,
    fill: PROVIDER_COLORS[p.provider] || '#94A3B8',
  }))

  return (
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
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartProviderData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip formatter={(value: number) => [`${value} avis`]} />
                    <Bar dataKey="count" radius={[4, 4, 0, 0]} name="Avis">
                      {providerData.map((p) => (
                        <Cell key={p.provider} fill={PROVIDER_COLORS[p.provider] || '#94A3B8'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
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
  )
}

// ============ PAGE ============

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<StatsPeriod>('30d')
  const groupBy = getGroupBy(period)

  const { stats, loading: statsLoading, error: statsError, refetch: refetchStats } = useReviewStats(period)
  const { series, loading: seriesLoading, error: seriesError, refetch: refetchSeries } = useReviewAnalytics(period, groupBy)

  const loading = statsLoading || seriesLoading
  const error = statsError || seriesError

  if (loading && !stats) return <LoadingSkeleton />
  if (error && !stats) return <ErrorState error={error} onRetry={() => { refetchStats(); refetchSeries() }} />

  const chartData: ChartDataPoint[] = series.map((d) => ({
    ...d,
    label: formatPeriodLabel(d.period, period),
  }))

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Statistiques</h1>
          <p className="text-muted-foreground mt-1">
            Analysez vos performances et identifiez les opportunités
          </p>
        </div>
        <PeriodSelector period={period} onPeriodChange={setPeriod} />
      </div>

      <KpiSummaryRow stats={stats} />

      {loading && (
        <div className="flex items-center justify-center py-2">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground ml-2">Mise à jour...</span>
        </div>
      )}

      <Tabs defaultValue="overview" className="space-y-6">
        <div className="overflow-x-auto -mx-4 px-4">
          <TabsList className="inline-flex justify-start gap-1 w-max">
            <TabsTrigger value="overview" className="text-xs sm:text-sm px-2 sm:px-3">Vue d&apos;ensemble</TabsTrigger>
            <TabsTrigger value="themes" className="text-xs sm:text-sm px-2 sm:px-3">Thèmes &amp; Sentiment</TabsTrigger>
            <TabsTrigger value="response" className="text-xs sm:text-sm px-2 sm:px-3">Temps de réponse</TabsTrigger>
            <TabsTrigger value="channels" className="text-xs sm:text-sm px-2 sm:px-3">Par source</TabsTrigger>
          </TabsList>
        </div>

        <OverviewTab stats={stats} chartData={chartData} />
        <ThemesSentimentTab stats={stats} />
        <ResponseTimeTab stats={stats} />
        <ChannelsTab stats={stats} />
      </Tabs>
    </div>
  )
}
