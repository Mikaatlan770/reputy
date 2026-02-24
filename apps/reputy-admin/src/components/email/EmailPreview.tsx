'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Mail,
  CheckCircle,
  Copy,
  Star,
  ExternalLink,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ===== TYPES =====

interface EmailPreviewProps {
  /** Nom du cabinet */
  cabinetName?: string
  /** Lien court */
  shortUrl?: string
  /** Classe CSS additionnelle */
  className?: string
}

// ===== DEFAULT TEMPLATE =====

const DEFAULT_EMAIL_TEMPLATE = `Cher(e) patient(e),

Nous espérons que votre expérience chez {cabinet} vous a satisfait.

Prenez quelques secondes pour nous laisser votre avis :

{bouton}

Merci pour votre confiance !

L'équipe {cabinet}`

// ===== COMPOSANT PRINCIPAL =====

export function EmailPreview({
  cabinetName = 'notre cabinet',
  shortUrl,
  className,
}: EmailPreviewProps) {
  const [emailContent, setEmailContent] = useState(DEFAULT_EMAIL_TEMPLATE)
  const [copied, setCopied] = useState(false)

  // Copier le contenu
  const copyContent = async () => {
    const textToCopy = emailContent
      .replace(/{cabinet}/g, cabinetName)
      .replace(/{bouton}/g, shortUrl || '[Lien de collecte]')
    
    try {
      await navigator.clipboard.writeText(textToCopy)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback
      const textarea = document.createElement('textarea')
      textarea.value = textToCopy
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Template Email
          </CardTitle>
          <Badge className="bg-green-100 text-green-800 border-green-200 gap-1">
            <CheckCircle className="h-3.5 w-3.5" />
            Personnalisable
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Zone d'édition */}
        <div className="border rounded-lg overflow-hidden">
          {/* Header email */}
          <div className="bg-slate-100 px-4 py-2 border-b flex items-center gap-2">
            <Mail className="h-4 w-4 text-slate-500" />
            <span className="text-sm text-slate-600">Aperçu email</span>
          </div>
          
          {/* Corps éditable */}
          <div className="p-4 bg-white">
            <textarea
              value={emailContent}
              onChange={(e) => setEmailContent(e.target.value)}
              className="w-full min-h-[250px] text-sm bg-transparent resize-none focus:outline-none leading-relaxed font-mono"
              placeholder="Contenu de l'email..."
            />
          </div>
        </div>

        {/* Aperçu du bouton */}
        <div className="p-4 bg-muted/50 rounded-lg">
          <p className="text-xs text-muted-foreground mb-3">Aperçu du bouton (remplace {'{bouton}'}) :</p>
          <div className="flex justify-center">
            {shortUrl ? (
              <a 
                href={shortUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-lg shadow-md hover:opacity-90 transition-opacity"
              >
                <span className="bg-slate-800 text-white px-1.5 py-0.5 rounded text-xs font-bold">R</span>
                <Star className="h-4 w-4 text-amber-300 fill-amber-300" />
                <span>Votre avis compte</span>
              </a>
            ) : (
              <div className="inline-flex items-center gap-2 px-6 py-3 bg-slate-300 text-slate-500 font-semibold rounded-lg cursor-not-allowed">
                <span className="bg-slate-500 text-slate-300 px-1.5 py-0.5 rounded text-xs font-bold">R</span>
                <Star className="h-4 w-4" />
                <span>Votre avis compte</span>
              </div>
            )}
          </div>
          {!shortUrl && (
            <p className="text-xs text-amber-600 text-center mt-2">
              ⚠️ Créez un QR code pour activer le bouton
            </p>
          )}
        </div>

        {/* Placeholders disponibles */}
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-xs font-medium text-blue-800 mb-2">Variables disponibles :</p>
          <div className="flex flex-wrap gap-2">
            <code className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">{'{cabinet}'}</code>
            <span className="text-xs text-blue-600">→ Nom du cabinet</span>
          </div>
          <div className="flex flex-wrap gap-2 mt-1">
            <code className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">{'{bouton}'}</code>
            <span className="text-xs text-blue-600">→ Bouton &quot;Votre avis compte&quot;</span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={copyContent}
            className="gap-1"
          >
            {copied ? (
              <>
                <CheckCircle className="h-4 w-4 text-green-600" />
                Copié !
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copier le texte
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEmailContent(DEFAULT_EMAIL_TEMPLATE)}
            className="gap-1"
          >
            Réinitialiser
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default EmailPreview
