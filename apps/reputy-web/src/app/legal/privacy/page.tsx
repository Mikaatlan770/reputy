import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'

export default function PrivacyPage() {
  return (
    <>
      <Header />
      
      <main className="pt-32 pb-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">
            Politique de confidentialité
          </h1>
          
          <div className="prose prose-gray max-w-none">
            <p className="text-gray-600 mb-6">
              Dernière mise à jour : Janvier 2026
            </p>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">1. Introduction</h2>
              <p className="text-gray-600 mb-4">
                Reputy SAS ("nous", "notre", "nos") s'engage à protéger la vie privée des utilisateurs de notre plateforme. 
                Cette politique de confidentialité explique comment nous collectons, utilisons, stockons et protégeons vos données personnelles.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">2. Données collectées</h2>
              <p className="text-gray-600 mb-4">Nous collectons les données suivantes :</p>
              <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
                <li>Informations d'identification : nom, email, téléphone professionnel</li>
                <li>Informations de l'établissement : nom, adresse, spécialité</li>
                <li>Données d'utilisation : logs de connexion, actions dans l'application</li>
                <li>Données des patients : nom, coordonnées, avis (avec leur consentement explicite)</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">3. Utilisation des données</h2>
              <p className="text-gray-600 mb-4">Vos données sont utilisées pour :</p>
              <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
                <li>Fournir et améliorer nos services</li>
                <li>Envoyer des demandes d'avis aux patients (avec leur consentement)</li>
                <li>Générer des statistiques et rapports anonymisés</li>
                <li>Communiquer avec vous concernant votre compte</li>
                <li>Respecter nos obligations légales</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">4. Base légale</h2>
              <p className="text-gray-600 mb-4">
                Nous traitons vos données sur les bases légales suivantes :
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
                <li>Exécution du contrat de service</li>
                <li>Consentement explicite (pour les communications marketing)</li>
                <li>Intérêt légitime (amélioration des services)</li>
                <li>Obligation légale (conservation des données fiscales)</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">5. Partage des données</h2>
              <p className="text-gray-600 mb-4">
                Nous ne vendons jamais vos données. Nous pouvons les partager avec :
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
                <li>Nos sous-traitants techniques (hébergement, envoi SMS/email)</li>
                <li>Les autorités si la loi l'exige</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">6. Hébergement et sécurité</h2>
              <p className="text-gray-600 mb-4">
                Vos données sont hébergées en France chez des prestataires certifiés. Nous utilisons :
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
                <li>Chiffrement TLS pour les communications</li>
                <li>Chiffrement AES-256 pour les données au repos</li>
                <li>Authentification forte et journalisation des accès</li>
                <li>Sauvegardes régulières et plan de reprise d'activité</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">7. Conservation des données</h2>
              <p className="text-gray-600 mb-4">
                Nous conservons vos données pendant la durée de votre abonnement, puis 3 ans après la fin du contrat 
                (sauf obligation légale de conservation plus longue). Les données des patients sont conservées 
                conformément aux exigences du secteur médical.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">8. Vos droits</h2>
              <p className="text-gray-600 mb-4">
                Conformément au RGPD, vous disposez des droits suivants :
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
                <li>Droit d'accès à vos données</li>
                <li>Droit de rectification</li>
                <li>Droit à l'effacement ("droit à l'oubli")</li>
                <li>Droit à la portabilité</li>
                <li>Droit d'opposition au traitement</li>
                <li>Droit de retirer votre consentement</li>
              </ul>
              <p className="text-gray-600">
                Pour exercer ces droits, contactez-nous à : <strong>privacy@reputy.fr</strong>
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">9. Cookies</h2>
              <p className="text-gray-600 mb-4">
                Nous utilisons des cookies essentiels au fonctionnement du service et des cookies d'analyse 
                (avec votre consentement). Vous pouvez gérer vos préférences via notre bandeau cookies.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">10. Contact</h2>
              <p className="text-gray-600 mb-4">
                Pour toute question concernant cette politique :
              </p>
              <ul className="list-none text-gray-600 space-y-1">
                <li><strong>Email :</strong> privacy@reputy.fr</li>
                <li><strong>DPO :</strong> dpo@reputy.fr</li>
                <li><strong>Adresse :</strong> Reputy SAS, [Adresse à compléter]</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">11. Modifications</h2>
              <p className="text-gray-600 mb-4">
                Nous pouvons modifier cette politique. Toute modification substantielle sera notifiée par email 
                ou via l'application. L'utilisation continue du service après notification vaut acceptation.
              </p>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </>
  )
}
