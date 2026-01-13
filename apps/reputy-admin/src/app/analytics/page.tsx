'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
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
import { analyticsData, starDistribution, collectChannels } from '@/lib/mock-data'
import { useAppStore } from '@/lib/store'
import {
  TrendingUp,
  Clock,
  MessageSquare,
  Star,
  Lightbulb,
} from 'lucide-react'

const COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#6366F1']

export default function AnalyticsPage() {
  const { currentLocation } = useAppStore()

  const chartData = analyticsData.map((d) => ({
    ...d,
    period: new Date(d.period).toLocaleDateString('fr-FR', {
      day: 'numeric',
      month: 'short',
    }),
  }))

  const channelData = collectChannels
    .filter((c) => !currentLocation || c.locationId === currentLocation.id)
    .map((c) => ({
      name: c.type.toUpperCase(),
      value: c.reviewsGenerated,
      conversion: c.conversionRate,
    }))

  const themeData = [
    { theme: 'Accueil', positive: 45, negative: 5 },
    { theme: 'Attente', positive: 20, negative: 15 },
    { theme: 'Propreté', positive: 38, negative: 2 },
    { theme: 'Compétence', positive: 52, negative: 3 },
    { theme: 'Communication', positive: 35, negative: 8 },
  ]

  const responseTimeData = [
    { range: '< 1h', count: 25 },
    { range: '1-4h', count: 45 },
    { range: '4-12h', count: 20 },
    { range: '12-24h', count: 8 },
    { range: '> 24h', count: 2 },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
        <p className="text-muted-foreground mt-1">
          Analysez vos performances et identifiez les opportunités
        </p>
      </div>

      <Tabs defaultValue="overview" className="space-y-6">
        <TabsList>
          <TabsTrigger value="overview">Vue d'ensemble</TabsTrigger>
          <TabsTrigger value="themes">Thèmes & Sentiment</TabsTrigger>
          <TabsTrigger value="response">Temps de réponse</TabsTrigger>
          <TabsTrigger value="channels">Par canal</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Charts */}
          <div className="grid lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Évolution des avis</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                      <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Area
                        type="monotone"
                        dataKey="reviews"
                        stroke="#3B82F6"
                        fill="#3B82F6"
                        fillOpacity={0.2}
                        name="Avis"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Distribution des notes</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={starDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={100}
                        paddingAngle={5}
                        dataKey="count"
                        nameKey="stars"
                        label={({ stars, percentage }) => `${stars}★ (${percentage}%)`}
                      >
                        {starDistribution.map((_, index) => (
                          <Cell key={index} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
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
              <div className="grid md:grid-cols-3 gap-4">
                <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                  <TrendingUp className="h-5 w-5 text-green-600 mb-2" />
                  <p className="text-sm font-medium text-green-800">
                    Tendance positive
                  </p>
                  <p className="text-xs text-green-700 mt-1">
                    +15% d'avis positifs ce mois vs le mois dernier
                  </p>
                </div>
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <Clock className="h-5 w-5 text-blue-600 mb-2" />
                  <p className="text-sm font-medium text-blue-800">
                    Réactivité excellente
                  </p>
                  <p className="text-xs text-blue-700 mt-1">
                    Temps moyen de réponse: 4.2h (objectif: 6h)
                  </p>
                </div>
                <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
                  <MessageSquare className="h-5 w-5 text-amber-600 mb-2" />
                  <p className="text-sm font-medium text-amber-800">
                    Point d'attention
                  </p>
                  <p className="text-xs text-amber-700 mt-1">
                    "Attente" mentionné dans 15% des avis négatifs
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Themes Tab */}
        <TabsContent value="themes">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Analyse par thème</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={themeData} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis type="number" tick={{ fontSize: 12 }} />
                    <YAxis dataKey="theme" type="category" tick={{ fontSize: 12 }} width={100} />
                    <Tooltip />
                    <Bar dataKey="positive" fill="#10B981" name="Positif" stackId="a" />
                    <Bar dataKey="negative" fill="#EF4444" name="Négatif" stackId="a" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Response Time Tab */}
        <TabsContent value="response">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Temps de réponse</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={responseTimeData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="range" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="count" fill="#3B82F6" radius={[4, 4, 0, 0]} name="Réponses" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-4 p-4 bg-muted/50 rounded-lg">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Délai moyen de réponse</span>
                  <Badge variant="success">4.2 heures</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Channels Tab */}
        <TabsContent value="channels">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Performance par canal</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={channelData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#3B82F6" radius={[4, 4, 0, 0]} name="Avis générés" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-5 gap-4 mt-4">
                {channelData.map((channel) => (
                  <div key={channel.name} className="text-center p-3 bg-muted/50 rounded-lg">
                    <p className="text-xs text-muted-foreground">{channel.name}</p>
                    <p className="text-lg font-bold">{channel.conversion.toFixed(1)}%</p>
                    <p className="text-xs text-muted-foreground">conversion</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}





