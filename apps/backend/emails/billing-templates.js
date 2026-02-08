/**
 * REPUTY - Billing Email Templates
 * 
 * Templates pour les emails liés à la facturation:
 * - Confirmation de paiement
 * - Échec de paiement (relances J0, J3, J6)
 * - Passage en lecture seule (J7)
 * - Confirmation d'abonnement
 */

const ADMIN_URL = process.env.ADMIN_URL || 'http://localhost:3002';
const SUPPORT_EMAIL = process.env.SUPPORT_BILLING_EMAIL || 'support@reputy.fr';

// ============================================================
// Plan Labels
// ============================================================

const PLAN_LABELS = {
  bronze: 'Pack Bronze (Essai)',
  argent: 'Pack Argent',
  or: 'Pack Or'
};

const PLAN_PRICES = {
  bronze: 'Gratuit',
  argent: '59€ HT/mois',
  or: '99€ HT/mois'
};

// ============================================================
// Payment Success
// ============================================================

/**
 * Email envoyé après un paiement réussi
 */
function getPaymentSuccessTemplate(data) {
  const { 
    orgName, 
    email, 
    planId, 
    amount, 
    currency = 'EUR',
    periodStart,
    periodEnd,
    invoiceUrl 
  } = data;
  
  const planLabel = PLAN_LABELS[planId] || planId;
  const formattedAmount = amount ? `${(amount / 100).toFixed(2)}€` : PLAN_PRICES[planId];
  
  return {
    subject: `✅ Paiement confirmé - Reputy ${planLabel}`,
    text: `
Bonjour,

Votre paiement Reputy a été confirmé avec succès.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 DÉTAILS DU PAIEMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Organisation : ${orgName}
Forfait : ${planLabel}
Montant : ${formattedAmount}
${periodStart ? `Période : ${formatDate(periodStart)} - ${formatDate(periodEnd)}` : ''}

${invoiceUrl ? `📄 Télécharger la facture : ${invoiceUrl}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Accédez à votre tableau de bord : ${ADMIN_URL}

Merci de votre confiance !
L'équipe Reputy
`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%); color: white; padding: 30px; border-radius: 12px 12px 0 0; }
    .content { background: #f8fafc; padding: 30px; border-radius: 0 0 12px 12px; }
    .success-icon { font-size: 48px; margin-bottom: 10px; }
    .details { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
    .detail-row:last-child { border-bottom: none; }
    .label { color: #64748b; }
    .value { font-weight: 600; }
    .btn { display: inline-block; background: #0ea5e9; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin: 10px 0; }
    .footer { text-align: center; color: #94a3b8; font-size: 12px; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="success-icon">✅</div>
      <h1 style="margin: 0;">Paiement confirmé</h1>
    </div>
    <div class="content">
      <p>Bonjour,</p>
      <p>Votre paiement Reputy a été confirmé avec succès.</p>
      
      <div class="details">
        <div class="detail-row">
          <span class="label">Organisation</span>
          <span class="value">${orgName}</span>
        </div>
        <div class="detail-row">
          <span class="label">Forfait</span>
          <span class="value">${planLabel}</span>
        </div>
        <div class="detail-row">
          <span class="label">Montant</span>
          <span class="value">${formattedAmount}</span>
        </div>
        ${periodStart ? `
        <div class="detail-row">
          <span class="label">Période</span>
          <span class="value">${formatDate(periodStart)} - ${formatDate(periodEnd)}</span>
        </div>
        ` : ''}
      </div>
      
      ${invoiceUrl ? `<p><a href="${invoiceUrl}" class="btn">📄 Télécharger la facture</a></p>` : ''}
      
      <p><a href="${ADMIN_URL}" class="btn">Accéder au tableau de bord</a></p>
      
      <p>Merci de votre confiance !<br>L'équipe Reputy</p>
    </div>
    <div class="footer">
      <p>Cet email a été envoyé par Reputy • <a href="${ADMIN_URL}/billing">Gérer mon abonnement</a></p>
    </div>
  </div>
</body>
</html>
`
  };
}

// ============================================================
// Payment Failed (Dunning Reminders)
// ============================================================

/**
 * Email envoyé lors d'un échec de paiement (J0, J3, J6)
 */
function getPaymentFailedTemplate(data) {
  const { 
    orgName, 
    email, 
    planId,
    daysPastDue = 0,
    daysRemaining,
    updatePaymentUrl 
  } = data;
  
  const planLabel = PLAN_LABELS[planId] || planId;
  const remaining = daysRemaining !== undefined ? daysRemaining : (7 - daysPastDue);
  
  let urgency = '';
  let urgencyColor = '#f59e0b';
  
  if (remaining <= 1) {
    urgency = '⚠️ URGENT : ';
    urgencyColor = '#dc2626';
  } else if (remaining <= 3) {
    urgency = '⏰ ';
    urgencyColor = '#ea580c';
  }
  
  return {
    subject: `${urgency}Paiement en attente - Reputy (${remaining} jour${remaining > 1 ? 's' : ''} restant${remaining > 1 ? 's' : ''})`,
    text: `
Bonjour,

Nous n'avons pas pu traiter votre paiement Reputy.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚠️ ACTION REQUISE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Organisation : ${orgName}
Forfait : ${planLabel}
Délai : ${remaining} jour${remaining > 1 ? 's' : ''} avant restriction du compte

Sans régularisation, votre compte passera en lecture seule et vous ne pourrez plus :
- Envoyer de SMS ou emails
- Utiliser l'assistant IA
- Créer de nouveaux QR codes ou tags NFC

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔧 METTRE À JOUR MON PAIEMENT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${updatePaymentUrl || `${ADMIN_URL}/billing`}

Si vous avez des questions, contactez-nous : ${SUPPORT_EMAIL}

L'équipe Reputy
`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: ${urgencyColor}; color: white; padding: 30px; border-radius: 12px 12px 0 0; }
    .content { background: #f8fafc; padding: 30px; border-radius: 0 0 12px 12px; }
    .warning-icon { font-size: 48px; margin-bottom: 10px; }
    .countdown { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center; }
    .countdown-number { font-size: 48px; font-weight: bold; color: ${urgencyColor}; }
    .countdown-label { color: #64748b; }
    .consequences { background: #fef2f2; border-left: 4px solid #dc2626; padding: 15px; margin: 20px 0; }
    .btn { display: inline-block; background: ${urgencyColor}; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin: 10px 0; font-weight: 600; }
    .footer { text-align: center; color: #94a3b8; font-size: 12px; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="warning-icon">⚠️</div>
      <h1 style="margin: 0;">Paiement en attente</h1>
    </div>
    <div class="content">
      <p>Bonjour,</p>
      <p>Nous n'avons pas pu traiter votre paiement Reputy pour <strong>${orgName}</strong>.</p>
      
      <div class="countdown">
        <div class="countdown-number">${remaining}</div>
        <div class="countdown-label">jour${remaining > 1 ? 's' : ''} avant restriction du compte</div>
      </div>
      
      <div class="consequences">
        <strong>Sans régularisation, vous ne pourrez plus :</strong>
        <ul style="margin: 10px 0; padding-left: 20px;">
          <li>Envoyer de SMS ou emails</li>
          <li>Utiliser l'assistant IA</li>
          <li>Créer de nouveaux QR codes ou tags NFC</li>
        </ul>
      </div>
      
      <p style="text-align: center;">
        <a href="${updatePaymentUrl || `${ADMIN_URL}/billing`}" class="btn">
          🔧 Mettre à jour mon paiement
        </a>
      </p>
      
      <p style="color: #64748b; font-size: 14px;">
        Une question ? Contactez-nous : <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>
      </p>
    </div>
    <div class="footer">
      <p>Cet email a été envoyé par Reputy</p>
    </div>
  </div>
</body>
</html>
`
  };
}

// ============================================================
// Read Only Notification
// ============================================================

/**
 * Email envoyé quand le compte passe en lecture seule (J7)
 */
function getReadOnlyTemplate(data) {
  const { orgName, email, planId, updatePaymentUrl } = data;
  const planLabel = PLAN_LABELS[planId] || planId;
  
  return {
    subject: `🔒 Compte Reputy restreint - Action requise`,
    text: `
Bonjour,

Votre compte Reputy est maintenant en lecture seule.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔒 COMPTE RESTREINT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Organisation : ${orgName}
Forfait : ${planLabel}

Suite à un problème de paiement non résolu, votre compte est désormais restreint.

Ce que vous pouvez encore faire :
✓ Consulter votre tableau de bord
✓ Voir vos avis et statistiques

Ce qui est bloqué :
✗ Envoi de SMS et emails
✗ Utilisation de l'assistant IA
✗ Création de QR codes et tags NFC

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔓 RÉACTIVER MON COMPTE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Régularisez votre situation pour retrouver l'accès complet :
${updatePaymentUrl || `${ADMIN_URL}/billing`}

Besoin d'aide ? Contactez-nous : ${SUPPORT_EMAIL}

L'équipe Reputy
`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #dc2626; color: white; padding: 30px; border-radius: 12px 12px 0 0; }
    .content { background: #f8fafc; padding: 30px; border-radius: 0 0 12px 12px; }
    .lock-icon { font-size: 48px; margin-bottom: 10px; }
    .status-box { display: flex; gap: 20px; margin: 20px 0; }
    .status-col { flex: 1; padding: 15px; border-radius: 8px; }
    .allowed { background: #dcfce7; }
    .blocked { background: #fee2e2; }
    .status-title { font-weight: 600; margin-bottom: 10px; }
    .status-item { font-size: 14px; margin: 5px 0; }
    .btn { display: inline-block; background: #0ea5e9; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin: 10px 0; font-weight: 600; }
    .footer { text-align: center; color: #94a3b8; font-size: 12px; margin-top: 30px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="lock-icon">🔒</div>
      <h1 style="margin: 0;">Compte restreint</h1>
    </div>
    <div class="content">
      <p>Bonjour,</p>
      <p>Suite à un problème de paiement non résolu, votre compte <strong>${orgName}</strong> est désormais en lecture seule.</p>
      
      <div class="status-box">
        <div class="status-col allowed">
          <div class="status-title">✓ Vous pouvez</div>
          <div class="status-item">Consulter le tableau de bord</div>
          <div class="status-item">Voir vos avis et stats</div>
        </div>
        <div class="status-col blocked">
          <div class="status-title">✗ Bloqué</div>
          <div class="status-item">Envoi SMS/emails</div>
          <div class="status-item">Assistant IA</div>
          <div class="status-item">Création QR/NFC</div>
        </div>
      </div>
      
      <p style="text-align: center;">
        <a href="${updatePaymentUrl || `${ADMIN_URL}/billing`}" class="btn">
          🔓 Réactiver mon compte
        </a>
      </p>
      
      <p style="color: #64748b; font-size: 14px;">
        Besoin d'aide ? <a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>
      </p>
    </div>
    <div class="footer">
      <p>Cet email a été envoyé par Reputy</p>
    </div>
  </div>
</body>
</html>
`
  };
}

// ============================================================
// Internal Notification (to support)
// ============================================================

/**
 * Email envoyé à l'équipe support pour suivi
 */
function getInternalBillingNotification(data) {
  const { 
    type, // 'payment_success' | 'payment_failed' | 'subscription_created' | 'subscription_cancelled'
    orgId,
    orgName,
    email,
    planId,
    amount,
    provider,
    eventId,
    details
  } = data;
  
  const typeLabels = {
    payment_success: '✅ Paiement réussi',
    payment_failed: '❌ Paiement échoué',
    subscription_created: '🆕 Nouvel abonnement',
    subscription_cancelled: '🚫 Abonnement résilié',
    read_only_applied: '🔒 Passage en lecture seule'
  };
  
  return {
    subject: `[Reputy Billing] ${typeLabels[type] || type} - ${orgName}`,
    text: `
NOTIFICATION BILLING REPUTY
===========================

Type: ${typeLabels[type] || type}
Date: ${new Date().toISOString()}

Organisation:
- ID: ${orgId}
- Nom: ${orgName}
- Email: ${email}

Abonnement:
- Forfait: ${PLAN_LABELS[planId] || planId}
- Provider: ${provider || 'N/A'}
${amount ? `- Montant: ${(amount / 100).toFixed(2)}€` : ''}
${eventId ? `- Event ID: ${eventId}` : ''}

${details ? `Détails:\n${JSON.stringify(details, null, 2)}` : ''}
`,
    html: null // Plain text only for internal notifications
  };
}

// ============================================================
// Helpers
// ============================================================

function formatDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

// ============================================================
// Exports
// ============================================================

module.exports = {
  // Templates
  getPaymentSuccessTemplate,
  getPaymentFailedTemplate,
  getReadOnlyTemplate,
  getInternalBillingNotification,
  
  // Constants
  PLAN_LABELS,
  PLAN_PRICES,
  
  // Helpers
  formatDate
};
