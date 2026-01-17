import Link from 'next/link'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { CheckCircle, X, Star, ArrowRight, Sparkles } from 'lucide-react'

const plans = [
  {
    name: 'Health',
    description: 'Pour les professionnels de santé',
    price: 49,
    period: '/mois HT',
    highlight: false,
    features: [
      { name: 'Collecte SMS/Email illimitée', included: true },
      { name: 'Extension Doctolib', included: true },
      { name: 'Tri intelligent des avis', included: true },
      { name: 'Mode Santé (déontologie)', included: true },
      { name: 'Dashboard analytics', included: true },
      { name: 'Widget site web', included: true },
      { name: 'Assistant IA (50/mois)', included: true },
      { name: 'Support prioritaire', included: false },
      { name: 'Multi-établissements', included: false },
    ],
    cta: 'Commencer l\'essai',
    ctaLink: '/signup?plan=health',
  },
  {
    name: 'Food',
    description: 'Pour la restauration',
    price: 59,
    period: '/mois HT',
    highlight: true,
    features: [
      { name: 'Collecte SMS/Email illimitée', included: true },
      { name: 'QR Code table', included: true },
      { name: 'Tri intelligent des avis', included: true },
      { name: 'Intégration Google/TripAdvisor', included: true },
      { name: 'Dashboard analytics', included: true },
      { name: 'Widget site web', included: true },
      { name: 'Assistant IA (100/mois)', included: true },
      { name: 'Support prioritaire', included: true },
      { name: 'Multi-établissements', included: false },
    ],
    cta: 'Commencer l\'essai',
    ctaLink: '/signup?plan=food',
  },
  {
    name: 'Business',
    description: 'Pour les entreprises multi-sites',
    price: 149,
    period: '/mois HT',
    highlight: false,
    features: [
      { name: 'Collecte SMS/Email illimitée', included: true },
      { name: 'Toutes les intégrations', included: true },
      { name: 'Tri intelligent des avis', included: true },
      { name: 'Dashboard centralisé', included: true },
      { name: 'Analytics avancés', included: true },
      { name: 'Widget site web', included: true },
      { name: 'Assistant IA illimité', included: true },
      { name: 'Support dédié', included: true },
      { name: 'Multi-établissements', included: true },
    ],
    cta: 'Contacter les ventes',
    ctaLink: '/signup?plan=business',
  },
]

const faqs = [
  {
    question: 'Puis-je changer de plan à tout moment ?',
    answer: 'Oui, vous pouvez upgrader ou downgrader votre plan à tout moment. La différence sera calculée au prorata.',
  },
  {
    question: 'Y a-t-il un engagement ?',
    answer: 'Non, tous nos plans sont sans engagement. Vous pouvez annuler à tout moment.',
  },
  {
    question: 'Comment fonctionne l\'essai gratuit ?',
    answer: 'Vous bénéficiez de 14 jours d\'essai gratuit avec toutes les fonctionnalités. Aucune carte bancaire requise.',
  },
  {
    question: 'Proposez-vous des remises pour les associations ?',
    answer: 'Oui, contactez-nous pour discuter de tarifs adaptés aux associations et structures non lucratives.',
  },
]

export default function PricingPage() {
  return (
    <>
      <Header />
      
      <main>
        {/* Hero */}
        <section className="pt-32 pb-20 bg-gradient-to-br from-primary-50 via-white to-accent-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto text-center">
              <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
                Des tarifs{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary-600 to-accent-600">
                  adaptés à votre activité
                </span>
              </h1>
              <p className="text-lg text-gray-600 mb-4">
                Choisissez le plan qui correspond à vos besoins. 14 jours d'essai gratuit inclus.
              </p>
              <p className="text-sm text-gray-500">
                Sans engagement • Annulation à tout moment • Sans carte bancaire pour l'essai
              </p>
            </div>
          </div>
        </section>

        {/* Pricing Cards */}
        <section className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid md:grid-cols-3 gap-8">
              {plans.map((plan, i) => (
                <div 
                  key={i} 
                  className={`relative rounded-3xl p-8 ${
                    plan.highlight 
                      ? 'bg-primary-900 text-white ring-4 ring-primary-500 ring-offset-4' 
                      : 'bg-white border-2 border-gray-100'
                  }`}
                >
                  {plan.highlight && (
                    <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                      <span className="inline-flex items-center gap-1 px-4 py-1 bg-amber-400 text-amber-900 text-sm font-semibold rounded-full">
                        <Sparkles className="h-4 w-4" />
                        Populaire
                      </span>
                    </div>
                  )}
                  
                  <div className="text-center mb-8">
                    <h3 className={`text-xl font-bold mb-2 ${plan.highlight ? 'text-white' : 'text-gray-900'}`}>
                      {plan.name}
                    </h3>
                    <p className={`text-sm mb-4 ${plan.highlight ? 'text-primary-200' : 'text-gray-500'}`}>
                      {plan.description}
                    </p>
                    <div className="flex items-baseline justify-center gap-1">
                      <span className={`text-5xl font-bold ${plan.highlight ? 'text-white' : 'text-gray-900'}`}>
                        {plan.price}€
                      </span>
                      <span className={plan.highlight ? 'text-primary-200' : 'text-gray-500'}>
                        {plan.period}
                      </span>
                    </div>
                  </div>
                  
                  <ul className="space-y-4 mb-8">
                    {plan.features.map((feature, j) => (
                      <li key={j} className="flex items-center gap-3">
                        {feature.included ? (
                          <CheckCircle className={`h-5 w-5 flex-shrink-0 ${plan.highlight ? 'text-green-400' : 'text-green-500'}`} />
                        ) : (
                          <X className={`h-5 w-5 flex-shrink-0 ${plan.highlight ? 'text-primary-400' : 'text-gray-300'}`} />
                        )}
                        <span className={feature.included ? '' : (plan.highlight ? 'text-primary-300' : 'text-gray-400')}>
                          {feature.name}
                        </span>
                      </li>
                    ))}
                  </ul>
                  
                  <Link 
                    href={plan.ctaLink}
                    className={`block w-full py-3 px-6 rounded-xl font-semibold text-center transition-colors ${
                      plan.highlight 
                        ? 'bg-white text-primary-900 hover:bg-gray-100' 
                        : 'bg-primary-900 text-white hover:bg-primary-950'
                    }`}
                  >
                    {plan.cta}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-20 bg-gray-50">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-gray-900 mb-4">
                Questions sur les tarifs
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
                    <span className="text-gray-400 group-open:rotate-180 transition-transform">
                      ▼
                    </span>
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
              Vous hésitez encore ?
            </h2>
            <p className="text-lg text-primary-200 mb-8">
              Essayez gratuitement pendant 14 jours, sans engagement ni carte bancaire
            </p>
            <Link 
              href="/signup" 
              className="inline-flex items-center gap-2 px-6 py-3 text-base font-semibold text-primary-900 bg-white rounded-xl hover:bg-gray-100 transition-colors"
            >
              Démarrer mon essai gratuit
              <ArrowRight className="h-5 w-5" />
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </>
  )
}
