import { ChevronRight } from 'lucide-react'
import { HEALTH_FAQ } from '@/lib/pricing-data'

export function HealthFAQ() {
  return (
    <section className="py-20 bg-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Questions fréquentes
          </h2>
          <p className="text-lg text-gray-600">
            Tout ce que vous devez savoir sur Reputy Health
          </p>
        </div>

        <div className="space-y-4">
          {HEALTH_FAQ.map((faq, i) => (
            <details
              key={i}
              className="group p-6 rounded-2xl bg-gray-50 border border-gray-100 hover:border-sky-200 transition-colors"
            >
              <summary className="flex items-center justify-between cursor-pointer list-none font-semibold text-gray-900">
                {faq.question}
                <ChevronRight className="h-5 w-5 text-gray-400 group-open:rotate-90 transition-transform" />
              </summary>
              <p className="mt-4 text-gray-600">{faq.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}
