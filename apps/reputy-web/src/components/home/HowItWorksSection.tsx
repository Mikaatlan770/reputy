import { STEPS } from '@/lib/pricing-data'

export function HowItWorksSection() {
  return (
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
          {STEPS.map((item, i) => (
            <div key={item.title} className="relative">
              <div className="text-6xl font-bold text-primary-100 mb-4">
                {item.step}
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-2">
                {item.title}
              </h3>
              <p className="text-gray-600">{item.description}</p>
              {i < STEPS.length - 1 && (
                <div className="hidden md:block absolute top-8 right-0 w-1/3 h-0.5 bg-gradient-to-r from-primary-200 to-transparent" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
