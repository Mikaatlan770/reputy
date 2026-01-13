'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Sparkles,
  Crown,
  Zap,
  AlertTriangle,
  CheckCircle,
  Copy,
  Loader2,
  Info,
  ChevronRight,
} from 'lucide-react'
import { useAppStore } from '@/lib/store'
import type { AiTone, AiSuggestion, Review } from '@/types'
import { cn } from '@/lib/utils'

// Labels français pour les tons
const toneLabels: Record<AiTone, string> = {
  professional: 'Professionnel',
  warm: 'Chaleureux',
  short: 'Court',
  empathetic: 'Empathique',
}

const toneDescriptions: Record<AiTone, string> = {
  professional: 'Formel et courtois',
  warm: 'Chaleureux et proche',
  short: 'Concis et direct',
  empathetic: 'Compréhensif et attentionné',
}

interface AiReplyAssistantProps {
  review: Review
  healthMode: boolean
  onSelectSuggestion: (text: string) => void
}

export function AiReplyAssistant({
  review,
  healthMode,
  onSelectSuggestion,
}: AiReplyAssistantProps) {
  const { orgSettings, incrementAiUsage } = useAppStore()

  // États
  const [isOpen, setIsOpen] = useState(false)
  const [isPaywallOpen, setIsPaywallOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([])
  const [selectedTone, setSelectedTone] = useState<AiTone>('professional')
  const [instructions, setInstructions] = useState('')
  const [quotaRemaining, setQuotaRemaining] = useState<number | null>(null)

  // Vérification de l'accès IA
  const hasAiAccess = orgSettings?.aiEnabled ?? false
  const aiQuota = orgSettings?.aiQuota

  // Ouvrir le panneau IA ou le paywall
  const handleOpenAi = () => {
    if (!hasAiAccess) {
      setIsPaywallOpen(true)
    } else {
      setIsOpen(true)
      setSuggestions([])
      setError(null)
    }
  }

  // Générer les suggestions
  const generateSuggestions = async () => {
    setIsLoading(true)
    setError(null)
    setSuggestions([])

    try {
      const response = await fetch('/api/ai/suggest-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reviewId: review.id,
          reviewContent: review.content,
          reviewRating: review.rating,
          tone: selectedTone,
          instructions: instructions || undefined,
          healthMode,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        if (data.code === 'AI_NOT_ENABLED') {
          setIsOpen(false)
          setIsPaywallOpen(true)
          return
        }
        if (data.code === 'QUOTA_EXCEEDED') {
          setError('Quota mensuel atteint. Passez au plan supérieur pour plus de suggestions.')
          return
        }
        throw new Error(data.error || 'Erreur lors de la génération')
      }

      setSuggestions(data.suggestions)
      setQuotaRemaining(data.quotaRemaining)
      incrementAiUsage()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue')
    } finally {
      setIsLoading(false)
    }
  }

  // Sélectionner une suggestion
  const handleSelectSuggestion = (text: string) => {
    onSelectSuggestion(text)
    setIsOpen(false)
  }

  // Copier une suggestion
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  return (
    <>
      {/* Bouton principal */}
      <Button
        variant="secondary"
        size="sm"
        className="gap-1.5 bg-gradient-to-r from-violet-500/10 to-purple-500/10 hover:from-violet-500/20 hover:to-purple-500/20 border-violet-200"
        onClick={handleOpenAi}
      >
        <Sparkles className="h-4 w-4 text-violet-600" />
        <span className="text-violet-700">Suggérer une réponse (IA)</span>
        {!hasAiAccess && <Crown className="h-3.5 w-3.5 text-amber-500 ml-1" />}
      </Button>

      {/* Dialog Paywall */}
      <Dialog open={isPaywallOpen} onOpenChange={setIsPaywallOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="mx-auto w-16 h-16 bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl flex items-center justify-center mb-4">
              <Sparkles className="h-8 w-8 text-white" />
            </div>
            <DialogTitle className="text-center text-xl">
              Assistant IA de réponse
            </DialogTitle>
            <DialogDescription className="text-center">
              Disponible dans le plan Pro
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-3">
              {[
                'Générez 3 suggestions de réponse instantanément',
                'Choisissez le ton : professionnel, chaleureux, empathique...',
                'Mode Santé intégré (respect RGPD & déontologie)',
                'Gardez toujours le contrôle avant publication',
              ].map((feature, i) => (
                <div key={i} className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                  <span className="text-sm">{feature}</span>
                </div>
              ))}
            </div>

            <div className="p-4 bg-gradient-to-r from-violet-50 to-purple-50 rounded-xl border border-violet-100">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-violet-900">Plan Pro</span>
                <Badge className="bg-violet-600">Recommandé</Badge>
              </div>
              <p className="text-2xl font-bold text-violet-900">
                59€<span className="text-sm font-normal text-violet-600">/mois HT</span>
              </p>
              <p className="text-xs text-violet-600 mt-1">
                100 suggestions IA / mois incluses
              </p>
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button
              className="w-full gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
              onClick={() => {
                // Rediriger vers la page de tarification
                window.location.href = '/settings'
              }}
            >
              <Zap className="h-4 w-4" />
              Découvrir le plan Pro
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => setIsPaywallOpen(false)}
            >
              Peut-être plus tard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog Assistant IA */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-violet-600" />
              Assistant IA de réponse
              {healthMode && (
                <Badge variant="warning" className="text-xs ml-2">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Mode Santé
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              Générez des suggestions de réponse adaptées à cet avis
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {/* Disclaimer Mode Santé */}
            {healthMode && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800 flex items-start gap-2">
                <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Mode Santé actif :</strong> Les suggestions générées respectent les
                  règles déontologiques et n'évoquent jamais d'informations médicales,
                  de diagnostic ou de soins. Proposez un contact privé si nécessaire.
                </span>
              </div>
            )}

            {/* Sélection du ton */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                Ton de la réponse
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(Object.keys(toneLabels) as AiTone[]).map((tone) => (
                  <button
                    key={tone}
                    onClick={() => setSelectedTone(tone)}
                    className={cn(
                      'p-3 rounded-lg border text-left transition-all',
                      selectedTone === tone
                        ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-200'
                        : 'border-input hover:border-violet-300 hover:bg-violet-50/50'
                    )}
                  >
                    <p className="font-medium text-sm">{toneLabels[tone]}</p>
                    <p className="text-xs text-muted-foreground">
                      {toneDescriptions[tone]}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {/* Consignes personnalisées */}
            <div>
              <label className="text-sm font-medium mb-2 block">
                Consignes personnalisées{' '}
                <span className="text-muted-foreground font-normal">(optionnel)</span>
              </label>
              <input
                type="text"
                placeholder="Ex: Toujours proposer un appel téléphonique"
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-input text-sm focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-500"
              />
            </div>

            {/* Bouton générer */}
            <Button
              onClick={generateSuggestions}
              disabled={isLoading}
              className="w-full gap-2 bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Génération en cours...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Générer 3 suggestions
                </>
              )}
            </Button>

            {/* Quota restant */}
            {aiQuota && (
              <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <Zap className="h-3.5 w-3.5" />
                <span>
                  {quotaRemaining !== null
                    ? `${quotaRemaining} suggestions restantes ce mois`
                    : `${aiQuota.monthlyLimit - aiQuota.usedThisMonth} suggestions restantes ce mois`}
                </span>
              </div>
            )}

            {/* Erreur */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                {error}
              </div>
            )}

            {/* Skeleton loading */}
            {isLoading && (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="p-4 border rounded-lg space-y-2">
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-5 w-20" />
                    </div>
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </div>
                ))}
              </div>
            )}

            {/* Suggestions */}
            {!isLoading && suggestions.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-medium">
                  Suggestions générées ({suggestions.length})
                </p>
                {suggestions.map((suggestion, index) => (
                  <div
                    key={suggestion.id}
                    className="p-4 border rounded-lg hover:border-violet-300 hover:bg-violet-50/30 transition-all group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="secondary" className="text-xs">
                        Option {index + 1} • {toneLabels[suggestion.tone]}
                      </Badge>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2"
                          onClick={() => copyToClipboard(suggestion.text)}
                        >
                          <Copy className="h-3.5 w-3.5 mr-1" />
                          Copier
                        </Button>
                      </div>
                    </div>
                    <p className="text-sm leading-relaxed">{suggestion.text}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 w-full"
                      onClick={() => handleSelectSuggestion(suggestion.text)}
                    >
                      <CheckCircle className="h-4 w-4 mr-1" />
                      Utiliser cette suggestion
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Fermer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default AiReplyAssistant





