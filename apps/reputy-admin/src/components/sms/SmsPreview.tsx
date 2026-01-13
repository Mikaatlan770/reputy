'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  MessageSquare,
  AlertCircle,
  CheckCircle,
  Info,
  AlertTriangle,
  Copy,
  Phone,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  validateSms,
  calculateSmsLength,
  SMS_MAX_LENGTH,
  SMS_DEFAULT_MESSAGE,
  SMS_COST_PER_SEGMENT,
  type SmsValidationResult,
} from '@/lib/sms'

// ===== TYPES =====

interface SmsPreviewProps {
  /** Message à afficher/valider */
  message?: string
  /** Lien court à ajouter */
  shortUrl?: string
  /** Numéro de téléphone destinataire (optionnel, pour affichage) */
  phoneNumber?: string
  /** Callback quand le message change */
  onMessageChange?: (message: string) => void
  /** Callback quand la validation change */
  onValidationChange?: (isValid: boolean) => void
  /** Mode lecture seule (pas d'édition) */
  readOnly?: boolean
  /** Afficher le message par défaut */
  showDefault?: boolean
  /** Classe CSS additionnelle */
  className?: string
}

// ===== COMPOSANT PRINCIPAL =====

export function SmsPreview({
  message: propMessage,
  shortUrl = 'rpt.ly/abc123',
  phoneNumber,
  onMessageChange,
  onValidationChange,
  readOnly = false,
  showDefault = true,
  className,
}: SmsPreviewProps) {
  // État local du message
  const [message, setMessage] = useState(
    propMessage ?? (showDefault ? SMS_DEFAULT_MESSAGE : '')
  )

  // Synchroniser avec les props
  useEffect(() => {
    if (propMessage !== undefined) {
      setMessage(propMessage)
    }
  }, [propMessage])

  // Message final avec lien
  const finalMessage = useMemo(() => {
    if (!shortUrl) return message
    return message.includes('{lien}')
      ? message.replace('{lien}', shortUrl)
      : `${message}\n${shortUrl}`
  }, [message, shortUrl])

  // Validation
  const validation = useMemo<SmsValidationResult>(
    () => validateSms(finalMessage),
    [finalMessage]
  )

  // Longueur
  const length = useMemo(
    () => calculateSmsLength(finalMessage),
    [finalMessage]
  )

  // Notifier les changements de validation
  useEffect(() => {
    onValidationChange?.(validation.isValid)
  }, [validation.isValid, onValidationChange])

  // Gérer le changement de message
  const handleMessageChange = (newMessage: string) => {
    setMessage(newMessage)
    onMessageChange?.(newMessage)
  }

  // Copier le message
  const copyMessage = () => {
    navigator.clipboard.writeText(finalMessage)
  }

  // Couleur de la barre de progression
  const getProgressColor = () => {
    const percent = (length.smsLength / SMS_MAX_LENGTH) * 100
    if (percent > 100) return 'bg-red-500'
    if (percent > 90) return 'bg-amber-500'
    return 'bg-green-500'
  }

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Aperçu SMS
          </CardTitle>
          
          {/* Badge "1 SMS garanti" */}
          <div className="flex items-center gap-2">
            {validation.isValid ? (
              <Badge className="bg-green-100 text-green-800 border-green-200 gap-1">
                <CheckCircle className="h-3.5 w-3.5" />
                1 SMS = 1 segment garanti
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1">
                <AlertCircle className="h-3.5 w-3.5" />
                {validation.errors.length} erreur(s)
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Simulation téléphone */}
        <div className="bg-slate-100 rounded-2xl p-4 max-w-[320px] mx-auto">
          {/* Header téléphone */}
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-slate-200">
            <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
              <Phone className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">
                {phoneNumber || '+33 6 XX XX XX XX'}
              </p>
              <p className="text-xs text-muted-foreground">SMS</p>
            </div>
          </div>

          {/* Bulle SMS */}
          <div className="bg-white rounded-xl rounded-tl-sm p-3 shadow-sm">
            {readOnly ? (
              <p className="text-sm whitespace-pre-wrap leading-relaxed">
                {finalMessage}
              </p>
            ) : (
              <textarea
                value={message}
                onChange={(e) => handleMessageChange(e.target.value)}
                className="w-full text-sm bg-transparent resize-none focus:outline-none leading-relaxed"
                rows={4}
                placeholder="Votre message SMS..."
              />
            )}
            
            {/* Lien (si séparé) */}
            {shortUrl && !message.includes('{lien}') && (
              <p className="text-sm text-primary mt-2 font-medium">
                {shortUrl}
              </p>
            )}
          </div>

          {/* Timestamp */}
          <p className="text-[10px] text-muted-foreground text-right mt-1">
            Maintenant
          </p>
        </div>

        {/* Compteur de caractères */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Caractères</span>
            <span className={cn(
              'font-mono font-medium',
              length.smsLength > SMS_MAX_LENGTH && 'text-red-600'
            )}>
              {length.smsLength} / {SMS_MAX_LENGTH}
            </span>
          </div>
          
          {/* Barre de progression */}
          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div
              className={cn('h-full transition-all', getProgressColor())}
              style={{ 
                width: `${Math.min((length.smsLength / SMS_MAX_LENGTH) * 100, 100)}%` 
              }}
            />
          </div>

          {/* Info segments */}
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {length.remaining > 0 
                ? `${length.remaining} caractères restants`
                : `${Math.abs(length.remaining)} caractères en trop`}
            </span>
            <span className={cn(
              'font-medium',
              length.segments > 1 && 'text-red-600'
            )}>
              {length.segments} segment{length.segments > 1 ? 's' : ''}
            </span>
          </div>
        </div>

        {/* Erreurs */}
        {validation.errors.length > 0 && (
          <div className="space-y-2">
            {validation.errors.map((error, index) => (
              <div
                key={index}
                className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm"
              >
                <AlertCircle className="h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-red-800">{error.message}</p>
                  {error.details && (
                    <p className="text-red-600 text-xs mt-1">{error.details}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Avertissements */}
        {validation.warnings.length > 0 && (
          <div className="space-y-2">
            {validation.warnings.map((warning, index) => (
              <div
                key={index}
                className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm"
              >
                <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-amber-800">{warning}</p>
              </div>
            ))}
          </div>
        )}

        {/* Info coût */}
        <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm">
          <Info className="h-4 w-4 text-blue-600 flex-shrink-0" />
          <div className="flex-1">
            <span className="text-blue-800">
              Coût estimé : <strong>{SMS_COST_PER_SEGMENT.toFixed(3)}€ HT</strong>
            </span>
          </div>
          <Badge variant="outline" className="text-blue-700 border-blue-300">
            1 crédit SMS
          </Badge>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={copyMessage}
            className="gap-1"
          >
            <Copy className="h-4 w-4" />
            Copier
          </Button>
        </div>

        {/* Tooltip info */}
        <p className="text-xs text-muted-foreground text-center">
          Les SMS sont limités à 160 caractères (encodage GSM-7) pour garantir un coût maîtrisé.
        </p>
      </CardContent>
    </Card>
  )
}

export default SmsPreview





