/**
 * P0.6 - SES Warm-up intelligent par organisation
 *
 * Gère un warm-up progressif par org (cold → warming → warm)
 * pour éviter les pics d'envoi SES lors de l'onboarding.
 *
 * Modèle par paliers (durée écoulée depuis startedAt) :
 * - Day 0–1 : daily=5,  hourly=3
 * - Day 2–3 : daily=20, hourly=8
 * - Day 4–6 : daily=50, hourly=20
 * - Day ≥7  : status=warm, aucune limite warm-up
 *
 * Stockage : org.options.emailWarmup (pas de table dédiée)
 * Transitions loggées via logger structuré (pas d'email_events).
 */

const logger = require('../logger');
const orgRepo = require('../repositories/org.repo');

// ============ CONFIG ============
const EMAIL_WARMUP_ENABLED = (process.env.EMAIL_WARMUP_ENABLED ?? 'true').toLowerCase() === 'true';

// Durée d'un "jour" en ms (24h réelles, pas calendaire)
const DAY_MS = 24 * 60 * 60 * 1000;

// Paliers warm-up — ajuster ici si besoin (pas de variable env)
const WARMUP_TIERS = [
  { maxDay: 2,  daily: 5,   hourly: 3  },  // Day 0–1
  { maxDay: 4,  daily: 20,  hourly: 8  },  // Day 2–3
  { maxDay: 7,  daily: 50,  hourly: 20 },  // Day 4–6
  // Day ≥7 → warm (pas de limites warm-up)
];

const WARMUP_FINAL_DAY = 7;

// ============================================================
// getWarmupState(org, now?)
// ============================================================

/**
 * Calcule l'état warm-up d'une org.
 *
 * @param {object} org - Org parsée (avec org.options)
 * @param {number} [now=Date.now()] - Timestamp courant (pour les tests)
 * @returns {{
 *   status: 'cold'|'warming'|'warm',
 *   day: number|null,
 *   startedAt: string|null,
 *   limits: { daily: number, hourly: number }|null
 * }}
 * - limits=null signifie pas de limite warm-up (utiliser les globales)
 */
function getWarmupState(org, now = Date.now()) {
  // Warm-up désactivé globalement → tout le monde est warm
  if (!EMAIL_WARMUP_ENABLED) {
    return { status: 'warm', day: null, startedAt: null, limits: null };
  }

  const warmup = org.options?.emailWarmup;

  // Absence de emailWarmup → cold (contrat : pas de COUNT(*) sur outbox)
  if (!warmup) {
    return {
      status: 'cold',
      day: 0,
      startedAt: null,
      limits: getLimitsForDay(0),
    };
  }

  // Déjà warm → pas de limite warm-up
  if (warmup.status === 'warm') {
    return { status: 'warm', day: null, startedAt: warmup.startedAt || null, limits: null };
  }

  // Cold sans startedAt → encore jamais envoyé
  if (warmup.status === 'cold' || !warmup.startedAt) {
    return {
      status: 'cold',
      day: 0,
      startedAt: null,
      limits: getLimitsForDay(0),
    };
  }

  // Warming → calculer le jour écoulé depuis startedAt
  const startedAtMs = new Date(warmup.startedAt).getTime();
  const elapsedMs = now - startedAtMs;
  const day = Math.max(0, Math.floor(elapsedMs / DAY_MS));

  // Seuil final atteint → promouvoir en warm
  if (day >= WARMUP_FINAL_DAY) {
    // Auto-transition warming → warm
    _persistWarmupState(org.id, { status: 'warm', startedAt: warmup.startedAt });
    logger.logInfo('WARMUP_TRANSITION', `Org ${org.id} auto-promoted: warming → warm (day ${day})`, {
      orgId: org.id, orgName: org.name, fromStatus: 'warming', toStatus: 'warm', day,
    });
    return { status: 'warm', day, startedAt: warmup.startedAt, limits: null };
  }

  return {
    status: 'warming',
    day,
    startedAt: warmup.startedAt,
    limits: getLimitsForDay(day),
  };
}

// ============================================================
// ensureWarmupInitialized(org)
// ============================================================

/**
 * Initialise l'état warm-up si absent (=> cold).
 * Ne fait PAS de query sur email_outbox.
 *
 * @param {object} org - Org parsée
 * @returns {object} org mise à jour (avec options.emailWarmup)
 */
function ensureWarmupInitialized(org) {
  if (!EMAIL_WARMUP_ENABLED) return org;
  if (org.options?.emailWarmup) return org; // Déjà initialisé

  _persistWarmupState(org.id, { status: 'cold' });

  // Mettre à jour l'objet en mémoire
  if (!org.options) org.options = {};
  org.options.emailWarmup = { status: 'cold' };

  logger.logInfo('WARMUP_INIT', `Org ${org.id} warm-up initialized: cold`, {
    orgId: org.id, orgName: org.name,
  });

  return org;
}

// ============================================================
// markWarmupStarted(org)
// ============================================================

/**
 * Transition cold → warming au premier envoi effectif.
 *
 * @param {object} org - Org parsée
 */
function markWarmupStarted(org) {
  if (!EMAIL_WARMUP_ENABLED) return;

  const warmup = org.options?.emailWarmup;
  if (!warmup || warmup.status !== 'cold') return; // Déjà warming/warm

  const nowISO = new Date().toISOString();
  _persistWarmupState(org.id, { status: 'warming', startedAt: nowISO });

  // Mettre à jour l'objet en mémoire
  org.options.emailWarmup = { status: 'warming', startedAt: nowISO };

  logger.logInfo('WARMUP_TRANSITION', `Org ${org.id}: cold → warming`, {
    orgId: org.id, orgName: org.name, fromStatus: 'cold', toStatus: 'warming', startedAt: nowISO,
  });
}

// ============================================================
// forceWarm(orgId) — admin override
// ============================================================

/**
 * Force une org en status=warm (bypass warm-up).
 *
 * @param {string} orgId
 * @returns {{ ok: boolean, state: object }}
 */
function forceWarm(orgId) {
  const org = orgRepo.getById(orgId);
  if (!org) return { ok: false, error: 'org_not_found' };

  const previous = org.options?.emailWarmup?.status || 'none';
  _persistWarmupState(orgId, { status: 'warm', startedAt: org.options?.emailWarmup?.startedAt || new Date().toISOString() });

  logger.logInfo('WARMUP_TRANSITION', `Org ${orgId} force-warmed by admin: ${previous} → warm`, {
    orgId, orgName: org.name, fromStatus: previous, toStatus: 'warm', admin: true,
  });

  // Return updated state
  const updatedOrg = orgRepo.getById(orgId);
  return {
    ok: true,
    state: getWarmupState(updatedOrg),
    previousStatus: previous,
  };
}

// ============================================================
// HELPERS INTERNES
// ============================================================

/**
 * Détermine les limites warm-up pour un jour donné.
 * @param {number} day - Nombre de jours écoulés depuis startedAt
 * @returns {{ daily: number, hourly: number } | null}
 */
function getLimitsForDay(day) {
  for (const tier of WARMUP_TIERS) {
    if (day < tier.maxDay) {
      return { daily: tier.daily, hourly: tier.hourly };
    }
  }
  // Au-delà du dernier palier → pas de limite warm-up
  return null;
}

/**
 * Persiste l'état warm-up dans org.options.emailWarmup
 * @param {string} orgId
 * @param {object} warmupData - { status, startedAt? }
 */
function _persistWarmupState(orgId, warmupData) {
  orgRepo.updateOptions(orgId, { emailWarmup: warmupData });
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  getWarmupState,
  ensureWarmupInitialized,
  markWarmupStarted,
  forceWarm,
  // Exported for testing
  getLimitsForDay,
  EMAIL_WARMUP_ENABLED,
  WARMUP_TIERS,
  WARMUP_FINAL_DAY,
  DAY_MS,
};
