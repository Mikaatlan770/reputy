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
  ChevronRight,
  CheckCircle,
  ArrowRight
} from 'lucide-react'

const features = [
  {
    icon: Star,
    title: 'Collecte intelligente',
    description: 'Envoyez des demandes d\'avis personnalisées par SMS ou email après chaque consultation.',
  },
  {
    icon: Zap,
    title: 'Tri automatique',
    description: 'Les patients satisfaits sont redirigés vers Google, les autres partagent en privé.',
  },
  {
    icon: Shield,
    title: 'Mode Santé',
    description: 'Réponses adaptées au secteur médical, conformes à la déontologie.',
  },
  {
    icon: BarChart3,
    title: 'Analytics',
    description: 'Tableau de bord complet pour suivre votre réputation en temps réel.',
  },
  {
    icon: MessageSquare,
    title: 'Assistant IA',
    description: 'Suggestions de réponses intelligentes pour chaque avis reçu.',
  },
  {
    icon: Globe,
    title: 'Widget site web',
    description: 'Affichez vos meilleurs avis directement sur votre site.',
  },
]

const testimonials = [
  {
    content: 'Reputy a transformé notre relation avec les patients. Notre note Google est passée de 4.1 à 4.7 en 3 mois.',
    author: 'Dr. Marie Dupont',
    role: 'Médecin généraliste, Paris',
    rating: 5,
  },
  {
    content: 'L\'assistant IA est un gain de temps incroyable. Je réponds à tous mes avis en quelques clics.',
    author: 'Cabinet dentaire Smile',
    role: 'Lyon',
    rating: 5,
  },
  {
    content: 'Simple, efficace, et le support client est réactif. Je recommande vivement.',
    author: 'Restaurant Le Bistrot',
    role: 'Bordeaux',
    rating: 5,
  },
]

const faqs = [
  {
    question: 'Comment fonctionne la collecte d\'avis ?',
    answer: 'Après chaque rendez-vous, envoyez une demande par SMS ou email. Le patient note son expérience. S\'il est satisfait (4-5★), il est redirigé vers Google. Sinon, son feedback reste privé.',
  },
  {
    question: 'Est-ce conforme au RGPD ?',
    answer: 'Oui, Reputy est 100% conforme au RGPD. Les données sont hébergées en France et vous gardez le contrôle total sur les informations de vos patients.',
  },
  {
    question: 'Puis-je essayer gratuitement ?',
    answer: 'Oui ! Nous proposons un essai gratuit de 14 jours sans engagement et sans carte bancaire.',
  },
  {
    question: 'L\'intégration avec Doctolib est-elle possible ?',
    answer: 'Oui, grâce à notre extension Chrome, vous pouvez envoyer des demandes d\'avis directement depuis votre interface Doctolib en un clic.',
  },
]

export default function HomePage() {
  return (
    <>
      <Header />
      
      <main>
        {/* Hero Section */}
        <section className="relative pt-32 pb-20 overflow-hidden">
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-primary-50 via-white to-accent-50 -z-10" />
          <div className="absolute top-20 right-0 w-96 h-96 bg-primary-100 rounded-full blur-3xl opacity-50 -z-10" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-accent-100 rounded-full blur-3xl opacity-50 -z-10" />
          
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-primary-100 text-primary-900 rounded-full text-sm font-medium mb-6 animate-fadeIn">
                <Star className="h-4 w-4" />
                La réputation qui inspire confiance
              </div>
              
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-6 animate-fadeIn animate-delay-100">
                Gérez votre e-réputation{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-600 to-accent-600">
                  en toute simplicité
                </span>
              </h1>
              
              <p className="text-lg md:text-xl text-gray-600 mb-8 animate-fadeIn animate-delay-200">
                Collectez, gérez et diffusez vos avis clients. Boostez votre note Google 
                et transformez vos patients satisfaits en ambassadeurs.
              </p>
              
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fadeIn animate-delay-300">
                <Link 
                  href="/signup" 
                  className="inline-flex items-center gap-2 px-6 py-3 text-base font-semibold text-white bg-primary-900 rounded-xl hover:bg-primary-950 transition-all shadow-lg shadow-primary-900/25 hover:shadow-xl hover:shadow-primary-900/30"
                >
                  Essai gratuit 14 jours
                  <ArrowRight className="h-5 w-5" />
                </Link>
                <Link 
                  href="/features" 
                  className="inline-flex items-center gap-2 px-6 py-3 text-base font-semibold text-gray-700 bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all"
                >
                  Voir les fonctionnalités
                </Link>
              </div>
              
              <p className="mt-4 text-sm text-gray-500 animate-fadeIn animate-delay-400">
                Sans carte bancaire • Annulation à tout moment
              </p>
            </div>
            
            {/* Stats */}
            <div className="mt-20 grid grid-cols-2 md:grid-cols-4 gap-8">
              {[
                { value: '+0.6', label: 'pts de note moyenne' },
                { value: '3x', label: 'plus d\'avis Google' },
                { value: '92%', label: 'taux de satisfaction' },
                { value: '2min', label: 'temps de réponse IA' },
              ].map((stat, i) => (
                <div key={i} className="text-center">
                  <p className="text-3xl md:text-4xl font-bold text-primary-900">{stat.value}</p>
                  <p className="text-sm text-gray-500 mt-1">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                Tout ce dont vous avez besoin
              </h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                Une solution complète pour transformer votre réputation en ligne
              </p>
            </div>
            
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
              {features.map((feature, i) => (
                <div 
                  key={i} 
                  className="p-6 rounded-2xl border border-gray-100 hover:border-primary-200 hover:shadow-lg hover:shadow-primary-100/50 transition-all group"
                >
                  <div className="w-12 h-12 rounded-xl bg-primary-100 text-primary-700 flex items-center justify-center mb-4 group-hover:bg-primary-900 group-hover:text-white transition-colors">
                    <feature.icon className="h-6 w-6" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-gray-600">
                    {feature.description}
                  </p>
                </div>
              ))}
            </div>
            
            <div className="text-center mt-12">
              <Link 
                href="/features" 
                className="inline-flex items-center gap-2 text-primary-700 font-semibold hover:text-primary-900 transition-colors"
              >
                Voir toutes les fonctionnalités
                <ChevronRight className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="py-20 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                Comment ça marche ?
              </h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                3 étapes simples pour booster votre réputation
              </p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  step: '01',
                  title: 'Envoyez une demande',
                  description: 'Après chaque consultation, envoyez une demande d\'avis par SMS ou email en 1 clic.',
                },
                {
                  step: '02',
                  title: 'Le patient note',
                  description: 'Il attribue une note de 1 à 5 étoiles et peut laisser un commentaire optionnel.',
                },
                {
                  step: '03',
                  title: 'Tri intelligent',
                  description: 'Les patients satisfaits sont invités à laisser un avis Google. Les autres partagent en privé.',
                },
              ].map((item, i) => (
                <div key={i} className="relative">
                  <div className="text-6xl font-bold text-primary-100 mb-4">
                    {item.step}
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    {item.title}
                  </h3>
                  <p className="text-gray-600">
                    {item.description}
                  </p>
                  {i < 2 && (
                    <div className="hidden md:block absolute top-8 right-0 w-1/3 h-0.5 bg-gradient-to-r from-primary-200 to-transparent" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Testimonials */}
        <section className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                Ils nous font confiance
              </h2>
              <p className="text-lg text-gray-600">
                Plus de 500 professionnels utilisent Reputy au quotidien
              </p>
            </div>
            
            <div className="grid md:grid-cols-3 gap-8">
              {testimonials.map((testimonial, i) => (
                <div 
                  key={i} 
                  className="p-6 rounded-2xl bg-gray-50 border border-gray-100"
                >
                  <div className="flex gap-1 mb-4">
                    {[...Array(testimonial.rating)].map((_, j) => (
                      <Star key={j} className="h-5 w-5 text-amber-400 fill-amber-400" />
                    ))}
                  </div>
                  <p className="text-gray-700 mb-6">
                    "{testimonial.content}"
                  </p>
                  <div>
                    <p className="font-semibold text-gray-900">{testimonial.author}</p>
                    <p className="text-sm text-gray-500">{testimonial.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-20 bg-gray-50">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
                Questions fréquentes
              </h2>
            </div>
            
            <div className="space-y-4">
              {faqs.map((faq, i) => (
                <details 
                  key={i} 
                  className="group p-6 rounded-2xl bg-white border border-gray-100"
                >
                  <summary className="flex items-center justify-between cursor-pointer list-none font-semibold text-gray-900">
                    {faq.question}
                    <ChevronRight className="h-5 w-5 text-gray-400 group-open:rotate-90 transition-transform" />
                  </summary>
                  <p className="mt-4 text-gray-600">
                    {faq.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 bg-primary-900">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Prêt à booster votre réputation ?
            </h2>
            <p className="text-lg text-primary-200 mb-8">
              Rejoignez plus de 500 professionnels qui utilisent Reputy
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
