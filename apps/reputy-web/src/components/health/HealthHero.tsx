import Link from 'next/link'
import { Stethoscope, ArrowRight, Shield, CheckCircle } from 'lucide-react'

export function HealthHero() {
  return (
    <section className="relative pt-32 pb-20 overflow-hidden">
      {/* Background gradient - sky blue theme for health */}
      <div className="absolute inset-0 bg-gradient-to-br from-sky-50 via-white to-cyan-50 -z-10" />
      <div className="absolute top-20 right-0 w-96 h-96 bg-sky-100 rounded-full blur-3xl opacity-50 -z-10" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-cyan-100 rounded-full blur-3xl opacity-50 -z-10" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-sky-100 text-sky-800 rounded-full text-sm font-medium mb-6 animate-fadeIn">
            <Stethoscope className="h-4 w-4" />
            Spécialement conçu pour les professionnels de santé
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-6 animate-fadeIn animate-delay-100">
            Boostez la réputation de{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-600 to-cyan-600">
              votre cabinet médical
            </span>
          </h1>

          <p className="text-lg md:text-xl text-gray-600 mb-8 animate-fadeIn animate-delay-200">
            Collectez des avis patients, gérez votre réputation Google et
            répondez à tous vos avis depuis un tableau de bord unique.
          </p>

          {/* Trust badges */}
          <div className="flex flex-wrap items-center justify-center gap-4 mb-8 animate-fadeIn animate-delay-250">
            <div className="flex items-center gap-2 text-sm text-gray-600">
            <Shield className="h-4 w-4 text-sky-600" />
            Conforme RGPD
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <CheckCircle className="h-4 w-4 text-sky-600" />
            Hébergement France
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Stethoscope className="h-4 w-4 text-sky-600" />
              Déontologie médicale
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 animate-fadeIn animate-delay-300">
            <Link
              href="/signup?plan=bronze"
              className="inline-flex items-center gap-2 px-6 py-3 text-base font-semibold text-white bg-sky-600 rounded-xl hover:bg-sky-700 transition-all shadow-lg shadow-sky-600/25 hover:shadow-xl hover:shadow-sky-600/30"
            >
              Commencer gratuitement
              <ArrowRight className="h-5 w-5" />
            </Link>
            <Link
              href="#pricing"
              className="inline-flex items-center gap-2 px-6 py-3 text-base font-semibold text-gray-700 bg-white rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all"
            >
              Voir les forfaits
            </Link>
          </div>

          <p className="mt-4 text-sm text-gray-500 animate-fadeIn animate-delay-400">
            Sans carte bancaire • Sans engagement
          </p>
        </div>
      </div>
    </section>
  )
}
