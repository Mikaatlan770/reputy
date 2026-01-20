'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAppStore } from '@/lib/store'
import { collectChannels, nfcTags } from '@/lib/mock-data'
import {
  QrCode,
  Nfc,
  MessageSquare,
  Mail,
  Stethoscope,
  Download,
  Plus,
  ExternalLink,
  Copy,
  TrendingUp,
  Eye,
  Star,
  Info,
  CheckCircle,
  Globe,
  MousePointer,
  Settings,
} from 'lucide-react'
import { formatNumber, formatPercent } from '@/lib/utils'
import { SmsPreview } from '@/components/sms/SmsPreview'
import { WebsiteWidgetManager } from '@/components/embed'

export default function CollectPage() {
  const { currentLocation } = useAppStore()
  const [qrGenerated, setQrGenerated] = useState(false)
  const [smsValid, setSmsValid] = useState(true)
  const [widgetManagerOpen, setWidgetManagerOpen] = useState(false)
  const [embedStats, setEmbedStats] = useState({ impressions: 0, clicks: 0 })

  const channels = collectChannels.filter(
    (c) => !currentLocation || c.locationId === currentLocation.id
  )
  const tags = nfcTags.filter(
    (t) => !currentLocation || t.locationId === currentLocation.id
  )

  const channelStats = {
    qr: channels.find((c) => c.type === 'qr'),
    nfc: channels.find((c) => c.type === 'nfc'),
    sms: channels.find((c) => c.type === 'sms'),
    email: channels.find((c) => c.type === 'email'),
    doctolib: channels.find((c) => c.type === 'doctolib'),
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Collecte d&apos;avis</h1>
        <p className="text-muted-foreground mt-1">
          Configurez vos canaux de collecte pour obtenir plus d&apos;avis
        </p>
      </div>

      {/* Channel Stats Overview */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { type: 'qr', icon: QrCode, label: 'QR Code', color: 'text-blue-600' },
          { type: 'nfc', icon: Nfc, label: 'NFC', color: 'text-purple-600' },
          { type: 'sms', icon: MessageSquare, label: 'SMS', color: 'text-green-600' },
          { type: 'email', icon: Mail, label: 'Email', color: 'text-orange-600' },
          { type: 'doctolib', icon: Stethoscope, label: 'Doctolib', color: 'text-cyan-600' },
        ].map((channel) => {
          const stats = channelStats[channel.type as keyof typeof channelStats]
          return (
            <Card key={channel.type}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg bg-muted ${channel.color}`}>
                    <channel.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{channel.label}</p>
                    <p className="text-lg font-bold">
                      {stats ? formatPercent(stats.conversionRate) : '0%'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {stats ? stats.reviewsGenerated : 0} avis
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Widget & Badge Section */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-purple-500/5">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-xl">
                <Globe className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h3 className="text-lg font-semibold">Widget & Badge pour votre site</h3>
                <p className="text-sm text-muted-foreground">
                  Affichez vos avis directement sur votre site web
                </p>
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="flex items-center gap-4 text-sm">
                  <span className="flex items-center gap-1">
                    <Eye className="h-4 w-4 text-muted-foreground" />
                    <strong>{embedStats.impressions}</strong> vues (7j)
                  </span>
                  <span className="flex items-center gap-1">
                    <MousePointer className="h-4 w-4 text-muted-foreground" />
                    <strong>{embedStats.clicks}</strong> clics (7j)
                  </span>
                </div>
              </div>
              <Button onClick={() => setWidgetManagerOpen(true)} className="gap-2">
                <Settings className="h-4 w-4" />
                Configurer
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="qr" className="space-y-6">
        <TabsList className="grid grid-cols-5 w-full max-w-2xl">
          <TabsTrigger value="qr" className="gap-1">
            <QrCode className="h-4 w-4" /> QR
          </TabsTrigger>
          <TabsTrigger value="nfc" className="gap-1">
            <Nfc className="h-4 w-4" /> NFC
          </TabsTrigger>
          <TabsTrigger value="sms" className="gap-1">
            <MessageSquare className="h-4 w-4" /> SMS
          </TabsTrigger>
          <TabsTrigger value="email" className="gap-1">
            <Mail className="h-4 w-4" /> Email
          </TabsTrigger>
          <TabsTrigger value="doctolib" className="gap-1">
            <Stethoscope className="h-4 w-4" /> Doctolib
          </TabsTrigger>
        </TabsList>

        {/* QR Code Tab */}
        <TabsContent value="qr">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Générer un QR Code</CardTitle>
                <CardDescription>
                  Créez un QR code pointant vers votre page de collecte
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="aspect-square max-w-[250px] mx-auto bg-muted rounded-lg flex items-center justify-center">
                  {qrGenerated ? (
                    <div className="p-4 bg-white rounded-lg">
                      {/* Mock QR Code */}
                      <div className="w-[200px] h-[200px] bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyMSAyMSI+PHBhdGggZD0iTTEgMWg3djdIMXptMiAyaDN2M0gzem0xMi04aDd2N2gtN3ptMiAyaDN2M2gtM3pNMSAxM2g3djdIMXptMiAyaDN2M0gzem0xMi0yaDJ2Mmgtdm0yIDBoMnYyaC0ybTAgNGgydjJoLTJ6IiBmaWxsPSIjMDAwIi8+PC9zdmc+')] bg-contain" />
                    </div>
                  ) : (
                    <div className="text-center">
                      <QrCode className="h-16 w-16 mx-auto text-muted-foreground/50 mb-2" />
                      <p className="text-sm text-muted-foreground">
                        Cliquez pour générer
                      </p>
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    className="flex-1"
                    onClick={() => setQrGenerated(true)}
                  >
                    {qrGenerated ? 'Régénérer' : 'Générer le QR'}
                  </Button>
                  {qrGenerated && (
                    <Button variant="outline" className="gap-1">
                      <Download className="h-4 w-4" />
                      PNG
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Performance QR Code</CardTitle>
                <CardDescription>Statistiques de votre QR code</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[
                    { label: 'Scans', value: channelStats.qr?.clicks || 0, icon: Eye },
                    { label: 'Avis générés', value: channelStats.qr?.reviewsGenerated || 0, icon: Star },
                    { label: 'Taux conversion', value: formatPercent(channelStats.qr?.conversionRate || 0), icon: TrendingUp },
                  ].map((stat) => (
                    <div key={stat.label} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <stat.icon className="h-5 w-5 text-muted-foreground" />
                        <span className="text-sm">{stat.label}</span>
                      </div>
                      <span className="font-semibold">{stat.value}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* NFC Tab */}
        <TabsContent value="nfc">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Tags NFC</CardTitle>
                <CardDescription>Gérez vos tags NFC de collecte</CardDescription>
              </div>
              <Button className="gap-1">
                <Plus className="h-4 w-4" />
                Nouveau tag
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {tags.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Nfc className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Aucun tag NFC configuré</p>
                  </div>
                ) : (
                  tags.map((tag) => (
                    <div
                      key={tag.id}
                      className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-purple-100 rounded-lg">
                          <Nfc className="h-5 w-5 text-purple-600" />
                        </div>
                        <div>
                          <p className="font-medium">{tag.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {tag.shortUrl}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className="text-sm font-medium">{tag.scans} scans</p>
                          <p className="text-xs text-muted-foreground">
                            {tag.conversions} avis
                          </p>
                        </div>
                        <Badge variant={tag.active ? 'success' : 'secondary'}>
                          {tag.active ? 'Actif' : 'Inactif'}
                        </Badge>
                        <Button variant="ghost" size="icon">
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* SMS Tab - NOUVEAU CONTENU */}
        <TabsContent value="sms">
          <div className="grid lg:grid-cols-2 gap-6">
            {/* Aperçu SMS avec validation - ÉDITABLE */}
            <SmsPreview
              shortUrl="rpt.ly/abc123"
              phoneNumber={currentLocation?.name ? `Client de ${currentLocation.name}` : undefined}
              onValidationChange={setSmsValid}
              readOnly={false}
              showDefault={true}
            />

            {/* Configuration et stats */}
            <div className="space-y-6">
              {/* Explication du lien de collecte */}
              <Card className="border-primary/20 bg-primary/5">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Info className="h-5 w-5 text-primary" />
                    Qu&apos;est-ce que le lien de collecte ?
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Le <strong>lien de collecte</strong> est une URL courte unique générée pour votre établissement. 
                    Quand un patient clique dessus, il accède à une page lui permettant de laisser un avis sur Google, 
                    Doctolib ou d&apos;autres plateformes selon votre configuration.
                  </p>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>✓ <strong>Unique à votre établissement</strong> - les avis sont automatiquement rattachés à vous</li>
                    <li>✓ <strong>Court et simple</strong> - facile à retenir et à partager</li>
                    <li>✓ <strong>Tracking intégré</strong> - suivez les clics et conversions</li>
                  </ul>
                </CardContent>
              </Card>

              {/* Lien court */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Votre lien de collecte</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <Input value="rpt.ly/abc123" readOnly className="font-mono" />
                    <Button variant="outline" size="icon">
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Ce lien court est automatiquement inclus dans vos SMS. Il est limité à 20 caractères pour optimiser l&apos;espace.
                  </p>
                </CardContent>
              </Card>

              {/* Performance */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Performance SMS</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[
                      { label: 'SMS envoyés', value: channelStats.sms?.sent || 0 },
                      { label: 'Clics', value: channelStats.sms?.clicks || 0 },
                      { label: 'Avis générés', value: channelStats.sms?.reviewsGenerated || 0 },
                      { label: 'Taux conversion', value: formatPercent(channelStats.sms?.conversionRate || 0) },
                    ].map((stat) => (
                      <div key={stat.label} className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">{stat.label}</span>
                        <span className="font-semibold">{stat.value}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Info encodage et personnalisation */}
              <Card className="border-amber-200 bg-amber-50/50">
                <CardContent className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="p-2 bg-amber-100 rounded-lg">
                      <Info className="h-5 w-5 text-amber-600" />
                    </div>
                    <div className="space-y-2">
                      <h4 className="font-semibold text-amber-900">
                        Personnalisation du message
                      </h4>
                      <p className="text-sm text-amber-800">
                        Vous pouvez modifier le message SMS directement dans l&apos;aperçu à gauche. 
                        Respectez la limite de <strong>160 caractères</strong> pour garantir l&apos;envoi en un seul SMS.
                      </p>
                      <p className="text-xs text-amber-700">
                        <strong>Caractères autorisés :</strong> lettres standard (a-z), chiffres, 
                        espaces et ponctuation simple. Évitez les accents spéciaux (à, â, ê...) et les emojis.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Email Tab */}
        <TabsContent value="email">
          <Card>
            <CardHeader>
              <CardTitle>Collecte par Email</CardTitle>
              <CardDescription>
                Intégrez un lien de collecte dans vos emails
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-sm font-medium mb-2">Template Email</p>
                <p className="text-sm text-muted-foreground">
                  Cher(e) {'{prenom}'}, nous espérons que votre expérience chez{' '}
                  {'{etablissement}'} vous a satisfait. Prenez quelques
                  secondes pour nous laisser votre avis.
                </p>
              </div>
              <Button variant="outline" className="gap-1">
                <ExternalLink className="h-4 w-4" />
                Personnaliser le template
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Doctolib Tab */}
        <TabsContent value="doctolib">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Stethoscope className="h-5 w-5 text-cyan-600" />
                Canal Doctolib
              </CardTitle>
              <CardDescription>
                Collectez des avis après les consultations via Doctolib
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-cyan-50 border border-cyan-200 rounded-lg">
                <p className="text-sm text-cyan-800">
                  <strong>Note :</strong> Ce canal utilise un QR code / lien
                  dédié à afficher en salle d&apos;attente ou à communiquer
                  post-consultation. Pas d&apos;intégration API nécessaire.
                </p>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm font-medium mb-2">QR Code Post-Consultation</p>
                  <div className="w-32 h-32 bg-white rounded-lg mx-auto flex items-center justify-center">
                    <QrCode className="h-20 w-20 text-cyan-600" />
                  </div>
                  <Button variant="outline" className="w-full mt-3 gap-1">
                    <Download className="h-4 w-4" />
                    Télécharger
                  </Button>
                </div>

                <div className="p-4 bg-muted/50 rounded-lg">
                  <p className="text-sm font-medium mb-2">Instructions pour le cabinet</p>
                  <ul className="text-sm text-muted-foreground space-y-2">
                    <li>• Affichez le QR en salle d&apos;attente</li>
                    <li>• Proposez-le après chaque consultation</li>
                    <li>• Intégrez le lien dans vos SMS de rappel</li>
                  </ul>
                  <div className="mt-3">
                    <p className="text-xs text-muted-foreground mb-1">Lien direct</p>
                    <div className="flex gap-2">
                      <Input value="https://rpty.io/d/doc123" readOnly className="text-xs" />
                      <Button variant="outline" size="icon">
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
                <div>
                  <p className="font-medium">Performance Canal Doctolib</p>
                  <p className="text-sm text-muted-foreground">
                    {channelStats.doctolib?.reviewsGenerated || 0} avis générés •{' '}
                    {formatPercent(channelStats.doctolib?.conversionRate || 0)} conversion
                  </p>
                </div>
                <Badge variant="success">Actif</Badge>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Widget Manager Modal */}
      {currentLocation && (
        <WebsiteWidgetManager
          locationId={currentLocation.id}
          locationName={currentLocation.name}
          open={widgetManagerOpen}
          onOpenChange={setWidgetManagerOpen}
        />
      )}
    </div>
  )
}
