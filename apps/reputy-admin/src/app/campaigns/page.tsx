'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { campaigns } from '@/lib/mock-data'
import { useAppStore } from '@/lib/store'
import { formatDate, formatPercent, getStatusColor } from '@/lib/utils'
import {
  Plus,
  MessageSquare,
  Mail,
  TrendingUp,
  Send,
  Eye,
  Star,
} from 'lucide-react'
import Link from 'next/link'

export default function CampaignsPage() {
  const { currentLocation } = useAppStore()

  const filteredCampaigns = campaigns.filter(
    (c) => !currentLocation || c.locationId === currentLocation.id
  )

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Campagnes</h1>
          <p className="text-muted-foreground mt-1">
            Créez et gérez vos campagnes de collecte d'avis
          </p>
        </div>
        <Button className="gap-1">
          <Plus className="h-4 w-4" />
          Nouvelle campagne
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Campagnes actives', value: filteredCampaigns.filter(c => c.status === 'active').length, icon: Send },
          { label: 'Messages envoyés', value: filteredCampaigns.reduce((s, c) => s + c.sent, 0), icon: MessageSquare },
          { label: 'Avis générés', value: filteredCampaigns.reduce((s, c) => s + c.reviewsGenerated, 0), icon: Star },
          { label: 'Taux conversion moy.', value: formatPercent(filteredCampaigns.reduce((s, c) => s + c.conversionRate, 0) / (filteredCampaigns.length || 1)), icon: TrendingUp },
        ].map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <stat.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                  <p className="text-xl font-bold">{stat.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Campaigns List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Toutes les campagnes</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {filteredCampaigns.length === 0 ? (
              <div className="text-center py-12">
                <Send className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                <h3 className="font-semibold">Aucune campagne</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Créez votre première campagne pour collecter plus d'avis
                </p>
                <Button className="mt-4 gap-1">
                  <Plus className="h-4 w-4" />
                  Créer une campagne
                </Button>
              </div>
            ) : (
              filteredCampaigns.map((campaign) => (
                <div
                  key={campaign.id}
                  className="flex items-center justify-between p-4 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className={`p-2 rounded-lg ${campaign.channel === 'sms' ? 'bg-green-100' : 'bg-orange-100'}`}>
                      {campaign.channel === 'sms' ? (
                        <MessageSquare className="h-5 w-5 text-green-600" />
                      ) : (
                        <Mail className="h-5 w-5 text-orange-600" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">{campaign.name}</p>
                      <p className="text-xs text-muted-foreground">
                        Créée le {formatDate(campaign.createdAt)}
                        {campaign.scheduledAt && ` • Programmée le ${formatDate(campaign.scheduledAt)}`}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="grid grid-cols-4 gap-6 text-center">
                      <div>
                        <p className="text-sm font-medium">{campaign.sent}</p>
                        <p className="text-xs text-muted-foreground">Envoyés</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium">{campaign.clicks}</p>
                        <p className="text-xs text-muted-foreground">Clics</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium">{campaign.reviewsGenerated}</p>
                        <p className="text-xs text-muted-foreground">Avis</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium">{formatPercent(campaign.conversionRate)}</p>
                        <p className="text-xs text-muted-foreground">Conv.</p>
                      </div>
                    </div>
                    <Badge className={getStatusColor(campaign.status)}>
                      {campaign.status === 'active' && 'Active'}
                      {campaign.status === 'scheduled' && 'Programmée'}
                      {campaign.status === 'completed' && 'Terminée'}
                      {campaign.status === 'draft' && 'Brouillon'}
                      {campaign.status === 'paused' && 'En pause'}
                    </Badge>
                    <Button variant="ghost" size="sm">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}





