import {
  MessageSquare,
  Mail,
  Chrome,
  QrCode,
  BarChart3,
  Sparkles,
  Shield,
  Globe,
} from 'lucide-react'

const features = [
  {
    icon: MessageSquare,
    title: 'Envoi par SMS',
    description:
      'Envoyez des demandes d\'avis par SMS après chaque consultation. Taux d\'ouverture supérieur à 95%.',
  },
  {
    icon: Mail,
    title: 'Envoi par Email',
    description:
      'Demandes d\'avis par email personnalisées avec le nom de votre cabinet.',
  },
  {
    icon: Chrome,
    title: 'Module Doctolib',
    description:
      'Extension Chrome pour envoyer des demandes d\'avis directement depuis Doctolib en 1 clic.',
  },
  {
    icon: QrCode,
    title: 'QR Code & Tag NFC',
    description:
      'Collectez des avis en salle d\'attente avec un simple scan.',
  },
  {
    icon: BarChart3,
    title: 'ReputyBoard',
    description:
      'Tableau de bord complet pour suivre et gérer tous vos avis en un seul endroit.',
  },
  {
    icon: Sparkles,
    title: 'Assistant IA',
    description:
      'Suggestions de réponses personnalisées pour chaque avis. Gagnez du temps au quotidien.',
  },
  {
    icon: Globe,
    title: 'Widget d\'avis',
    description:
      'Affichez vos meilleurs avis Google sur votre site web en quelques minutes.',
  },
  {
    icon: Shield,
    title: 'Conforme santé',
    description:
      'Adapté à la déontologie médicale. Données hébergées en France, RGPD compliant.',
  },
]

export function HealthFeatures() {
  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Toutes les fonctionnalités pour votre cabinet
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Des outils simples et efficaces pour améliorer votre réputation en
            ligne
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, i) => (
              <div
                key={i}
                className="p-6 rounded-2xl border border-gray-100 hover:border-sky-200 hover:shadow-lg hover:shadow-sky-50 transition-all group"
              >
                <div className="w-12 h-12 rounded-xl bg-sky-50 text-sky-600 flex items-center justify-center mb-4 group-hover:bg-sky-600 group-hover:text-white transition-colors">
                <feature.icon className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {feature.title}
              </h3>
              <p className="text-sm text-gray-600">{feature.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
