/**
 * REPUTY - Email Templates (Placeholder)
 * 
 * Ces templates seront utilisés pour les emails envoyés par Reputy.
 * Pour l'instant, ils sont stockés en dur. Plus tard, ils pourront être:
 * - Stockés en base de données
 * - Personnalisés par client
 * - Gérés via un service email (SendGrid, Mailgun, etc.)
 */

const REPUTY_DOMAIN = process.env.REPUTY_DOMAIN || 'https://reputy.fr';
const ADMIN_URL = process.env.ADMIN_URL || 'https://app.reputy.fr';
const CHROME_EXTENSION_URL = 'https://chrome.google.com/webstore/detail/reputy/EXTENSION_ID';

/**
 * Template: Confirmation d'inscription
 * Envoyé après la création d'un compte client
 */
function getWelcomeEmailTemplate(data) {
  const { orgName, email, publicKey, adminUrl = ADMIN_URL } = data;
  
  return {
    subject: `Bienvenue sur Reputy, ${orgName} !`,
    text: `
Bonjour,

Votre compte Reputy a été créé avec succès !

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 INFORMATIONS DE VOTRE COMPTE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Organisation : ${orgName}
Email : ${email}
Public Key : ${publicKey}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 PROCHAINES ÉTAPES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1️⃣ Accédez à votre tableau de bord
   ${adminUrl}

2️⃣ Installez l'extension Chrome Reputy
   ${CHROME_EXTENSION_URL}

3️⃣ Configurez l'extension avec votre Public Key
   Ouvrez les options de l'extension et collez :
   ${publicKey}

4️⃣ Commencez à collecter des avis !
   L'extension s'intègre à Doctolib pour envoyer 
   automatiquement des demandes d'avis.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
💡 BESOIN D'AIDE ?
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Documentation : ${REPUTY_DOMAIN}/docs
Support : support@reputy.fr

Merci de votre confiance !

L'équipe Reputy
${REPUTY_DOMAIN}
    `.trim(),
    
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1e293b; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; padding: 30px 0; }
    .logo { font-size: 28px; font-weight: 700; color: #2d3748; }
    .card { background: #f8fafc; border-radius: 12px; padding: 24px; margin: 20px 0; }
    .key-box { background: #1e293b; color: #fbbf24; font-family: monospace; padding: 16px; border-radius: 8px; text-align: center; font-size: 16px; margin: 12px 0; }
    .step { display: flex; gap: 12px; margin: 16px 0; }
    .step-number { width: 28px; height: 28px; background: #3b82f6; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; flex-shrink: 0; }
    .btn { display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; }
    .footer { text-align: center; padding: 30px 0; color: #64748b; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">Reputy</div>
      <p style="color: #64748b;">Collectez et gérez vos avis clients</p>
    </div>
    
    <h2>Bienvenue, ${orgName} ! 🎉</h2>
    <p>Votre compte Reputy a été créé avec succès.</p>
    
    <div class="card">
      <h3>📋 Informations de votre compte</h3>
      <p><strong>Organisation :</strong> ${orgName}</p>
      <p><strong>Email :</strong> ${email}</p>
      <p><strong>Public Key :</strong></p>
      <div class="key-box">${publicKey}</div>
      <p style="font-size: 13px; color: #64748b;">Gardez cette clé précieusement, elle permet de relier l'extension à votre compte.</p>
    </div>
    
    <h3>🚀 Prochaines étapes</h3>
    
    <div class="step">
      <div class="step-number">1</div>
      <div>
        <strong>Accédez à votre tableau de bord</strong><br>
        <a href="${adminUrl}" style="color: #3b82f6;">${adminUrl}</a>
      </div>
    </div>
    
    <div class="step">
      <div class="step-number">2</div>
      <div>
        <strong>Installez l'extension Chrome Reputy</strong><br>
        <a href="${CHROME_EXTENSION_URL}" style="color: #3b82f6;">Télécharger l'extension</a>
      </div>
    </div>
    
    <div class="step">
      <div class="step-number">3</div>
      <div>
        <strong>Configurez l'extension</strong><br>
        Ouvrez les options et collez votre Public Key
      </div>
    </div>
    
    <div class="step">
      <div class="step-number">4</div>
      <div>
        <strong>Commencez à collecter des avis !</strong><br>
        L'extension s'intègre à Doctolib automatiquement
      </div>
    </div>
    
    <div style="text-align: center; margin: 30px 0;">
      <a href="${adminUrl}" class="btn">Accéder au tableau de bord</a>
    </div>
    
    <div class="footer">
      <p>Besoin d'aide ? <a href="mailto:support@reputy.fr" style="color: #3b82f6;">support@reputy.fr</a></p>
      <p>© Reputy • <a href="${REPUTY_DOMAIN}" style="color: #64748b;">${REPUTY_DOMAIN}</a></p>
    </div>
  </div>
</body>
</html>
    `.trim()
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

Besoin d'aide ? Contactez-nous : support@reputy.fr

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
