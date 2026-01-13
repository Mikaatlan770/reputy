'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
import { analyticsData } from '@/lib/mock-data'

export function ReviewsChart() {
  const data = analyticsData.map((d) => ({
    ...d,
    period: new Date(d.period).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
    }),
  }))

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





