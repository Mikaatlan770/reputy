/**
 * Données FAQ pour le centre d'aide Reputy
 */

export interface FaqItem {
  question: string
  answer: string
}

export interface FaqSection {
  id: string
  title: string
  icon: string
  items: FaqItem[]
}

export const FAQ_SECTIONS: FaqSection[] = [
  {
    id: 'getting-started',
    title: 'Premiers pas',
    icon: 'rocket',
    items: [
      {
        question: 'Comment créer mon compte Reputy ?',
        answer: 'Pour créer votre compte, cliquez sur "S\'inscrire" sur notre page d\'accueil. Renseignez votre email, choisissez un mot de passe et complétez les informations de votre établissement. Vous recevrez un email de confirmation pour activer votre compte.',
      },
      {
        question: 'Comment ajouter mon établissement ?',
        answer: 'Une fois connecté, accédez à "Établissements" dans le menu latéral, puis cliquez sur "Ajouter un établissement". Renseignez le nom, l\'adresse et les informations de votre fiche Google Business Profile.',
      },
      {
        question: 'Comment connecter ma fiche Google Business ?',
        answer: 'Dans les paramètres de votre établissement, cliquez sur "Connecter Google Business". Vous serez redirigé vers Google pour autoriser Reputy à accéder à vos avis. Cette connexion permet de synchroniser automatiquement vos avis.',
      },
      {
        question: 'Puis-je utiliser Reputy sur plusieurs établissements ?',
        answer: 'Oui ! Selon votre plan, vous pouvez gérer plusieurs établissements depuis un seul compte. Le plan Starter permet 1 établissement, le plan Pro jusqu\'à 3, et le plan Enterprise offre un nombre illimité d\'établissements.',
      },
    ],
  },
  {
    id: 'google-reviews',
    title: 'Avis Google',
    icon: 'star',
    items: [
      {
        question: 'Comment les avis Google sont-ils synchronisés ?',
        answer: 'Une fois votre fiche Google Business connectée, Reputy synchronise automatiquement vos nouveaux avis toutes les heures. Vous pouvez aussi forcer une synchronisation manuelle depuis le dashboard.',
      },
      {
        question: 'Comment répondre aux avis depuis Reputy ?',
        answer: 'Accédez à la page "Avis", cliquez sur l\'avis auquel vous souhaitez répondre, rédigez votre réponse (ou utilisez l\'assistant IA), puis cliquez sur "Publier". La réponse sera automatiquement postée sur Google.',
      },
      {
        question: 'Puis-je modifier une réponse déjà publiée ?',
        answer: 'Oui, vous pouvez modifier ou supprimer vos réponses directement depuis Reputy. Les modifications seront répercutées sur Google Business Profile.',
      },
      {
        question: 'Comment fonctionne le "Mode Santé" pour les réponses ?',
        answer: 'Le Mode Santé est spécialement conçu pour les professionnels de santé. Lorsqu\'il est activé, les suggestions de réponse IA et les templates évitent automatiquement toute mention de diagnostic, traitement ou informations médicales, conformément aux règles déontologiques.',
      },
    ],
  },
  {
    id: 'sms-email',
    title: 'SMS & Emails',
    icon: 'message-square',
    items: [
      {
        question: 'Comment envoyer des demandes d\'avis par SMS ?',
        answer: 'Vous pouvez envoyer des SMS depuis l\'extension Chrome Doctolib (pour les professionnels de santé), ou via des campagnes depuis l\'admin. Chaque SMS contient un lien court vers votre page de collecte.',
      },
      {
        question: 'Pourquoi mes SMS sont-ils limités à 160 caractères ?',
        answer: 'Nous limitons les SMS à 160 caractères (1 segment GSM-7) pour garantir un coût maîtrisé. Un SMS qui dépasse 160 caractères coûterait 2 à 3 fois plus cher. Notre message optimisé garantit 1 SMS = 1 crédit.',
      },
      {
        question: 'Comment acheter des crédits SMS supplémentaires ?',
        answer: 'Accédez à la page "Facturation", puis cliquez sur "Acheter des crédits". Choisissez le pack SMS souhaité et procédez au paiement. Les crédits sont immédiatement ajoutés à votre quota.',
      },
      {
        question: 'Les emails sont-ils personnalisables ?',
        answer: 'Oui ! Vous pouvez personnaliser le contenu de vos emails dans "Collecte > Email". Utilisez les variables {prenom}, {etablissement} et {lien} pour personnaliser automatiquement chaque message.',
      },
    ],
  },
  {
    id: 'ai-credits',
    title: 'IA & Crédits',
    icon: 'sparkles',
    items: [
      {
        question: 'Comment fonctionne l\'assistant IA ?',
        answer: 'L\'assistant IA génère des suggestions de réponse adaptées à chaque avis. Cliquez sur "Suggérer une réponse (IA)" dans le drawer de réponse, choisissez le ton souhaité, et obtenez 3 suggestions en quelques secondes.',
      },
      {
        question: 'Combien de crédits IA sont inclus dans mon plan ?',
        answer: 'Le plan Pro inclut 100 suggestions IA par mois. Le plan Enterprise offre un usage illimité. Le plan Starter ne comprend pas l\'assistant IA, mais vous pouvez acheter des packs de crédits.',
      },
      {
        question: 'Les suggestions IA sont-elles publiées automatiquement ?',
        answer: 'Non, jamais. L\'IA génère uniquement des suggestions que vous devez relire, modifier si nécessaire, et valider avant publication. Vous gardez toujours le contrôle total sur vos réponses.',
      },
      {
        question: 'Comment l\'IA s\'adapte-t-elle au Mode Santé ?',
        answer: 'En Mode Santé, l\'IA applique automatiquement des garde-fous : aucune mention de patient, diagnostic ou soin n\'est générée. Les réponses suggèrent plutôt un contact privé pour discuter de la situation.',
      },
    ],
  },
  {
    id: 'billing',
    title: 'Facturation',
    icon: 'credit-card',
    items: [
      {
        question: 'Comment fonctionne la facturation ?',
        answer: 'Votre abonnement est facturé mensuellement à date anniversaire. Vous recevez une facture PDF par email et pouvez la télécharger depuis l\'espace "Facturation" de votre compte.',
      },
      {
        question: 'Puis-je changer de plan à tout moment ?',
        answer: 'Oui ! Vous pouvez upgrader ou downgrader votre plan à tout moment. Le changement prend effet immédiatement, et le montant est calculé au prorata pour le mois en cours.',
      },
      {
        question: 'Comment annuler mon abonnement ?',
        answer: 'Accédez à "Facturation", puis cliquez sur "Portail Stripe" ou contactez notre support. L\'annulation prend effet à la fin de la période en cours, et vous conservez l\'accès jusqu\'à cette date.',
      },
      {
        question: 'Quels moyens de paiement acceptez-vous ?',
        answer: 'Nous acceptons les cartes bancaires (Visa, Mastercard, American Express) et les prélèvements SEPA pour les entreprises. Les paiements sont sécurisés par Stripe.',
      },
      {
        question: 'Puis-je obtenir une facture avec TVA ?',
        answer: 'Oui, toutes nos factures incluent la TVA française (20%). Renseignez votre numéro de TVA intracommunautaire dans "Paramètres > Facturation" pour l\'autoliquidation si applicable.',
      },
    ],
  },
]

export function getFaqSection(sectionId: string): FaqSection | undefined {
  return FAQ_SECTIONS.find(s => s.id === sectionId)
}





