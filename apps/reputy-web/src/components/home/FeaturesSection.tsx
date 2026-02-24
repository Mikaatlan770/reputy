import Link from 'next/link'
import {
  Star,
  Shield,
  BarChart3,
  Sparkles,
  Chrome,
  QrCode,
  Globe,
  ChevronRight,
} from 'lucide-react'
import { FEATURES } from '@/lib/pricing-data'

const iconMap = {
  Star,
  Shield,
  BarChart3,
  Sparkles,
  Chrome,
  QrCode,
  Globe,
}

export function FeaturesSection() {
  return (
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
          {FEATURES.map((feature) => {
            const Icon = iconMap[feature.icon as keyof typeof iconMap]
            return (
              <div
                key={feature.title}
                className="p-6 rounded-2xl border border-gray-100 hover:border-primary-200 hover:shadow-lg hover:shadow-primary-100/50 transition-all group"
              >
                <div className="w-12 h-12 rounded-xl bg-primary-100 text-primary-700 flex items-center justify-center mb-4 group-hover:bg-primary-900 group-hover:text-white transition-colors">
                  {Icon && <Icon className="h-6 w-6" />}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            )
          })}
        </div>

        <div className="text-center mt-12">
          <Link
            href="/health"
            className="inline-flex items-center gap-2 text-primary-700 font-semibold hover:text-primary-900 transition-colors"
          >
            Voir toutes les fonctionnalités
            <ChevronRight className="h-5 w-5" />
          </Link>
        </div>
      </div>
    </section>
  )
}
