import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'

export default function TermsPage() {
  return (
    <>
      <Header />
      
      <main className="pt-32 pb-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">
            Conditions Générales d'Utilisation
          </h1>
          
          <div className="prose prose-gray max-w-none">
            <p className="text-gray-600 mb-6">
              Dernière mise à jour : Janvier 2026
            </p>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">1. Objet</h2>
              <p className="text-gray-600 mb-4">
                Les présentes Conditions Générales d'Utilisation (CGU) définissent les modalités d'accès et 
                d'utilisation de la plateforme Reputy, éditée par Reputy SAS.
              </p>
              <p className="text-gray-600 mb-4">
                Reputy est une solution SaaS de gestion de la réputation en ligne permettant aux professionnels 
                de collecter, gérer et diffuser les avis de leurs clients.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">2. Acceptation</h2>
              <p className="text-gray-600 mb-4">
                L'utilisation de Reputy implique l'acceptation pleine et entière des présentes CGU. 
                Si vous n'acceptez pas ces conditions, vous ne devez pas utiliser le service.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">3. Inscription</h2>
              <p className="text-gray-600 mb-4">
                Pour utiliser Reputy, vous devez :
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
                <li>Être majeur et avoir la capacité juridique</li>
                <li>Fournir des informations exactes et complètes</li>
                <li>Maintenir ces informations à jour</li>
                <li>Sécuriser vos identifiants de connexion</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">4. Services</h2>
              <p className="text-gray-600 mb-4">
                Reputy propose les services suivants (selon votre plan) :
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
                <li>Collecte d'avis par SMS et email</li>
                <li>Extension Chrome pour Doctolib</li>
                <li>Tableau de bord de gestion des avis</li>
                <li>Assistant IA pour la génération de réponses</li>
                <li>Widget d'affichage sur site web</li>
                <li>Statistiques et rapports</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">5. Engagements de l'utilisateur</h2>
              <p className="text-gray-600 mb-4">
                En utilisant Reputy, vous vous engagez à :
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
                <li>Respecter la législation en vigueur (RGPD, droit de la consommation)</li>
                <li>Obtenir le consentement des patients avant l'envoi de demandes d'avis</li>
                <li>Ne pas utiliser le service à des fins frauduleuses ou illicites</li>
                <li>Ne pas tenter de manipuler ou falsifier les avis</li>
                <li>Respecter la déontologie de votre profession</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">6. Propriété intellectuelle</h2>
              <p className="text-gray-600 mb-4">
                La plateforme Reputy, son interface, ses algorithmes, sa documentation et tous les éléments 
                qui la composent sont la propriété exclusive de Reputy SAS et sont protégés par les lois 
                relatives à la propriété intellectuelle.
              </p>
              <p className="text-gray-600 mb-4">
                Vous conservez la propriété des données que vous saisissez dans la plateforme.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">7. Tarifs et paiement</h2>
              <p className="text-gray-600 mb-4">
                Les tarifs en vigueur sont affichés sur notre site. Ils sont exprimés en euros HT.
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
                <li>Facturation mensuelle ou annuelle selon votre choix</li>
                <li>Paiement par carte bancaire ou prélèvement SEPA</li>
                <li>Essai gratuit de 14 jours sans engagement</li>
                <li>Résiliation possible à tout moment</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">8. Disponibilité du service</h2>
              <p className="text-gray-600 mb-4">
                Reputy s'engage à maintenir le service disponible 99,5% du temps (hors maintenance planifiée). 
                En cas d'interruption prolongée, vous serez informé par email et pourrez bénéficier d'un 
                avoir au prorata.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">9. Limitation de responsabilité</h2>
              <p className="text-gray-600 mb-4">
                Reputy ne saurait être tenu responsable :
              </p>
              <ul className="list-disc list-inside text-gray-600 space-y-2 mb-4">
                <li>Des contenus publiés par les utilisateurs ou leurs clients</li>
                <li>Des dommages indirects (perte de clientèle, d'image, etc.)</li>
                <li>Des interruptions dues à des causes extérieures (force majeure)</li>
                <li>De l'utilisation non conforme du service</li>
              </ul>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">10. Résiliation</h2>
              <p className="text-gray-600 mb-4">
                Vous pouvez résilier votre abonnement à tout moment depuis votre espace client. 
                La résiliation prend effet à la fin de la période en cours.
              </p>
              <p className="text-gray-600 mb-4">
                Reputy peut suspendre ou résilier votre compte en cas de violation des CGU, 
                après notification et délai de régularisation.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">11. Données personnelles</h2>
              <p className="text-gray-600 mb-4">
                Le traitement de vos données personnelles est détaillé dans notre{' '}
                <a href="/legal/privacy" className="text-primary-600 hover:underline">
                  Politique de confidentialité
                </a>.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">12. Modifications des CGU</h2>
              <p className="text-gray-600 mb-4">
                Reputy se réserve le droit de modifier les présentes CGU. Toute modification 
                sera notifiée 30 jours avant son entrée en vigueur. L'utilisation continue 
                du service vaut acceptation des nouvelles conditions.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">13. Droit applicable et juridiction</h2>
              <p className="text-gray-600 mb-4">
                Les présentes CGU sont régies par le droit français. En cas de litige, les parties 
                s'engagent à rechercher une solution amiable. À défaut, les tribunaux de Paris 
                seront seuls compétents.
              </p>
            </section>

            <section className="mb-8">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">14. Contact</h2>
              <p className="text-gray-600 mb-4">
                Pour toute question concernant ces CGU :
              </p>
              <ul className="list-none text-gray-600 space-y-1">
                <li><strong>Email :</strong> contact@reputy.fr</li>
                <li><strong>Adresse :</strong> Reputy SAS, [Adresse à compléter]</li>
                <li><strong>SIRET :</strong> [À compléter]</li>
              </ul>
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </>
  )
}
