/**
 * P0.4 - Email Templates (Review Requests)
 *
 * Inline CSS for maximum email client compatibility.
 * Each template function returns { subject, text, html }.
 */

const REPUTY_DOMAIN = process.env.REPUTY_DOMAIN || 'https://reputyapp.com';

// ============================================================
// TEMPLATE: review_request
// ============================================================

/**
 * Review request email template
 *
 * IMPORTANT: Text content MUST stay aligned with the frontend dashboard preview
 * (apps/reputy-admin/src/components/email/EmailPreview.tsx → DEFAULT_EMAIL_TEMPLATE).
 * HTML version uses the same text with professional styling.
 *
 * @param {{ orgName, patientFirstName?, reviewUrl, unsubscribeUrl }} data
 */
function reviewRequest(data) {
  const { orgName, patientFirstName, reviewUrl, unsubscribeUrl } = data;
  const greeting = patientFirstName ? `Cher(e) ${patientFirstName}` : 'Cher(e) patient(e)';

  return {
    subject: `${orgName} – Votre avis nous intéresse`,

    // Text version — aligned with dashboard preview
    text: `${greeting},

Nous espérons que votre expérience chez ${orgName} vous a satisfait.

Prenez quelques secondes pour nous laisser votre avis :

${reviewUrl}

Merci pour votre confiance !

L'équipe ${orgName}

---
Cet email a été envoyé par Reputy pour le compte de ${orgName}.
Si vous ne souhaitez plus recevoir ces emails :
${unsubscribeUrl}`,

    // HTML version — same text, professional styling
    html: `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;">
<tr><td align="center" style="padding:40px 20px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.06);">
  <!-- Header -->
  <tr><td style="background:linear-gradient(135deg,#3b82f6,#2563eb);padding:32px 40px;text-align:center;">
    <h1 style="margin:0;color:#fff;font-size:22px;font-weight:600;">${orgName}</h1>
    <p style="margin:8px 0 0;color:rgba(255,255,255,.85);font-size:14px;">Votre avis compte pour nous</p>
  </td></tr>
  <!-- Body -->
  <tr><td style="padding:40px;">
    <p style="margin:0 0 16px;font-size:16px;color:#1e293b;">${greeting},</p>
    <p style="margin:0 0 16px;font-size:16px;color:#475569;line-height:1.6;">
      Nous espérons que votre expérience chez <strong>${orgName}</strong> vous a satisfait.
    </p>
    <p style="margin:0 0 24px;font-size:16px;color:#475569;line-height:1.6;">
      Prenez quelques secondes pour nous laisser votre avis :
    </p>
    <!-- CTA -->
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 32px;">
      <tr><td style="background:#3b82f6;border-radius:8px;">
        <a href="${reviewUrl}" target="_blank" style="display:inline-block;padding:14px 32px;color:#fff;text-decoration:none;font-size:16px;font-weight:600;">⭐ Donner mon avis</a>
      </td></tr>
    </table>
    <p style="margin:0 0 8px;font-size:14px;color:#94a3b8;text-align:center;">Ou copiez ce lien :</p>
    <p style="margin:0 0 24px;font-size:12px;color:#3b82f6;text-align:center;word-break:break-all;">${reviewUrl}</p>
    <p style="margin:0;font-size:16px;color:#475569;">Merci pour votre confiance !<br><strong>L'équipe ${orgName}</strong></p>
  </td></tr>
  <!-- Footer -->
  <tr><td style="background:#f8fafc;padding:24px 40px;border-top:1px solid #e2e8f0;">
    <p style="margin:0 0 8px;font-size:12px;color:#94a3b8;text-align:center;">
      Cet email a été envoyé par <a href="${REPUTY_DOMAIN}" style="color:#64748b;">Reputy</a> pour le compte de ${orgName}.
    </p>
    <p style="margin:0;font-size:12px;color:#94a3b8;text-align:center;">
      <a href="${unsubscribeUrl}" style="color:#64748b;">Se désinscrire</a>
    </p>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`,
  };
}

// ============================================================
// TEMPLATE: test
// ============================================================

function testEmail(data) {
  const { orgName, targetEmail } = data;
  const now = new Date().toISOString();

  return {
    subject: `[TEST] Reputy Email — ${orgName}`,

    text: `Ceci est un email de test envoyé par Reputy.\n\nOrganisation: ${orgName}\nDestinataire: ${targetEmail}\nDate: ${now}\n\nSi vous recevez cet email, la configuration fonctionne.`,

    html: `<div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px;">
<h2 style="color:#3b82f6;">✅ Test Email Reputy</h2>
<p>Ceci est un email de test.</p>
<table style="width:100%;border-collapse:collapse;margin:16px 0;">
  <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:600;">Organisation</td><td style="padding:8px;border:1px solid #e2e8f0;">${orgName}</td></tr>
  <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:600;">Destinataire</td><td style="padding:8px;border:1px solid #e2e8f0;">${targetEmail}</td></tr>
  <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:600;">Date</td><td style="padding:8px;border:1px solid #e2e8f0;">${now}</td></tr>
</table>
<p style="color:#22c55e;font-weight:600;">✓ Configuration email fonctionnelle</p>
</div>`,
  };
}

// ============================================================
// REGISTRY
// ============================================================

const TEMPLATES = {
  review_request: reviewRequest,
  test: testEmail,
};

/**
 * Render a template by key
 */
function renderTemplate(templateKey, data) {
  const fn = TEMPLATES[templateKey];
  if (!fn) throw new Error(`Unknown email template: ${templateKey}`);
  return fn(data);
}

module.exports = {
  reviewRequest,
  testEmail,
  renderTemplate,
  TEMPLATES,
};
