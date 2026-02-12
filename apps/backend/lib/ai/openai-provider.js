/**
 * OpenAI Provider — Reputy PR-3
 *
 * Isolated module: receives review text, returns a draft reply.
 * Never sends internal IDs, IPs, or patient data to OpenAI.
 *
 * Env:
 *   OPENAI_API_KEY  — required (guard at call-site, not at require-time)
 *   OPENAI_MODEL    — optional, default gpt-4o-mini
 */

'use strict';

const OpenAI = require('openai');

// ── Sensitive-content heuristic ──────────────────────────────

const SENSITIVE_KEYWORDS = [
  'diagnostic', 'maladie', 'cancer', 'décès', 'mort', 'suicide',
  'dépression', 'harcèlement', 'agression', 'plainte', 'procès',
  'avocat', 'tribunal', 'erreur médicale', 'faute', 'négligence',
  'infection', 'opération', 'chirurgie', 'urgence', 'sang',
  'drogue', 'alcool', 'toxicomanie', 'psychiatr', 'handicap',
];

function isSensitive(text) {
  if (!text) return false;
  const lower = text.toLowerCase();
  return SENSITIVE_KEYWORDS.some((kw) => lower.includes(kw));
}

// ── System prompt ────────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es un assistant qui rédige des brouillons de réponse aux avis Google pour un professionnel de santé.

Règles strictes :
- Réponse courte (3-5 phrases max), polie et professionnelle.
- Ne JAMAIS confirmer un diagnostic, un traitement ou une prise en charge médicale.
- Ne JAMAIS citer de données personnelles (nom, date de naissance, numéro de dossier).
- Si l'avis mentionne un problème grave ou sensible, proposer de contacter le cabinet en privé.
- Ne pas utiliser d'émoji sauf si le ton le demande.
- Écrire en français sauf si une autre langue est explicitement demandée.
- Le texte doit pouvoir être publié tel quel sur Google après validation humaine.`;

// ── Main function ────────────────────────────────────────────

/**
 * Generate a draft reply for a Google review.
 *
 * @param {object} opts
 * @param {string} opts.reviewText  — the review content (public, already on Google)
 * @param {string} [opts.orgName]   — organisation display name (for personalisation)
 * @param {string} [opts.language]  — reply language (default: 'fr')
 * @param {string} [opts.tone]      — 'professional' | 'warm' | 'empathetic' | 'short'
 * @returns {Promise<{ draft: string, sensitive: boolean }>}
 */
async function suggestReply({ reviewText, orgName, language = 'fr', tone = 'professional' }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const err = new Error('OPENAI_NOT_CONFIGURED');
    err.statusCode = 503;
    throw err;
  }

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const sensitive = isSensitive(reviewText);

  const toneInstruction = {
    professional: 'Ton professionnel et courtois.',
    warm: 'Ton chaleureux et bienveillant.',
    empathetic: 'Ton empathique et compréhensif.',
    short: 'Réponse très courte (2 phrases max).',
  }[tone] || 'Ton professionnel et courtois.';

  const userMessage = [
    `Avis Google à traiter :`,
    `"${reviewText}"`,
    '',
    toneInstruction,
    orgName ? `Nom du cabinet : ${orgName}` : '',
    language !== 'fr' ? `Langue de réponse : ${language}` : '',
    sensitive ? 'ATTENTION : contenu potentiellement sensible. Proposer un échange privé.' : '',
  ]
    .filter(Boolean)
    .join('\n');

  const client = new OpenAI({ apiKey });

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ],
    max_tokens: 350,
    temperature: 0.7,
  });

  const draft = (completion.choices?.[0]?.message?.content || '').trim();

  if (!draft) {
    const err = new Error('OpenAI returned empty response');
    err.statusCode = 502;
    throw err;
  }

  return { draft, sensitive };
}

// ── Exports ──────────────────────────────────────────────────

module.exports = { suggestReply, isSensitive };
