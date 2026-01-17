import Link from 'next/link'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { 
  Star, 
  Zap, 
  Shield, 
  BarChart3, 
  MessageSquare, 
  Globe,
  Smartphone,
  Mail,
  Filter,
  Bot,
  Clock,
  Users,
  ArrowRight,
  CheckCircle
} from 'lucide-react'

const mainFeatures = [
  {
    icon: Smartphone,
    title: 'Collecte multicanal',
    description: 'Envoyez des demandes d\'avis par SMS ou email, directement depuis Doctolib grâce à notre extension Chrome.',
    benefits: [
      'Extension Chrome pour Doctolib',
      'Envoi SMS automatique',
      'Templates email personnalisables',
      'Rappels automatiques'
    ]
  },
  {
    icon: Filter,
    title: 'Tri intelligent des avis',
    description: 'Redirigez automatiquement les patients satisfaits vers Google et gardez les feedbacks négatifs en privé.',
    benefits: [
      'Seuil personnalisable (ex: 4+ étoiles)',
      'Redirection Google automatique',
      'Feedback privé pour amélioration',
      'Taux de conversion optimisé'
    ]
  },
  {
    icon: Bot,
    title: 'Assistant IA',
    description: 'Générez des réponses professionnelles en un clic grâce à notre intelligence artificielle.',
    benefits: [
      '3 suggestions par avis',
      'Tons personnalisables',
      'Mode Santé (déontologie)',
      'Apprentissage continu'
    ]
  },
  {
    icon: BarChart3,
    title: 'Analytics avancés',
    description: 'Suivez votre réputation en temps réel avec des tableaux de bord détaillés.',
    benefits: [
      'Évolution de la note',
      'Volume d\'avis par période',
      'Analyse des sentiments',
      'Export des données'
    ]
  },
  {
    icon: Globe,
    title: 'Widget site web',
    description: 'Affichez vos meilleurs avis directement sur votre site internet.',
    benefits: [
      'Widget personnalisable',
      'Badge note moyenne',
      'SEO-friendly (HTML pur)',
      'Responsive design'
    ]
  },
  {
    icon: Shield,
    title: 'Sécurité & Conformité',
    description: 'Vos données sont protégées et traitées conformément au RGPD.',
    benefits: [
      'Hébergement en France',
      'Chiffrement des données',
      '100% conforme RGPD',
      'Pas de revente de données'
    ]
  },
]

const integrations = [
  { name: 'Doctolib', description: 'Extension Chrome native', available: true },
  { name: 'Google Business', description: 'Synchronisation des avis', available: true },
  { name: 'Calendly', description: 'Intégration agenda', available: false },
  { name: 'Zapier', description: 'Automatisations', available: false },
]

export default function FeaturesPage() {
  return (
    <>
      <Header />
      
      <main>
        {/* Hero */}
        <section className="pt-32 pb-20 bg-gradient-to-br from-primary-50 via-white to-accent-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center">
              <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
                Des fonctionnalités pensées pour{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-600 to-accent-600">
                  votre succès
                </span>
              </h1>
              <p className="text-lg text-gray-600 mb-8">
                Découvrez tous les outils pour gérer, améliorer et diffuser votre réputation en ligne.
              </p>
            </div>
          </div>
        </section>

        {/* Main Features */}
        <section className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="space-y-24">
              {mainFeatures.map((feature, i) => (
                <div 
                  key={i} 
                  className={`grid md:grid-cols-2 gap-12 items-center ${i % 2 === 1 ? 'md:flex-row-reverse' : ''}`}
                >
                  <div className={i % 2 === 1 ? 'md:order-2' : ''}>
                    <div className="w-14 h-14 rounded-2xl bg-primary-100 text-primary-700 flex items-center justify-center mb-6">
                      <feature.icon className="h-7 w-7" />
                    </div>
                    <h2 className="text-3xl font-bold text-gray-900 mb-4">
                      {feature.title}
                    </h2>
                    <p className="text-lg text-gray-600 mb-6">
                      {feature.description}
                    </p>
                    <ul className="space-y-3">
                      {feature.benefits.map((benefit, j) => (
                        <li key={j} className="flex items-center gap-3">
                          <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                          <span className="text-gray-700">{benefit}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className={`bg-gradient-to-br from-gray-100 to-gray-50 rounded-3xl p-8 aspect-[4/3] flex items-center justify-center ${i % 2 === 1 ? 'md:order-1' : ''}`}>
                    <feature.icon className="h-32 w-32 text-gray-300" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Integrations */}
        <section className="py-20 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                Intégrations
              </h2>
              <p className="text-lg text-gray-600">
                Reputy s'intègre avec vos outils préférés
              </p>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
              {integrations.map((integration, i) => (
                <div 
                  key={i} 
                  className="p-6 rounded-2xl bg-white border border-gray-100 text-center"
                >
                  <div className="w-12 h-12 rounded-xl bg-gray-100 mx-auto mb-4 flex items-center justify-center">
                    <span className="text-xl font-bold text-gray-400">
                      {integration.name[0]}
                    </span>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1">
                    {integration.name}
                  </h3>
                  <p className="text-sm text-gray-500 mb-3">
                    {integration.description}
                  </p>
                  {integration.available ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded-full">
                      <CheckCircle className="h-3 w-3" />
                      Disponible
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                      Bientôt
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 bg-primary-900">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Prêt à essayer Reputy ?
            </h2>
            <p className="text-lg text-primary-200 mb-8">
              14 jours d'essai gratuit, sans engagement
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link 
                href="/signup" 
                className="inline-flex items-center gap-2 px-6 py-3 text-base font-semibold text-primary-900 bg-white rounded-xl hover:bg-gray-100 transition-colors"
              >
                Commencer gratuitement
                <ArrowRight className="h-5 w-5" />
              </Link>
              <Link 
                href="/pricing" 
                className="inline-flex items-center gap-2 px-6 py-3 text-base font-semibold text-white border border-white/30 rounded-xl hover:bg-white/10 transition-colors"
              >
                Voir les tarifs
              </Link>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  )
}
