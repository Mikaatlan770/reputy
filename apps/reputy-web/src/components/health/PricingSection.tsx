import { HEALTH_PLANS } from '@/lib/pricing-data'
import { PricingCard } from '@/components/ui/PricingCard'
import { Lightbulb } from 'lucide-react'

export function PricingSection() {
  return (
    <section id="pricing" className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Choisissez votre forfait
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Des tarifs simples et transparents, adaptés à votre activité
          </p>
        </div>

        {/* Pricing cards */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
          {HEALTH_PLANS.map((plan) => (
            <PricingCard key={plan.id} plan={plan} />
          ))}
        </div>

        {/* Message clé */}
        <div className="max-w-2xl mx-auto">
          <div className="flex items-start gap-4 p-6 bg-sky-50 border border-sky-200 rounded-2xl">
            <div className="w-10 h-10 rounded-full bg-sky-100 text-sky-600 flex items-center justify-center flex-shrink-0">
              <Lightbulb className="h-5 w-5" />
            </div>
            <div>
              <h4 className="font-semibold text-sky-900 mb-1">
                Vous gérez librement votre consommation
              </h4>
              <p className="text-sm text-sky-700">
                Si votre activité évolue, vous pouvez ajouter des crédits à tout
                moment via les packs additionnels disponibles ci-dessous.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
