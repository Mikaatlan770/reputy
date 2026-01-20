import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'

export default function FAQPage() {
  return (
    <>
      <Header />
      
      <main className="pt-32 pb-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">
            Foire Aux Questions
          </h1>
          
          <div className="space-y-8">
            {/* Section Crédits */}
            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-6 pb-2 border-b border-gray-200">
                💳 Crédits SMS & Emails
              </h2>
              
              <div className="space-y-6">
                <div className="bg-white rounded-lg border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-900 mb-2">
                    Quand mes crédits expirent-ils ?
                  </h3>
                  <p className="text-gray-600">
                    Tous vos crédits (inclus dans votre plan, offerts par nos équipes, ou achetés en pack) 
                    expirent à la <strong>fin de votre période de facturation mensuelle</strong>. 
                    Aucun crédit non utilisé n'est reporté au mois suivant.
                  </p>
                </div>

                <div className="bg-white rounded-lg border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-900 mb-2">
                    Puis-je reporter mes crédits non utilisés ?
                  </h3>
                  <p className="text-gray-600">
                    <strong>Non.</strong> Pour des raisons de gestion et d'équité, les crédits SMS et Emails 
                    ne sont pas cumulables d'une période à l'autre. Nous vous encourageons à utiliser vos 
                    crédits avant la fin de chaque période.
                  </p>
                </div>

                <div className="bg-white rounded-lg border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-900 mb-2">
                    J'achète un pack en cours de mois, quand expire-t-il ?
                  </h3>
                  <p className="text-gray-600">
                    Un pack acheté (ou des crédits offerts) en cours de période expire à la 
                    <strong> fin de cette même période</strong>. Si vous achetez un pack le 15 du mois et 
                    que votre renouvellement est le 1er, vos crédits expirent le dernier jour du mois en cours.
                  </p>
                </div>

                <div className="bg-white rounded-lg border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-900 mb-2">
                    Je m'inscris en cours de mois, ai-je tous mes crédits ?
                  </h3>
                  <p className="text-gray-600">
                    Pour le premier mois, vos crédits inclus sont <strong>calculés au prorata</strong> des 
                    jours restants jusqu'à la fin du mois. Exemple : si vous vous inscrivez le 15 et avez 
                    un plan avec 100 SMS/mois, vous recevez environ 50 SMS pour ce premier mois partiel.
                  </p>
                </div>

                <div className="bg-white rounded-lg border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-900 mb-2">
                    Comment voir mes crédits restants ?
                  </h3>
                  <p className="text-gray-600">
                    Connectez-vous à votre tableau de bord Reputy. La page d'accueil affiche clairement 
                    vos crédits utilisés et restants pour la période en cours, ainsi que la date d'expiration.
                  </p>
                </div>

                <div className="bg-white rounded-lg border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-900 mb-2">
                    Que se passe-t-il si j'épuise tous mes crédits ?
                  </h3>
                  <p className="text-gray-600">
                    Si vous épuisez vos crédits avant la fin de la période, les envois de SMS/Emails 
                    seront refusés. Vous pouvez alors acheter un pack supplémentaire ou attendre le 
                    renouvellement de votre période pour récupérer vos crédits inclus.
                  </p>
                </div>
              </div>
            </section>

            {/* Section Facturation */}
            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-6 pb-2 border-b border-gray-200">
                💰 Facturation
              </h2>
              
              <div className="space-y-6">
                <div className="bg-white rounded-lg border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-900 mb-2">
                    Quand suis-je facturé ?
                  </h3>
                  <p className="text-gray-600">
                    La facturation est mensuelle, au premier jour de chaque mois calendaire. 
                    Si vous vous inscrivez en cours de mois, la première facture sera calculée au 
                    prorata des jours restants.
                  </p>
                </div>

                <div className="bg-white rounded-lg border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-900 mb-2">
                    Puis-je changer de plan en cours de période ?
                  </h3>
                  <p className="text-gray-600">
                    Oui. Si vous upgradez votre plan, la différence est facturée au prorata des jours 
                    restants et vos quotas sont ajustés immédiatement. Si vous downgradez, le changement 
                    prend effet à la prochaine période.
                  </p>
                </div>
              </div>
            </section>

            {/* Section Extension */}
            <section>
              <h2 className="text-2xl font-semibold text-gray-900 mb-6 pb-2 border-b border-gray-200">
                🔌 Extension Chrome
              </h2>
              
              <div className="space-y-6">
                <div className="bg-white rounded-lg border border-gray-200 p-5">
                  <h3 className="font-semibold text-gray-900 mb-2">
                    Comment configurer l'extension ?
                  </h3>
                  <p className="text-gray-600">
                    Installez l'extension depuis le Chrome Web Store, puis ouvrez les options de l'extension. 
                    Renseignez votre clé publique (disponible dans votre espace Reputy, section Intégration) 
                    et sauvegardez.
                  </p>
                </div>
              </div>
            </section>

            {/* Contact */}
            <section className="bg-gray-50 rounded-lg p-6 mt-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">
                Une autre question ?
              </h2>
              <p className="text-gray-600 mb-4">
                Notre équipe support est à votre disposition pour répondre à toutes vos questions.
              </p>
              <ul className="text-gray-600 space-y-1">
                <li><strong>Email :</strong> support@reputy.fr</li>
                <li><strong>Horaires :</strong> Lun-Ven, 9h-18h</li>
              </ul>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </>
  )
}
