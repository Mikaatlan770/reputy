import { QrCode, Smartphone, Wifi, CheckCircle } from 'lucide-react'

export function QrNfcSection() {
  return (
    <section className="py-20 bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left: Content */}
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm font-medium mb-4">
              <QrCode className="h-4 w-4" />
              QR Code & Tag NFC
            </div>

            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
              Collectez des avis{' '}
              <span className="text-amber-600">en salle d&apos;attente</span>
            </h2>

            <p className="text-lg text-gray-600 mb-8">
              Offrez à vos patients un moyen simple et rapide de vous laisser un
              avis. Un scan et c&apos;est fait !
            </p>

            <div className="space-y-4 mb-8">
              <div className="flex items-start gap-4 p-4 bg-white rounded-xl border border-gray-100">
                <div className="w-12 h-12 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center flex-shrink-0">
                  <QrCode className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 mb-1">QR Code</h4>
                  <p className="text-sm text-gray-600">
                    Imprimez le QR code et affichez-le en salle d&apos;attente,
                    à l&apos;accueil ou sur votre comptoir. Les patients le
                    scannent avec leur téléphone.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-4 p-4 bg-white rounded-xl border border-gray-100">
                <div className="w-12 h-12 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0">
                  <Wifi className="h-6 w-6" />
                </div>
                <div>
                  <h4 className="font-semibold text-gray-900 mb-1">Tag NFC</h4>
                  <p className="text-sm text-gray-600">
                    Un simple toucher suffit ! Collez le tag NFC sur un support
                    visible. Les patients approchent leur téléphone pour
                    accéder au formulaire d&apos;avis.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <CheckCircle className="h-4 w-4 text-sky-500" />
                Sans application à installer
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <CheckCircle className="h-4 w-4 text-sky-500" />
                Fonctionne avec tous les smartphones
              </div>
            </div>
          </div>

          {/* Right: Visual */}
          <div className="relative">
            <div className="aspect-square max-w-md mx-auto">
              {/* Background decorative elements */}
              <div className="absolute inset-0 bg-gradient-to-br from-amber-100 to-orange-100 rounded-3xl transform rotate-3" />

              {/* Main card */}
              <div className="relative bg-white rounded-2xl shadow-xl p-8 transform -rotate-2">
                {/* QR Code mock */}
                <div className="aspect-square bg-gray-100 rounded-xl mb-6 flex items-center justify-center">
                  <div className="grid grid-cols-5 grid-rows-5 gap-1 w-32 h-32">
                    {/* Simplified QR code pattern */}
                    {Array.from({ length: 25 }, (_, i) => i).map((k) => (
                      <div
                        key={k}
                        className={`rounded-sm ${
                          [0, 1, 2, 4, 5, 6, 10, 12, 14, 18, 20, 22, 23, 24].includes(k)
                            ? 'bg-gray-800'
                            : 'bg-white'
                        }`}
                      />
                    ))}
                  </div>
                </div>

                {/* Text */}
                <div className="text-center">
                  <p className="font-semibold text-gray-900 mb-1">
                    Scannez pour donner votre avis
                  </p>
                  <p className="text-sm text-gray-500">
                    Cabinet Dr. Martin
                  </p>
                </div>
              </div>

              {/* Phone mock */}
              <div className="absolute -bottom-4 -right-4 w-32 h-56 bg-gray-900 rounded-3xl p-2 transform rotate-12 shadow-2xl">
                <div className="w-full h-full bg-white rounded-2xl flex items-center justify-center">
                  <Smartphone className="h-8 w-8 text-gray-300" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
