import { MessageSquare, Sparkles, QrCode, Info } from 'lucide-react'
import { ADDONS } from '@/lib/pricing-data'
import { AddonCard } from '@/components/ui/AddonCard'

export function AddonsSection() {
  // Combine SMS and Email packs for Communication section
  const communicationAddons = [...ADDONS.sms, ...ADDONS.email]

  return (
    <section className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Packs additionnels
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Besoin de plus ? Ajoutez des crédits à la demande, quand vous voulez
          </p>
        </div>

        <div className="space-y-12">
          {/* Communication */}
          <div>
            <div className="flex items-center gap-2 mb-6">
              <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                <MessageSquare className="h-5 w-5" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">Communication</h3>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {communicationAddons.map((addon) => (
                <AddonCard key={addon.id} addon={addon} />
              ))}
            </div>
          </div>

          {/* Intelligence Artificielle */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-lg bg-purple-100 text-purple-600 flex items-center justify-center">
                <Sparkles className="h-5 w-5" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">
                Intelligence Artificielle
              </h3>
            </div>
            {/* Note importante */}
            <div className="flex items-start gap-2 mb-6 p-3 bg-purple-50 border border-purple-100 rounded-lg">
              <Info className="h-4 w-4 text-purple-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-purple-700">
                L&apos;assistant IA est inclus dans les forfaits Or (75
                réponses/mois) et Platinum (150 réponses/mois). Les packs IA
                permettent d&apos;en ajouter à tout moment.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {ADDONS.ia.map((addon) => (
                <AddonCard key={addon.id} addon={addon} />
              ))}
            </div>
          </div>

          {/* QR Code & NFC */}
          <div>
            <div className="flex items-center gap-2 mb-6">
              <div className="w-10 h-10 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
                <QrCode className="h-5 w-5" />
              </div>
              <h3 className="text-xl font-bold text-gray-900">
                QR Code & Tag NFC
              </h3>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {ADDONS.qrNfc.map((addon) => (
                <AddonCard key={addon.id} addon={addon} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
