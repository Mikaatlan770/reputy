import Link from 'next/link'
import { Star, ArrowRight } from 'lucide-react'

export function HeroSection() {
  return (
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
            Collectez, gérez et répondez à vos avis clients. Boostez votre note
            Google et transformez vos patients satisfaits en ambassadeurs.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fadeIn animate-delay-300">
            <Link
              href="/health"
              className="inline-flex items-center gap-2 px-6 py-3 text-base font-semibold text-white bg-primary-900 rounded-xl hover:bg-primary-950 transition-all shadow-lg shadow-primary-900/25 hover:shadow-xl hover:shadow-primary-900/30"
            >
              Découvrir Reputy Health
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              href="#verticals"
              className="inline-flex items-center gap-2 px-6 py-3 text-base font-semibold text-gray-700 bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all"
            >
              Voir toutes les solutions
            </Link>
          </div>

          <p className="mt-4 text-sm text-gray-500 animate-fadeIn animate-delay-400">
            Forfait Bronze gratuit • Sans carte bancaire • Sans engagement
          </p>
        </div>
      </div>
    </section>
  )
}
