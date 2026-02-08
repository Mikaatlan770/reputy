'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Line,
  ComposedChart,
  Bar,
} from 'recharts'
import { useReviewAnalytics, StatsPeriod } from '@/lib/reviews'

interface ReviewsChartProps {
  period?: StatsPeriod
}

// Get groupBy based on period for better visualization
function getGroupBy(period: StatsPeriod): 'day' | 'week' | 'month' {
  switch (period) {
    case '7d':
    case '30d':
      return 'day'
    case '90d':
      return 'week'
    case '365d':
      return 'month'
    default:
      return 'day'
  }
}

export function ReviewsChart({ period = '30d' }: ReviewsChartProps) {
  const groupBy = getGroupBy(period)
  const { series, loading, error } = useReviewAnalytics(period, groupBy)
  
  const data = series.map((d) => ({
    ...d,
    period: new Date(d.period).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
    }),
  }))

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">
            Évolution des avis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    )
  }

  if (error || data.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">
            Évolution des avis
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            {error ? 'Erreur de chargement' : 'Aucune donnée disponible'}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">
          Évolution des avis
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis
                dataKey="period"
                tick={{ fontSize: 12, fill: '#64748B' }}
                tickLine={false}
                axisLine={{ stroke: '#E2E8F0' }}
              />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 12, fill: '#64748B' }}
                tickLine={false}
                axisLine={false}
                label={{
                  value: 'Avis',
                  angle: -90,
                  position: 'insideLeft',
                  style: { fontSize: 12, fill: '#64748B' },
                }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                domain={[0, 5]}
                tick={{ fontSize: 12, fill: '#64748B' }}
                tickLine={false}
                axisLine={false}
                label={{
                  value: 'Note',
                  angle: 90,
                  position: 'insideRight',
                  style: { fontSize: 12, fill: '#64748B' },
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #E2E8F0',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                }}
              />
              <Bar
                yAxisId="left"
                dataKey="reviews"
                fill="#3B82F6"
                radius={[4, 4, 0, 0]}
                name="Avis reçus"
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="rating"
                stroke="#10B981"
                strokeWidth={2}
                dot={{ fill: '#10B981', strokeWidth: 2 }}
                name="Note moyenne"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}





