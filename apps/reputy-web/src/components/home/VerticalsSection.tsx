import { VERTICALS } from '@/lib/pricing-data'
import { VerticalCard } from '@/components/ui/VerticalCard'

export function VerticalsSection() {
  return (
    <section id="verticals" className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Une solution pour chaque secteur
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Reputy s&apos;adapte à votre activité avec des fonctionnalités
            spécifiques à votre métier
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {VERTICALS.map((vertical) => (
            <VerticalCard key={vertical.id} vertical={vertical} />
          ))}
        </div>
      </div>
    </section>
  )
}
