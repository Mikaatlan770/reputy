'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  CreditCard,
  Receipt,
  Package,
  CheckCircle,
  AlertTriangle,
  Download,
  ExternalLink,
  MessageSquare,
  Mail,
  Sparkles,
  TrendingUp,
  Calendar,
  Zap,
  Crown,
  Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  PLANS,
  SMS_PACKS,
  EMAIL_PACKS,
  AI_PACKS,
  formatPrice,
  formatPriceHT,
  mockSubscription,
  mockQuotas,
  mockPayments,
  mockInvoices,
  type PlanId,
  type Pack,
} from '@/lib/billing'
import { downloadInvoicePdf } from '@/lib/invoices'

export default function BillingPage() {
  const [changePlanOpen, setChangePlanOpen] = useState(false)
  const [buyPackOpen, setBuyPackOpen] = useState(false)
  const [selectedPack, setSelectedPack] = useState<Pack | null>(null)

  const currentPlan = PLANS[mockSubscription.planId]
  const isActive = mockSubscription.status === 'active'

  // Calcul des pourcentages de quota
  const quotaPercent = (used: number, limit: number) => {
    if (limit === -1) return 0 // illimité
    return Math.round((used / limit) * 100)
  }

  const handleDownloadInvoice = (invoiceId: string) => {
    const invoice = mockInvoices.find(i => i.id === invoiceId)
    if (invoice) {
      downloadInvoicePdf(invoice)
    }
  }

  const handleBuyPack = (pack: Pack) => {
    setSelectedPack(pack)
    setBuyPackOpen(true)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Facturation</h1>
        <p className="text-muted-foreground mt-1">
          Gérez votre abonnement, vos crédits et vos factures
        </p>
      </div>

      {/* Alerte si problème paiement */}
      {mockSubscription.status === 'past_due' && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-red-800">Problème de paiement</p>
            <p className="text-sm text-red-700 mt-1">
              Votre dernier paiement a échoué. Mettez à jour votre moyen de paiement pour éviter
              l&apos;interruption de service.
            </p>
            <Button size="sm" variant="destructive" className="mt-2">
              Mettre à jour le paiement
            </Button>
          </div>
        </div>
      )}

      {/* Plan actuel + Quotas */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Plan actuel */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Crown className="h-5 w-5 text-primary" />
                  Plan actuel
                </CardTitle>
                <CardDescription>
                  Votre abonnement Reputy
                </CardDescription>
              </div>
              <Badge variant={isActive ? 'success' : 'destructive'} className="gap-1">
                {isActive ? <CheckCircle className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                {isActive ? 'Actif' : 'Problème'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-bold">{currentPlan.name}</span>
                  {currentPlan.popular && (
                    <Badge className="bg-primary">Populaire</Badge>
                  )}
                </div>
                <p className="text-muted-foreground mt-1">{currentPlan.description}</p>
                <p className="text-2xl font-bold mt-3">
                  {formatPriceHT(currentPlan.priceMonthly)}
                  <span className="text-sm font-normal text-muted-foreground">/mois</span>
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Prochain renouvellement</p>
                <p className="font-medium">
                  {new Date(mockSubscription.currentPeriodEnd).toLocaleDateString('fr-FR')}
                </p>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <Button onClick={() => setChangePlanOpen(true)}>
                Changer de plan
              </Button>
              <Button variant="outline">
                <ExternalLink className="h-4 w-4 mr-2" />
                Portail Stripe
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Résumé quotas */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-5 w-5" />
              Quotas du mois
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* SMS */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="flex items-center gap-1">
                  <MessageSquare className="h-4 w-4 text-green-600" />
                  SMS
                </span>
                <span className="font-medium">
                  {mockQuotas.sms.used} / {mockQuotas.sms.limit}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-green-500 rounded-full"
                  style={{ width: `${quotaPercent(mockQuotas.sms.used, mockQuotas.sms.limit)}%` }}
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="flex items-center gap-1">
                  <Mail className="h-4 w-4 text-orange-600" />
                  Emails
                </span>
                <span className="font-medium">
                  {mockQuotas.email.used} / {mockQuotas.email.limit}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-500 rounded-full"
                  style={{ width: `${quotaPercent(mockQuotas.email.used, mockQuotas.email.limit)}%` }}
                />
              </div>
            </div>

            {/* IA */}
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="flex items-center gap-1">
                  <Sparkles className="h-4 w-4 text-violet-600" />
                  Crédits IA
                </span>
                <span className="font-medium">
                  {mockQuotas.ai.used} / {mockQuotas.ai.limit}
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-violet-500 rounded-full"
                  style={{ width: `${quotaPercent(mockQuotas.ai.used, mockQuotas.ai.limit)}%` }}
                />
              </div>
            </div>

            <p className="text-xs text-muted-foreground pt-2">
              Réinitialisation le {new Date(mockQuotas.sms.resetDate).toLocaleDateString('fr-FR')}
            </p>

            <Button variant="outline" className="w-full" onClick={() => setBuyPackOpen(true)}>
              <Package className="h-4 w-4 mr-2" />
              Acheter des crédits
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Historique / Factures */}
      <Tabs defaultValue="invoices" className="space-y-4">
        <TabsList>
          <TabsTrigger value="invoices" className="gap-1">
            <Receipt className="h-4 w-4" />
            Factures
          </TabsTrigger>
          <TabsTrigger value="payments" className="gap-1">
            <CreditCard className="h-4 w-4" />
            Historique paiements
          </TabsTrigger>
        </TabsList>

        {/* Factures */}
        <TabsContent value="invoices">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Factures</CardTitle>
              <CardDescription>
                Téléchargez vos factures au format PDF
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {mockInvoices.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Receipt className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Aucune facture disponible</p>
                  </div>
                ) : (
                  mockInvoices.map((invoice) => (
                    <div
                      key={invoice.id}
                      className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
                    >
                      <div className="flex items-center gap-4">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <Receipt className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">{invoice.number}</p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(invoice.date).toLocaleDateString('fr-FR')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="font-semibold">{formatPrice(invoice.total)}</p>
                          <Badge variant={invoice.status === 'paid' ? 'success' : 'secondary'}>
                            {invoice.status === 'paid' ? 'Payée' : 'En attente'}
                          </Badge>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadInvoice(invoice.id)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Historique paiements */}
        <TabsContent value="payments">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Historique des paiements</CardTitle>
              <CardDescription>
                Tous vos paiements effectués
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {mockPayments.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CreditCard className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>Aucun paiement</p>
                  </div>
                ) : (
                  mockPayments.map((payment) => (
                    <div
                      key={payment.id}
                      className="flex items-center justify-between p-4 bg-muted/50 rounded-lg"
                    >
                      <div className="flex items-center gap-4">
                        <div className={cn(
                          'p-2 rounded-lg',
                          payment.type === 'subscription' ? 'bg-blue-100' : 'bg-green-100'
                        )}>
                          {payment.type === 'subscription' ? (
                            <Calendar className="h-5 w-5 text-blue-600" />
                          ) : (
                            <Package className="h-5 w-5 text-green-600" />
                          )}
                        </div>
                        <div>
                          <p className="font-medium">{payment.description}</p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(payment.createdAt).toLocaleDateString('fr-FR', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="font-semibold">{formatPrice(payment.amount)}</p>
                          <Badge
                            variant={
                              payment.status === 'succeeded' ? 'success' :
                              payment.status === 'failed' ? 'destructive' : 'secondary'
                            }
                          >
                            {payment.status === 'succeeded' ? 'Payé' :
                             payment.status === 'failed' ? 'Échoué' :
                             payment.status === 'refunded' ? 'Remboursé' : 'En attente'}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Dialog Changer de plan */}
      <Dialog open={changePlanOpen} onOpenChange={setChangePlanOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Changer de plan</DialogTitle>
            <DialogDescription>
              Choisissez le plan adapté à vos besoins
            </DialogDescription>
          </DialogHeader>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4 py-4">
            {(Object.values(PLANS) as typeof PLANS[PlanId][]).map((plan) => (
              <div
                key={plan.id}
                className={cn(
                  'relative p-4 rounded-xl border-2 transition-all',
                  plan.id === mockSubscription.planId
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-primary/50',
                  plan.popular && 'ring-2 ring-primary ring-offset-2'
                )}
              >
                {plan.popular && (
                  <Badge className="absolute -top-2 left-1/2 -translate-x-1/2 bg-primary">
                    Populaire
                  </Badge>
                )}
                <h3 className="font-semibold text-lg">{plan.name}</h3>
                <p className="text-sm text-muted-foreground">{plan.description}</p>
                <p className="text-2xl font-bold mt-3">
                  {plan.priceMonthly === 0 ? 'Gratuit' : formatPriceHT(plan.priceMonthly)}
                  {plan.priceMonthly > 0 && (
                    <span className="text-sm font-normal text-muted-foreground">/mois</span>
                  )}
                </p>
                <ul className="mt-4 space-y-2">
                  {plan.features.slice(0, 5).map((feature, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  className="w-full mt-4"
                  variant={plan.id === mockSubscription.planId ? 'outline' : 'default'}
                  disabled={plan.id === mockSubscription.planId}
                >
                  {plan.id === mockSubscription.planId ? 'Plan actuel' : 'Sélectionner'}
                </Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Acheter des crédits */}
      <Dialog open={buyPackOpen} onOpenChange={setBuyPackOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Acheter des crédits</DialogTitle>
            <DialogDescription>
              Les crédits s&apos;ajoutent à votre quota mensuel
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="sms" className="py-4">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="sms" className="gap-1">
                <MessageSquare className="h-4 w-4" /> SMS
              </TabsTrigger>
              <TabsTrigger value="email" className="gap-1">
                <Mail className="h-4 w-4" /> Email
              </TabsTrigger>
              <TabsTrigger value="ai" className="gap-1">
                <Sparkles className="h-4 w-4" /> IA
              </TabsTrigger>
            </TabsList>

            <TabsContent value="sms" className="mt-4">
              <div className="grid gap-3">
                {SMS_PACKS.map((pack) => (
                  <div
                    key={pack.id}
                    className={cn(
                      'flex items-center justify-between p-4 rounded-lg border-2 cursor-pointer transition-all',
                      selectedPack?.id === pack.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    )}
                    onClick={() => setSelectedPack(pack)}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{pack.name}</p>
                        {pack.popular && <Badge>Meilleur rapport</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">{pack.description}</p>
                    </div>
                    <p className="text-xl font-bold">{formatPrice(pack.price)}</p>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="email" className="mt-4">
              <div className="grid gap-3">
                {EMAIL_PACKS.map((pack) => (
                  <div
                    key={pack.id}
                    className={cn(
                      'flex items-center justify-between p-4 rounded-lg border-2 cursor-pointer transition-all',
                      selectedPack?.id === pack.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    )}
                    onClick={() => setSelectedPack(pack)}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{pack.name}</p>
                        {pack.popular && <Badge>Meilleur rapport</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">{pack.description}</p>
                    </div>
                    <p className="text-xl font-bold">{formatPrice(pack.price)}</p>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="ai" className="mt-4">
              <div className="grid gap-3">
                {AI_PACKS.map((pack) => (
                  <div
                    key={pack.id}
                    className={cn(
                      'flex items-center justify-between p-4 rounded-lg border-2 cursor-pointer transition-all',
                      selectedPack?.id === pack.id
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    )}
                    onClick={() => setSelectedPack(pack)}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">{pack.name}</p>
                        {pack.popular && <Badge>Meilleur rapport</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground">{pack.description}</p>
                    </div>
                    <p className="text-xl font-bold">{formatPrice(pack.price)}</p>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBuyPackOpen(false)}>
              Annuler
            </Button>
            <Button disabled={!selectedPack}>
              <CreditCard className="h-4 w-4 mr-2" />
              Acheter {selectedPack?.name}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}





