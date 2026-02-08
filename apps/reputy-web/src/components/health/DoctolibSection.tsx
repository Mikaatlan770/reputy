import { Chrome, Users, Shield, Trash2, CheckCircle } from 'lucide-react'

const features = [
  {
    icon: Chrome,
    title: 'Installation simple',
    description:
      'Extension Chrome installée en quelques clics sur les postes souhaités.',
  },
  {
    icon: Users,
    title: 'Multi-postes',
    description:
      'Installez sur l\'accueil, le secrétariat, les différents cabinets.',
  },
  {
    icon: Shield,
    title: 'Sécurisé',
    description:
      'Chaque installation est traçable depuis votre ReputyBoard.',
  },
  {
    icon: Trash2,
    title: 'Révocable',
    description:
      'Révoquez l\'accès d\'un poste à tout moment en cas de besoin.',
  },
]

export function DoctolibSection() {
  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left: Screenshot placeholder */}
          <div className="relative order-2 lg:order-1">
            <div className="aspect-video rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 border border-blue-200 shadow-2xl shadow-blue-100/50 flex items-center justify-center overflow-hidden">
              {/* Mock Doctolib interface with extension */}
              <div className="absolute inset-4 rounded-xl bg-white shadow-lg">
                {/* Browser chrome */}
                <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-t-xl border-b">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                  <div className="flex-1 h-6 bg-white rounded mx-4 flex items-center px-2">
                    <span className="text-xs text-gray-500">doctolib.fr</span>
                  </div>
                  {/* Extension icon */}
                  <div className="w-8 h-8 rounded bg-sky-500 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">R</span>
                  </div>
                </div>
                {/* Content */}
                <div className="p-4">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 rounded-full bg-blue-100" />
                    <div>
                      <div className="h-4 w-32 bg-gray-200 rounded mb-1" />
                      <div className="h-3 w-24 bg-gray-100 rounded" />
                    </div>
                  </div>
                  {/* Reputy button overlay */}
                  <div className="relative">
                    <div className="h-10 bg-gray-50 rounded" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <button className="px-4 py-2 bg-sky-600 text-white text-sm font-semibold rounded-lg shadow-lg flex items-center gap-2">
                        <CheckCircle className="h-4 w-4" />
                        Demander un avis
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            {/* Decorative */}
            <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-blue-200 rounded-full blur-2xl opacity-50" />
          </div>

          {/* Right: Content */}
          <div className="order-1 lg:order-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium mb-4">
              <Chrome className="h-4 w-4" />
              Module Doctolib
            </div>

            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
              Envoyez des demandes d&apos;avis{' '}
              <span className="text-blue-600">directement depuis Doctolib</span>
            </h2>

            <p className="text-lg text-gray-600 mb-8">
              L&apos;extension Reputy s&apos;intègre à Doctolib pour permettre à
              votre équipe d&apos;envoyer des demandes d&apos;avis en un clic,
              directement depuis la fiche patient.
            </p>

            <div className="grid sm:grid-cols-2 gap-4 mb-8">
              {features.map((feature, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0">
                    <feature.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">
                      {feature.title}
                    </h4>
                    <p className="text-sm text-gray-600">
                      {feature.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-sm text-amber-800">
                <strong>Note :</strong> L&apos;extension sert uniquement à
                l&apos;envoi de demandes d&apos;avis. La consultation et la
                gestion des avis se fait depuis le ReputyBoard.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
