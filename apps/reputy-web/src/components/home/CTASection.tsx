import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export function CTASection() {
  return (
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
            href="/signup?plan=bronze"
            className="inline-flex items-center gap-2 px-6 py-3 text-base font-semibold text-primary-900 bg-white rounded-xl hover:bg-gray-100 transition-colors"
          >
            Commencer gratuitement
            <ArrowRight className="h-5 w-5" />
          </Link>
          <Link
            href="/health#pricing"
            className="inline-flex items-center gap-2 px-6 py-3 text-base font-semibold text-white border border-white/30 rounded-xl hover:bg-white/10 transition-colors"
          >
            Voir les tarifs
          </Link>
        </div>
      </div>
    </section>
  )
}
