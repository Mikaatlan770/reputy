import Link from 'next/link'
import { ArrowRight, Shield, Clock, CreditCard } from 'lucide-react'

export function HealthCTA() {
  return (
    <section className="py-20 bg-gradient-to-br from-sky-600 to-cyan-700">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
          Prêt à booster votre réputation ?
        </h2>
        <p className="text-lg text-sky-100 mb-8">
          Rejoignez les professionnels de santé qui font confiance à Reputy
        </p>

        {/* Trust badges */}
        <div className="flex flex-wrap items-center justify-center gap-6 mb-8">
          <div className="flex items-center gap-2 text-sky-200 text-sm">
            <Clock className="h-4 w-4" />
            Gratuit à vie
          </div>
          <div className="flex items-center gap-2 text-sky-200 text-sm">
            <CreditCard className="h-4 w-4" />
            Sans carte bancaire
          </div>
          <div className="flex items-center gap-2 text-sky-200 text-sm">
            <Shield className="h-4 w-4" />
            Sans engagement
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link
            href="/signup?plan=bronze"
            className="inline-flex items-center gap-2 px-8 py-4 text-lg font-semibold text-sky-900 bg-white rounded-xl hover:bg-sky-50 transition-colors shadow-lg"
          >
            Commencer gratuitement
            <ArrowRight className="h-5 w-5" />
          </Link>
          <Link
            href="#pricing"
            className="inline-flex items-center gap-2 px-6 py-3 text-base font-semibold text-white border border-white/30 rounded-xl hover:bg-white/10 transition-colors"
          >
            Comparer les forfaits
          </Link>
        </div>
      </div>
    </section>
  )
}
