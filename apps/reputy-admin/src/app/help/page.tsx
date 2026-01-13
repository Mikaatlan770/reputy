'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Rocket,
  Star,
  MessageSquare,
  Sparkles,
  CreditCard,
  ChevronDown,
  ChevronUp,
  Search,
  Mail,
  ExternalLink,
  BookOpen,
  HelpCircle,
  CheckCircle,
  Send,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { FAQ_SECTIONS, type FaqSection, type FaqItem } from '@/lib/help/faq-data'

// Map des icônes
const iconMap: Record<string, React.ElementType> = {
  rocket: Rocket,
  star: Star,
  'message-square': MessageSquare,
  sparkles: Sparkles,
  'credit-card': CreditCard,
}

// Composant Accordéon FAQ
function FaqAccordion({ item, isOpen, onToggle }: { 
  item: FaqItem
  isOpen: boolean
  onToggle: () => void 
}) {
  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={onToggle}
        className="w-full flex items-start justify-between py-4 text-left hover:bg-muted/50 px-4 -mx-4 rounded-lg transition-colors"
      >
        <span className="font-medium pr-4">{item.question}</span>
        {isOpen ? (
          <ChevronUp className="h-5 w-5 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronDown className="h-5 w-5 text-muted-foreground flex-shrink-0" />
        )}
      </button>
      {isOpen && (
        <div className="pb-4 text-muted-foreground text-sm leading-relaxed">
          {item.answer}
        </div>
      )}
    </div>
  )
}

// Composant Section FAQ
function FaqSectionCard({ section, searchQuery }: { 
  section: FaqSection
  searchQuery: string 
}) {
  const [openItems, setOpenItems] = useState<Set<number>>(new Set())
  const Icon = iconMap[section.icon] || HelpCircle

  // Filtrer les items si recherche
  const filteredItems = searchQuery
    ? section.items.filter(
        item =>
          item.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.answer.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : section.items

  if (filteredItems.length === 0) return null

  const toggleItem = (index: number) => {
    setOpenItems(prev => {
      const newSet = new Set(prev)
      if (newSet.has(index)) {
        newSet.delete(index)
      } else {
        newSet.add(index)
      }
      return newSet
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Icon className="h-5 w-5 text-primary" />
          {section.title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {filteredItems.map((item, index) => (
          <FaqAccordion
            key={index}
            item={item}
            isOpen={openItems.has(index)}
            onToggle={() => toggleItem(index)}
          />
        ))}
      </CardContent>
    </Card>
  )
}

export default function HelpPage() {
  const [searchQuery, setSearchQuery] = useState('')
  const [contactOpen, setContactOpen] = useState(false)
  const [contactForm, setContactForm] = useState({ subject: '', message: '' })
  const [contactSent, setContactSent] = useState(false)

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    // Mock: envoyer le message
    console.log('Contact form:', contactForm)
    setContactSent(true)
    setTimeout(() => {
      setContactOpen(false)
      setContactSent(false)
      setContactForm({ subject: '', message: '' })
    }, 2000)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Centre d&apos;aide</h1>
        <p className="text-muted-foreground mt-1">
          Trouvez des réponses à vos questions ou contactez notre support
        </p>
      </div>

      {/* Recherche */}
      <Card>
        <CardContent className="p-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Rechercher dans l'aide..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-12 text-base"
            />
          </div>
        </CardContent>
      </Card>

      {/* Quick Links */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="hover:border-primary/50 transition-colors cursor-pointer">
          <CardContent className="p-4 flex flex-col items-center text-center">
            <div className="p-3 bg-blue-100 rounded-xl mb-3">
              <BookOpen className="h-6 w-6 text-blue-600" />
            </div>
            <p className="font-medium">Guide de démarrage</p>
            <p className="text-xs text-muted-foreground mt-1">5 min de lecture</p>
          </CardContent>
        </Card>
        <Card className="hover:border-primary/50 transition-colors cursor-pointer">
          <CardContent className="p-4 flex flex-col items-center text-center">
            <div className="p-3 bg-green-100 rounded-xl mb-3">
              <Star className="h-6 w-6 text-green-600" />
            </div>
            <p className="font-medium">Connecter Google</p>
            <p className="text-xs text-muted-foreground mt-1">Tutoriel vidéo</p>
          </CardContent>
        </Card>
        <Card className="hover:border-primary/50 transition-colors cursor-pointer">
          <CardContent className="p-4 flex flex-col items-center text-center">
            <div className="p-3 bg-violet-100 rounded-xl mb-3">
              <Sparkles className="h-6 w-6 text-violet-600" />
            </div>
            <p className="font-medium">Utiliser l&apos;IA</p>
            <p className="text-xs text-muted-foreground mt-1">Bonnes pratiques</p>
          </CardContent>
        </Card>
        <Card 
          className="hover:border-primary/50 transition-colors cursor-pointer"
          onClick={() => setContactOpen(true)}
        >
          <CardContent className="p-4 flex flex-col items-center text-center">
            <div className="p-3 bg-orange-100 rounded-xl mb-3">
              <Mail className="h-6 w-6 text-orange-600" />
            </div>
            <p className="font-medium">Contacter le support</p>
            <p className="text-xs text-muted-foreground mt-1">Réponse sous 24h</p>
          </CardContent>
        </Card>
      </div>

      {/* FAQ Sections */}
      <div className="space-y-6">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <HelpCircle className="h-5 w-5" />
          Questions fréquentes
        </h2>
        
        {FAQ_SECTIONS.map((section) => (
          <FaqSectionCard 
            key={section.id} 
            section={section} 
            searchQuery={searchQuery}
          />
        ))}

        {/* No results */}
        {searchQuery && FAQ_SECTIONS.every(s => 
          s.items.every(i => 
            !i.question.toLowerCase().includes(searchQuery.toLowerCase()) &&
            !i.answer.toLowerCase().includes(searchQuery.toLowerCase())
          )
        ) && (
          <Card>
            <CardContent className="py-12 text-center">
              <Search className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="font-semibold text-foreground">Aucun résultat</h3>
              <p className="text-sm text-muted-foreground mt-1">
                Essayez avec d&apos;autres mots-clés ou contactez notre support.
              </p>
              <Button className="mt-4" onClick={() => setContactOpen(true)}>
                <Mail className="h-4 w-4 mr-2" />
                Contacter le support
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Contact Support Modal */}
      {contactOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Contacter le support
              </CardTitle>
              <CardDescription>
                Notre équipe vous répond sous 24 heures ouvrées
              </CardDescription>
            </CardHeader>
            <CardContent>
              {contactSent ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="h-8 w-8 text-green-600" />
                  </div>
                  <h3 className="font-semibold text-lg">Message envoyé !</h3>
                  <p className="text-muted-foreground mt-2">
                    Nous vous répondrons dans les plus brefs délais.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleContactSubmit} className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Sujet</label>
                    <Input
                      value={contactForm.subject}
                      onChange={(e) => setContactForm(prev => ({ ...prev, subject: e.target.value }))}
                      placeholder="En quoi pouvons-nous vous aider ?"
                      className="mt-1"
                      required
                    />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Message</label>
                    <textarea
                      value={contactForm.message}
                      onChange={(e) => setContactForm(prev => ({ ...prev, message: e.target.value }))}
                      placeholder="Décrivez votre problème ou question..."
                      className="mt-1 w-full min-h-[150px] p-3 rounded-lg border border-input bg-background text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                      required
                    />
                  </div>
                  <div className="flex justify-end gap-3">
                    <Button 
                      type="button" 
                      variant="outline"
                      onClick={() => setContactOpen(false)}
                    >
                      Annuler
                    </Button>
                    <Button type="submit" className="gap-1">
                      <Send className="h-4 w-4" />
                      Envoyer
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Footer aide */}
      <Card className="bg-muted/50">
        <CardContent className="py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold">Vous n&apos;avez pas trouvé votre réponse ?</h3>
              <p className="text-sm text-muted-foreground">
                Notre équipe support est là pour vous aider
              </p>
            </div>
            <div className="flex gap-3">
              <Button variant="outline" className="gap-1">
                <ExternalLink className="h-4 w-4" />
                Documentation
              </Button>
              <Button onClick={() => setContactOpen(true)} className="gap-1">
                <Mail className="h-4 w-4" />
                Contactez-nous
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}





