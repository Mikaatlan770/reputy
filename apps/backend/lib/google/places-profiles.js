/**
 * Google Places API (New) — Specialty → Place Type/Keyword mapping
 *
 * Maps our internal specialty codes to Google Places API types and keywords
 * for fine-grained Nearby Search queries.
 *
 * Reference: https://developers.google.com/maps/documentation/places/web-service/place-types
 *
 * Strategy:
 * - `includedTypes` uses official Google Place types
 * - `textQuery` adds a keyword for more precise results (used with Text Search)
 * - `textQueryVariants` enables searching for related establishment types
 *   (e.g. "dentiste" also searches "centre dentaire" and vice-versa)
 * - `maxRadius` is a sensible default per specialty (overridable)
 */

// ============================================================
// Health Specialties
// ============================================================

const HEALTH_PROFILES = {
  // ── Médecine générale ──
  generaliste: {
    includedTypes: ['doctor'],
    textQuery: 'médecin généraliste',
    textQueryVariants: ['cabinet médical', 'maison de santé', 'centre médical'],
    maxRadius: 5000,
  },

  // ── Dentaire ──
  dentiste: {
    includedTypes: ['dentist'],
    textQuery: 'dentiste',
    textQueryVariants: ['centre dentaire', 'cabinet dentaire', 'chirurgien-dentiste', 'centre medico dentaire'],
    maxRadius: 5000,
  },
  centre_dentaire: {
    includedTypes: ['dentist', 'doctor'],
    textQuery: 'centre dentaire',
    textQueryVariants: [
      'centre medico dentaire',
      'centre médical',
      'dentiste',
      'chirurgien-dentiste',
      'orthodontiste',
      'implantologue',
    ],
    maxRadius: 5000,
  },
  centre_medico_dentaire: {
    includedTypes: ['dentist', 'doctor'],
    textQuery: 'centre medico dentaire',
    textQueryVariants: [
      'ophtalmologue',
      'centre ophtalmologique',
      'dentiste',
      'chirurgien-dentiste',
      'orthodontiste',
      'implantologue',
      'centre dentaire',
      'centre médical',
    ],
    maxRadius: 5000,
  },
  orthodontiste: {
    includedTypes: ['dentist'],
    textQuery: 'orthodontiste',
    textQueryVariants: ['centre dentaire', 'dentiste'],
    maxRadius: 5000,
  },

  // ── Ophtalmologie ──
  ophtalmologue: {
    includedTypes: ['doctor'],
    textQuery: 'ophtalmologue',
    textQueryVariants: ['centre ophtalmologique', "centre d'ophtalmologie"],
    maxRadius: 5000,
  },
  centre_ophtalmologique: {
    includedTypes: ['doctor'],
    textQuery: 'centre ophtalmologique',
    textQueryVariants: [
      'ophtalmologue',
      'centre médical',
      'centre medico dentaire',
    ],
    maxRadius: 5000,
  },

  // ── Centre médical (multi-spécialités — même logique que centre médico-dentaire) ──
  centre_medical: {
    includedTypes: ['dentist', 'doctor'],
    textQuery: 'centre médical',
    textQueryVariants: [
      'ophtalmologue',
      'centre ophtalmologique',
      'dentiste',
      'chirurgien-dentiste',
      'orthodontiste',
      'implantologue',
      'centre dentaire',
      'centre medico dentaire',
      'maison de santé',
    ],
    maxRadius: 5000,
  },

  // ── Dermatologie ──
  dermatologue: {
    includedTypes: ['doctor'],
    textQuery: 'dermatologue',
    textQueryVariants: ['centre dermatologique', 'cabinet dermatologie'],
    maxRadius: 5000,
  },

  // ── Kinésithérapie / Rééducation ──
  kinesitherapeute: {
    includedTypes: ['physiotherapist'],
    textQuery: 'kinésithérapeute',
    textQueryVariants: ['cabinet de kinésithérapie', 'centre de rééducation'],
    maxRadius: 5000,
  },

  // ── Pharmacie ──
  pharmacien: {
    includedTypes: ['pharmacy'],
    textQuery: 'pharmacie',
    textQueryVariants: [],
    maxRadius: 2000,
  },

  // ── Cardiologie ──
  cardiologue: {
    includedTypes: ['doctor'],
    textQuery: 'cardiologue',
    textQueryVariants: ['centre cardiologique', 'cabinet cardiologie'],
    maxRadius: 5000,
  },

  // ── Pédiatrie ──
  pediatre: {
    includedTypes: ['doctor'],
    textQuery: 'pédiatre',
    textQueryVariants: ['cabinet de pédiatrie', 'médecin pédiatre'],
    maxRadius: 5000,
  },

  // ── Gynécologie ──
  gynecologue: {
    includedTypes: ['doctor'],
    textQuery: 'gynécologue',
    textQueryVariants: ['cabinet de gynécologie', 'sage-femme'],
    maxRadius: 5000,
  },

  // ── Ostéopathie ──
  osteopathe: {
    includedTypes: ['physiotherapist'],
    textQuery: 'ostéopathe',
    textQueryVariants: ['cabinet ostéopathie'],
    maxRadius: 5000,
  },

  // ── ORL ──
  orl: {
    includedTypes: ['doctor'],
    textQuery: 'ORL oto-rhino-laryngologue',
    textQueryVariants: ['centre ORL', 'oto-rhino-laryngologiste'],
    maxRadius: 5000,
  },

  // ── Radiologie ──
  radiologue: {
    includedTypes: ['doctor'],
    textQuery: 'radiologue',
    textQueryVariants: ['centre de radiologie', 'centre imagerie médicale', 'cabinet radiologie'],
    maxRadius: 5000,
  },

  // ── Allergologie ──
  allergologue: {
    includedTypes: ['doctor'],
    textQuery: 'allergologue',
    textQueryVariants: ['cabinet allergologie'],
    maxRadius: 5000,
  },

  // ── Rhumatologie ──
  rhumatologue: {
    includedTypes: ['doctor'],
    textQuery: 'rhumatologue',
    textQueryVariants: ['cabinet rhumatologie'],
    maxRadius: 5000,
  },

  // ── Neurologie ──
  neurologue: {
    includedTypes: ['doctor'],
    textQuery: 'neurologue',
    textQueryVariants: ['centre neurologie', 'cabinet neurologie'],
    maxRadius: 5000,
  },

  // ── Urologie ──
  urologue: {
    includedTypes: ['doctor'],
    textQuery: 'urologue',
    textQueryVariants: ['cabinet urologie'],
    maxRadius: 5000,
  },

  // ── Gastro-entérologie ──
  gastro_enterologue: {
    includedTypes: ['doctor'],
    textQuery: 'gastro-entérologue',
    textQueryVariants: ['centre gastro-entérologie', 'cabinet gastro'],
    maxRadius: 5000,
  },

  // ── Pneumologie ──
  pneumologue: {
    includedTypes: ['doctor'],
    textQuery: 'pneumologue',
    textQueryVariants: ['cabinet pneumologie'],
    maxRadius: 5000,
  },

  // ── Endocrinologie ──
  endocrinologue: {
    includedTypes: ['doctor'],
    textQuery: 'endocrinologue',
    textQueryVariants: ['centre endocrinologie', 'diabétologue'],
    maxRadius: 5000,
  },

  // ── Psychiatrie ──
  psychiatre: {
    includedTypes: ['doctor'],
    textQuery: 'psychiatre',
    textQueryVariants: ['cabinet psychiatrie', 'centre psychiatrique'],
    maxRadius: 5000,
  },

  // ── Psychologie ──
  psychologue: {
    includedTypes: ['doctor'],
    textQuery: 'psychologue',
    textQueryVariants: ['cabinet psychologie', 'psychothérapeute'],
    maxRadius: 5000,
  },

  // ── Médecine esthétique ──
  medecin_esthetique: {
    includedTypes: ['doctor'],
    textQuery: 'médecin esthétique',
    textQueryVariants: ['médecine esthétique', 'centre esthétique médical', 'cabinet esthétique'],
    maxRadius: 5000,
  },

  // ── Médecin nutritionniste ──
  medecin_nutritionniste: {
    includedTypes: ['doctor'],
    textQuery: 'médecin nutritionniste',
    textQueryVariants: ['nutritionniste', 'diététicien', 'cabinet nutrition'],
    maxRadius: 5000,
  },

  // ── Médecin du travail ──
  medecin_du_travail: {
    includedTypes: ['doctor'],
    textQuery: 'médecin du travail',
    textQueryVariants: ['service de santé au travail', 'médecine du travail'],
    maxRadius: 5000,
  },

  // ── Gériatrie ──
  geriarte: {
    includedTypes: ['doctor'],
    textQuery: 'gériatre',
    textQueryVariants: ['cabinet gériatrie', 'médecin gériatre'],
    maxRadius: 5000,
  },

  // ── Médecin vasculaire ──
  medecin_vasculaire: {
    includedTypes: ['doctor'],
    textQuery: 'angiologue médecin vasculaire',
    textQueryVariants: ['angiologue', 'cabinet angiologie', 'phlébologue'],
    maxRadius: 5000,
  },

  // ── Chirurgie générale ──
  chirurgien: {
    includedTypes: ['doctor', 'hospital'],
    textQuery: 'chirurgien',
    textQueryVariants: ['clinique chirurgicale', 'centre chirurgical'],
    maxRadius: 5000,
  },

  // ── Chirurgie esthétique ──
  chirurgien_esthetique: {
    includedTypes: ['doctor', 'hospital'],
    textQuery: 'chirurgien esthétique plasticien',
    textQueryVariants: ['chirurgie plastique', 'clinique esthétique', 'chirurgien plasticien'],
    maxRadius: 10000,
  },

  // ── Chirurgie orthopédique ──
  chirurgien_orthopedique: {
    includedTypes: ['doctor', 'hospital'],
    textQuery: 'chirurgien orthopédique',
    textQueryVariants: ['chirurgie orthopédique', 'traumatologue', 'clinique orthopédique'],
    maxRadius: 10000,
  },

  // ── Chirurgie cardiaque ──
  chirurgien_cardiaque: {
    includedTypes: ['doctor', 'hospital'],
    textQuery: 'chirurgien cardiaque',
    textQueryVariants: ['chirurgie cardiaque', 'chirurgien cardio-vasculaire'],
    maxRadius: 10000,
  },

  // ── Chirurgie digestive / viscérale ──
  chirurgien_digestif: {
    includedTypes: ['doctor', 'hospital'],
    textQuery: 'chirurgien digestif viscéral',
    textQueryVariants: ['chirurgie viscérale', 'chirurgien abdominal', 'chirurgie digestive'],
    maxRadius: 10000,
  },

  // ── Chirurgie vasculaire ──
  chirurgien_vasculaire: {
    includedTypes: ['doctor', 'hospital'],
    textQuery: 'chirurgien vasculaire',
    textQueryVariants: ['chirurgie vasculaire', 'chirurgien cardio-vasculaire'],
    maxRadius: 10000,
  },

  // ── Neurochirurgie ──
  neurochirurgien: {
    includedTypes: ['doctor', 'hospital'],
    textQuery: 'neurochirurgien',
    textQueryVariants: ['neurochirurgie', 'chirurgie du rachis'],
    maxRadius: 10000,
  },

  // ── Chirurgie maxillo-faciale ──
  chirurgien_maxillo_facial: {
    includedTypes: ['doctor', 'hospital'],
    textQuery: 'chirurgien maxillo-facial',
    textQueryVariants: ['chirurgie maxillo-faciale', 'stomatologie'],
    maxRadius: 10000,
  },

  // ── Chirurgie urologique ──
  chirurgien_urologue: {
    includedTypes: ['doctor', 'hospital'],
    textQuery: 'chirurgien urologue',
    textQueryVariants: ['chirurgie urologique', 'urologue chirurgien'],
    maxRadius: 10000,
  },

  // ── Anesthésie ──
  anesthesiste: {
    includedTypes: ['doctor'],
    textQuery: 'anesthésiste',
    textQueryVariants: ['anesthésiste-réanimateur'],
    maxRadius: 5000,
  },

  // ── Sage-femme ──
  sage_femme: {
    includedTypes: ['doctor'],
    textQuery: 'sage-femme',
    textQueryVariants: ['cabinet sage-femme', 'maternité'],
    maxRadius: 5000,
  },

  // ── Infirmier(e) ──
  infirmier: {
    includedTypes: ['doctor'],
    textQuery: 'infirmier',
    textQueryVariants: ['cabinet infirmier', 'soins infirmiers'],
    maxRadius: 3000,
  },

  // ── Podologie ──
  podologue: {
    includedTypes: ['doctor'],
    textQuery: 'podologue',
    textQueryVariants: ['pédicure-podologue', 'cabinet podologie'],
    maxRadius: 5000,
  },

  // ── Orthophonie ──
  orthophoniste: {
    includedTypes: ['doctor'],
    textQuery: 'orthophoniste',
    textQueryVariants: ['cabinet orthophonie'],
    maxRadius: 5000,
  },

  // ── Diététique ──
  dieteticien: {
    includedTypes: ['doctor'],
    textQuery: 'diététicien',
    textQueryVariants: ['nutritionniste', 'cabinet diététique'],
    maxRadius: 5000,
  },

  // ── Chiropractie ──
  chiropracteur: {
    includedTypes: ['physiotherapist'],
    textQuery: 'chiropracteur',
    textQueryVariants: ['cabinet chiropractie', 'chiropraticien'],
    maxRadius: 5000,
  },

  // ── Orthoptie ──
  orthoptiste: {
    includedTypes: ['doctor'],
    textQuery: 'orthoptiste',
    textQueryVariants: ['cabinet orthoptie', 'bilan orthoptique'],
    maxRadius: 5000,
  },

  // ── Ergothérapie ──
  ergotherapeute: {
    includedTypes: ['doctor'],
    textQuery: 'ergothérapeute',
    textQueryVariants: ['cabinet ergothérapie', 'centre de rééducation'],
    maxRadius: 5000,
  },

  // ── Psychomotricité ──
  psychomotricien: {
    includedTypes: ['doctor'],
    textQuery: 'psychomotricien',
    textQueryVariants: ['cabinet psychomotricité'],
    maxRadius: 5000,
  },

  // ── Médecin du sport ──
  medecin_du_sport: {
    includedTypes: ['doctor'],
    textQuery: 'médecin du sport',
    textQueryVariants: ['centre médecine du sport'],
    maxRadius: 5000,
  },

  // ── Stomatologie ──
  stomatologue: {
    includedTypes: ['dentist', 'doctor'],
    textQuery: 'stomatologue',
    textQueryVariants: ['chirurgien maxillo-facial'],
    maxRadius: 5000,
  },

  // ── Médecines complémentaires ──
  acupuncteur: {
    includedTypes: ['doctor'],
    textQuery: 'acupuncteur',
    textQueryVariants: ['cabinet acupuncture', 'médecine chinoise'],
    maxRadius: 5000,
  },
  naturopathe: {
    includedTypes: ['doctor'],
    textQuery: 'naturopathe',
    textQueryVariants: ['cabinet naturopathie'],
    maxRadius: 5000,
  },
  sophrologue: {
    includedTypes: ['doctor'],
    textQuery: 'sophrologue',
    textQueryVariants: ['cabinet sophrologie'],
    maxRadius: 5000,
  },

  // ── Cliniques / Hôpitaux ──
  clinique: {
    includedTypes: ['hospital'],
    textQuery: 'clinique',
    textQueryVariants: ['hôpital', 'centre hospitalier', 'polyclinique'],
    maxRadius: 5000,
  },

  // ── Laboratoire d'analyses ──
  laboratoire: {
    includedTypes: ['doctor'],
    textQuery: 'laboratoire analyses médicales',
    textQueryVariants: ['labo analyses', 'laboratoire biologie médicale'],
    maxRadius: 3000,
  },

  // ── Vétérinaire ──
  veterinaire: {
    includedTypes: ['veterinary_care'],
    textQuery: 'vétérinaire',
    textQueryVariants: ['clinique vétérinaire', 'cabinet vétérinaire'],
    maxRadius: 5000,
  },
};

// ============================================================
// Commerce & Restaurant Profiles
// ============================================================

const COMMERCE_PROFILES = {
  _default: {
    includedTypes: ['store'],
    textQuery: 'commerce',
    textQueryVariants: [],
    maxRadius: 2000,
  },
};

const RESTAURANT_PROFILES = {
  _default: {
    includedTypes: ['restaurant'],
    textQuery: 'restaurant',
    textQueryVariants: [],
    maxRadius: 2000,
  },
};

// ============================================================
// Profile Resolver
// ============================================================

/**
 * Get the Places API search profile for an org
 * @param {string} vertical - 'health' | 'commerce' | 'restaurant'
 * @param {string|null} specialty - Health specialty code (e.g. 'dentiste')
 * @returns {{ includedTypes: string[], textQuery: string, textQueryVariants: string[], maxRadius: number, profileName: string }}
 */
function getSearchProfile(vertical, specialty) {
  if (vertical === 'health' && specialty && HEALTH_PROFILES[specialty]) {
    return { ...HEALTH_PROFILES[specialty], profileName: `health_${specialty}` };
  }

  if (vertical === 'commerce') {
    return { ...COMMERCE_PROFILES._default, profileName: 'commerce' };
  }

  if (vertical === 'restaurant') {
    return { ...RESTAURANT_PROFILES._default, profileName: 'restaurant' };
  }

  // Fallback: generic health search (sans pharmacy — pharmacy ne concurrence que pharmacy)
  return {
    includedTypes: ['doctor', 'dentist', 'hospital'],
    textQuery: 'professionnel de santé',
    textQueryVariants: [],
    maxRadius: 5000,
    profileName: 'health_default',
  };
}

/**
 * List of valid specialty keys (for whitelist validation)
 * @returns {string[]}
 */
function getValidSpecialties() {
  return Object.keys(HEALTH_PROFILES);
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  HEALTH_PROFILES,
  COMMERCE_PROFILES,
  RESTAURANT_PROFILES,
  getSearchProfile,
  getValidSpecialties,
};
