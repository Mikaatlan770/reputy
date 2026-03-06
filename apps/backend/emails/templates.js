/**
 * REPUTY - Email Templates (Placeholder)
 * 
 * Ces templates seront utilisés pour les emails envoyés par Reputy.
 * Pour l'instant, ils sont stockés en dur. Plus tard, ils pourront être:
 * - Stockés en base de données
 * - Personnalisés par client
 * - Gérés via un service email (SendGrid, Mailgun, etc.)
 */

const REPUTY_DOMAIN = process.env.REPUTY_DOMAIN || 'https://reputyapp.com';
const ADMIN_URL = process.env.ADMIN_URL || 'https://app.reputyapp.com';
const CHROME_EXTENSION_URL = 'https://chrome.google.com/webstore/detail/reputy/nfmjafgkhmociachlhiaegkfhodhgkoc';

/**
 * Template: Confirmation d'inscription
 * Envoyé après la création d'un compte client
 */
function getWelcomeEmailTemplate(data) {
  const { orgName, email, publicKey, adminUrl = ADMIN_URL } = data;

  return {
    subject: `Bienvenue sur Reputy, ${orgName} !`,

    text: `Bonjour ${orgName},

Merci de nous faire confiance ! Votre compte Reputy est activé et prêt à l'emploi.

Reputy vous permet de collecter automatiquement des avis Google après chaque consultation et d'y répondre avec l'IA — pour renforcer votre réputation en ligne sans effort.

─────────────────────────────────────
DÉMARREZ EN 3 ÉTAPES
─────────────────────────────────────

1. Connectez-vous à votre tableau de bord
   ${adminUrl}
   Utilisez l'email : ${email}

2. Installez l'extension Chrome Reputy
   ${CHROME_EXTENSION_URL}
   Elle s'intègre à Doctolib Pro pour envoyer une demande d'avis en 1 clic.

3. Renseignez votre clé d'installation dans l'extension
   ${publicKey}

─────────────────────────────────────
Une question ? support@reputyapp.com
─────────────────────────────────────

L'équipe Reputy
${REPUTY_DOMAIN}`.trim(),

    html: `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;">
<tr><td align="center" style="padding:40px 20px;">

  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08);">

    <!-- HEADER -->
    <tr><td style="background:linear-gradient(135deg,#1e293b 0%,#334155 100%);padding:40px;text-align:center;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 20px;">
        <tr><td style="background:rgba(255,255,255,.12);border-radius:12px;padding:14px 22px;line-height:0;">
          <svg viewBox="0 0 70 100" width="30" height="42" fill="white">
            <rect x="0" y="0" width="18" height="100" rx="2"/>
            <path d="M18 0 L50 0 A25 25 0 0 1 50 50 L18 50 L18 35 L45 35 A10 10 0 0 0 45 15 L18 15 Z"/>
            <polygon points="28,48 70,100 52,100 18,56"/>
          </svg>
        </td></tr>
      </table>
      <h1 style="margin:0 0 10px;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:-0.5px;">Bienvenue sur Reputy</h1>
      <p style="margin:0;color:rgba(255,255,255,.65);font-size:15px;">Votre réputation entre de bonnes mains</p>
    </td></tr>

    <!-- INTRO -->
    <tr><td style="padding:40px 40px 28px;">
      <p style="margin:0 0 18px;font-size:18px;font-weight:600;color:#1e293b;">Bonjour ${orgName}&nbsp;🎉</p>
      <p style="margin:0 0 14px;font-size:15px;color:#475569;line-height:1.75;">
        Merci de nous faire confiance&nbsp;! Votre compte est activé et prêt à l'emploi.
      </p>
      <p style="margin:0;font-size:15px;color:#475569;line-height:1.75;">
        <strong style="color:#1e293b;">Reputy</strong> vous permet de collecter automatiquement des avis Google après chaque consultation et d'y répondre avec l'IA&nbsp;— pour renforcer votre réputation en ligne sans effort.
      </p>
    </td></tr>

    <!-- SÉPARATEUR -->
    <tr><td style="padding:0 40px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="height:1px;background:#e2e8f0;font-size:0;">&nbsp;</td></tr></table></td></tr>

    <!-- ÉTAPES -->
    <tr><td style="padding:32px 40px 28px;">
      <p style="margin:0 0 24px;font-size:16px;font-weight:700;color:#1e293b;">Démarrez en 3&nbsp;étapes</p>

      <!-- Étape 1 -->
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:22px;">
        <tr>
          <td valign="top" style="width:48px;padding-top:2px;">
            <div style="width:38px;height:38px;background:#eff6ff;border-radius:10px;text-align:center;line-height:38px;font-size:20px;">🔐</div>
          </td>
          <td valign="top" style="padding-left:16px;">
            <p style="margin:0 0 5px;font-size:15px;font-weight:600;color:#1e293b;">Connectez-vous à votre tableau de bord</p>
            <p style="margin:0;font-size:14px;color:#64748b;line-height:1.6;">Accédez à votre espace avec l'email <strong style="color:#475569;">${email}</strong> et votre mot de passe.</p>
          </td>
        </tr>
      </table>

      <!-- Étape 2 -->
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:22px;">
        <tr>
          <td valign="top" style="width:48px;padding-top:2px;">
            <div style="width:38px;height:38px;background:#f0fdf4;border-radius:10px;text-align:center;line-height:38px;font-size:20px;">🔌</div>
          </td>
          <td valign="top" style="padding-left:16px;">
            <p style="margin:0 0 5px;font-size:15px;font-weight:600;color:#1e293b;">Installez l'extension Chrome Reputy</p>
            <p style="margin:0;font-size:14px;color:#64748b;line-height:1.6;">Elle s'intègre à Doctolib Pro et vous permet d'envoyer une demande d'avis en 1&nbsp;clic après chaque consultation. <a href="${CHROME_EXTENSION_URL}" style="color:#3b82f6;text-decoration:none;">Télécharger →</a></p>
          </td>
        </tr>
      </table>

      <!-- Étape 3 -->
      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">
        <tr>
          <td valign="top" style="width:48px;padding-top:2px;">
            <div style="width:38px;height:38px;background:#fdf4ff;border-radius:10px;text-align:center;line-height:38px;font-size:20px;">⭐</div>
          </td>
          <td valign="top" style="padding-left:16px;">
            <p style="margin:0 0 5px;font-size:15px;font-weight:600;color:#1e293b;">Commencez à collecter des avis</p>
            <p style="margin:0;font-size:14px;color:#64748b;line-height:1.6;">Vos patients reçoivent un SMS ou email après leur visite. Leurs avis remontent automatiquement dans votre tableau de bord.</p>
          </td>
        </tr>
      </table>
    </td></tr>

    <!-- CTA -->
    <tr><td style="padding:0 40px 40px;text-align:center;">
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 14px;">
        <tr><td style="background:linear-gradient(135deg,#3b82f6,#2563eb);border-radius:10px;">
          <a href="${adminUrl}" style="display:inline-block;padding:16px 40px;color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;letter-spacing:0.2px;">Accéder à mon espace&nbsp;→</a>
        </td></tr>
      </table>
      <p style="margin:0;font-size:13px;color:#94a3b8;">${adminUrl}</p>
    </td></tr>

    <!-- CLÉ D'INSTALLATION -->
    <tr><td style="padding:0 40px 40px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;">
        <tr><td style="padding:20px;">
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;">Votre clé d'installation</p>
          <div style="background:#1e293b;border-radius:8px;padding:14px 16px;text-align:center;font-family:'Courier New',Courier,monospace;font-size:14px;color:#fbbf24;letter-spacing:1px;word-break:break-all;">${publicKey}</div>
          <p style="margin:12px 0 0;font-size:12px;color:#94a3b8;line-height:1.6;">À renseigner dans les options de l'extension Chrome pour relier l'extension à votre compte.</p>
        </td></tr>
      </table>
    </td></tr>

    <!-- FOOTER -->
    <tr><td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:24px 40px;text-align:center;">
      <p style="margin:0 0 8px;font-size:13px;color:#94a3b8;">Une question&nbsp;? <a href="mailto:support@reputyapp.com" style="color:#3b82f6;text-decoration:none;">support@reputyapp.com</a></p>
      <p style="margin:0;font-size:12px;color:#cbd5e1;">© Reputy SAS &nbsp;·&nbsp; 6 Allée Gustave Eiffel, 92130 Issy-les-Moulineaux</p>
    </td></tr>

  </table>
</td></tr>
</table>
</body>
</html>`.trim()
  };
}

/**
 * Template: Rappel de configuration extension
 * Envoyé si le client n'a pas configuré l'extension après X jours
 */
function getExtensionReminderTemplate(data) {
  const { orgName, publicKey, adminUrl = ADMIN_URL } = data;
  
  return {
    subject: `${orgName}, n'oubliez pas de configurer votre extension Reputy`,
    text: `
Bonjour,

Nous avons remarqué que vous n'avez pas encore configuré l'extension Chrome Reputy.

Pour commencer à collecter des avis automatiquement :

1. Installez l'extension : ${CHROME_EXTENSION_URL}
2. Ouvrez les options de l'extension
3. Collez votre Public Key : ${publicKey}
4. Enregistrez !

Besoin d'aide ? Contactez-nous : support@reputyapp.com

L'équipe Reputy
    `.trim(),
    
    html: null // À implémenter si besoin
  };
}

/**
 * Template: Nouvelle clé publique générée
 * Envoyé si l'admin régénère la publicKey
 */
function getPublicKeyResetTemplate(data) {
  const { orgName, oldPublicKey, newPublicKey } = data;
  
  return {
    subject: `[Reputy] Nouvelle clé publique générée pour ${orgName}`,
    text: `
Bonjour,

La clé publique de votre compte Reputy a été régénérée.

ANCIENNE CLÉ (invalidée) : ${oldPublicKey}
NOUVELLE CLÉ : ${newPublicKey}

⚠️ ACTION REQUISE :
Vous devez mettre à jour l'extension Chrome avec la nouvelle clé :
1. Ouvrez les options de l'extension Reputy
2. Remplacez l'ancienne Public Key par : ${newPublicKey}
3. Enregistrez

Sans cette mise à jour, l'extension ne pourra plus envoyer de demandes d'avis.

L'équipe Reputy
    `.trim(),
    
    html: null // À implémenter si besoin
  };
}

// Export des templates
module.exports = {
  getWelcomeEmailTemplate,
  getExtensionReminderTemplate,
  getPublicKeyResetTemplate,
  
  // Constantes
  REPUTY_DOMAIN,
  ADMIN_URL,
  CHROME_EXTENSION_URL
};
