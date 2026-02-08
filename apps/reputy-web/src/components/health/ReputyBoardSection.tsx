import { BarChart3, MessageSquare, TrendingUp, Clock } from 'lucide-react'

const benefits = [
  {
    icon: BarChart3,
    title: 'Vue d\'ensemble',
    description: 'Tous vos avis centralisés en un seul endroit',
  },
  {
    icon: MessageSquare,
    title: 'Réponses rapides',
    description: 'Répondez à vos avis Google directement depuis le dashboard',
  },
  {
    icon: TrendingUp,
    title: 'Suivi de tendances',
    description: 'Analysez l\'évolution de votre réputation',
  },
  {
    icon: Clock,
    title: 'Gain de temps',
    description: 'Interface intuitive pour une gestion efficace',
  },
]

export function ReputyBoardSection() {
  return (
    <section className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left: Content */}
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-sky-100 text-sky-700 rounded-full text-sm font-medium mb-4">
              <BarChart3 className="h-4 w-4" />
              ReputyBoard
            </div>

            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
              Votre tableau de bord{' '}
              <span className="text-sky-600">tout-en-un</span>
            </h2>

            <p className="text-lg text-gray-600 mb-8">
              Le ReputyBoard est votre centre de commande pour gérer votre
              réputation en ligne. Consultez vos avis, répondez à vos patients
              et suivez vos statistiques depuis une interface unique et
              intuitive.
            </p>

            <div className="grid sm:grid-cols-2 gap-4">
              {benefits.map((benefit, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-sky-100 text-sky-600 flex items-center justify-center flex-shrink-0">
                    <benefit.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">
                      {benefit.title}
                    </h4>
                    <p className="text-sm text-gray-600">
                      {benefit.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Screenshot placeholder */}
          <div className="relative">
            <div className="aspect-[4/3] rounded-2xl bg-gradient-to-br from-sky-100 to-cyan-100 border border-sky-200 shadow-2xl shadow-sky-100/50 flex items-center justify-center overflow-hidden">
              {/* Placeholder for dashboard screenshot */}
              <div className="absolute inset-4 rounded-xl bg-white shadow-lg p-4">
                {/* Mock dashboard UI */}
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                  <div className="flex-1 h-6 bg-gray-100 rounded ml-4" />
                </div>
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div className="h-20 bg-sky-50 rounded-lg flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-sky-700">4.8</div>
                      <div className="text-xs text-gray-500">Note moyenne</div>
                    </div>
                  </div>
                  <div className="h-20 bg-blue-50 rounded-lg flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-700">127</div>
                      <div className="text-xs text-gray-500">Avis ce mois</div>
                    </div>
                  </div>
                  <div className="h-20 bg-amber-50 rounded-lg flex items-center justify-center">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-amber-700">94%</div>
                      <div className="text-xs text-gray-500">Satisfaction</div>
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="h-12 bg-gray-50 rounded-lg" />
                  <div className="h-12 bg-gray-50 rounded-lg" />
                  <div className="h-12 bg-gray-50 rounded-lg" />
                </div>
              </div>
            </div>
            {/* Decorative elements */}
            <div className="absolute -top-4 -right-4 w-24 h-24 bg-sky-200 rounded-full blur-2xl opacity-50" />
            <div className="absolute -bottom-4 -left-4 w-32 h-32 bg-cyan-200 rounded-full blur-2xl opacity-50" />
          </div>
        </div>
      </div>
    </section>
  )
}
