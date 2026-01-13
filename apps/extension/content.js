/**
 * REPUTY - Content Script
 * Injecte le bouton d'avis sur Doctolib Pro
 * Version: 1.0.0
 */

const REPUTY_VERSION = '1.0.0';
console.log(`[REPUTY] Content script loaded v${REPUTY_VERSION}`);

// ===== ICÔNES SVG =====
const ICONS = {
  // Logo Reputy - R avec bulle
  logo: `<svg viewBox="0 0 70 100" fill="currentColor">
    <rect x="0" y="0" width="18" height="100" rx="2"/>
    <path d="M18 0 L50 0 A25 25 0 0 1 50 50 L18 50 L18 35 L45 35 A10 10 0 0 0 45 15 L18 15 Z"/>
    <polygon points="28,48 70,100 52,100 18,56"/>
    <circle cx="-6" cy="14" r="10"/>
    <path d="M-2 22 Q6 34 14 26 Q8 24 2 24 Z"/>
  </svg>`,
  star: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`,
  sms: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  email: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>`,
  send: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  check: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`,
  alert: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  external: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
  refresh: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>`
};

// ===== ÉTAT GLOBAL =====
let currentModal = null;
let currentOverlay = null;
let selectedChannel = 'sms';
let failsafeTimer = null;
let lastContextMenuEl = null;
let lastClickEvent = null;
let lastRightClickPatientName = '';
let lastRightClickAppointmentEl = null;
let currentRootEl = null;
let lastHoverPhone = '';
let lastHoverTs = 0;

// ===== UTILITAIRES =====
function getRuntime() {
  if (typeof globalThis !== 'undefined') {
    if (globalThis.chrome && globalThis.chrome.runtime) return globalThis.chrome.runtime;
    if (globalThis.browser && globalThis.browser.runtime) return globalThis.browser.runtime;
  }
  if (typeof chrome !== 'undefined' && chrome.runtime) return chrome.runtime;
  if (typeof browser !== 'undefined' && browser.runtime) return browser.runtime;
  return null;
}

function sendMessageToBackground(msg) {
  return new Promise((resolve, reject) => {
    const runtime = getRuntime();
    if (!runtime || !runtime.sendMessage) {
      reject(new Error('API extension indisponible'));
      return;
    }
    try {
      runtime.sendMessage(msg, (response) => {
        if (runtime.lastError) {
          reject(new Error(runtime.lastError.message || 'Extension context invalidated'));
        } else {
          resolve(response);
        }
      });
    } catch (e) {
      reject(e);
    }
  });
}

async function pingBackground() {
  try {
    const r = await sendMessageToBackground({ type: 'PING' });
    console.log('[REPUTY] BG ping:', r);
  } catch (e) {
    console.warn('[REPUTY] BG ping failed:', e);
  }
}

// ===== HELPERS DOM =====
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Essaie de remonter un "bloc rendez-vous/patient" depuis un event.
 * Sans dépendre d’un selector Doctolib exact (car ça bouge).
 */
function resolveRootFromEvent(e) {
  const t = e?.target;
  if (!t || !(t instanceof Element)) return null;

  // Sélecteurs plausibles pour une carte RDV/menu/patient
  const candidates = [
    '[data-testid*="appointment"]',
    '[data-testid*="patient"]',
    '[data-testid*="booking"]',
    '[data-testid*="context"]',
    '[data-testid*="menu"]',
    '[class*="tooltip"]',
    '[class*="popover"]',
    '[class*="context"]',
    '[class*="menu"]',
    '[role="dialog"]',
    '[class*="appointment"]',
    '[class*="patient"]',
    '[class*="booking"]',
    'article',
    'section'
  ];

  // Helper pour chercher un ancestor dans la limite de 8 niveaux
  const tryFind = (startEl) => {
    let el = startEl;
    for (let i = 0; i < 8 && el; i++) {
      for (const sel of candidates) {
        const closest = el.closest?.(sel);
        if (closest && closest !== document.body) return closest;
      }
      el = el.parentElement;
    }
    return null;
  };

  // Priorité : l'élément sous la souris (utile pour clic droit)
  const pointEl =
    e?.clientX != null && e?.clientY != null
      ? document.elementFromPoint(e.clientX, e.clientY)
      : null;
  if (pointEl instanceof Element) {
    const found = tryFind(pointEl);
    if (found) return found;
  }

  // Fallback : target de l'événement
  return tryFind(t);
}

// Nom depuis la carte RDV (contextmenu)
function extractNameFromAppointmentEl(el) {
  if (!el) return '';
  const txt = (el.innerText || el.textContent || '').trim();
  if (!txt) return '';
  const lines = txt.split('\n').map(s => s.trim()).filter(Boolean);

  const blacklist = ['absence', 'rdv', 'vu', 'consultation', 'salle', 'internet'];
  const timeRe = /^\d{1,2}:\d{2}/;

  for (const line of lines) {
    const low = line.toLowerCase();
    if (timeRe.test(line)) continue;
    if (blacklist.some(w => low.includes(w))) continue;
    if (line.length < 3 || line.length > 80) continue;
    const digits = (line.match(/\d/g) || []).length;
    const letters = (line.match(/[A-Za-zÀ-ÖØ-öø-ÿ]/g) || []).length;
    if (letters < 3 || digits > letters) continue;
    return line.replace(/\s+/g, ' ').trim();
  }
  return '';
}

/**
 * Marque le bloc comme "Vu" en cliquant sur le bouton si présent.
 */
function markAsSeen(rootEl) {
  const scope = rootEl || document;
  const candidates = Array.from(scope.querySelectorAll('button, [role="button"]'));
  const btn = candidates.find(el => (el.textContent || '').trim().toLowerCase() === 'vu');
  if (btn) {
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }
}
// ===== EXTRACTION DONNÉES PATIENT =====
function extractPatientInfo(rootEl) {
  if (!rootEl) {
    return { name: '', phone: '', email: '', missing: true };
  }
  const scope = rootEl;
  const info = { name: '', phone: '', email: '', missing: false };

  // Nom
  const nameSelectors = [
    '[data-testid*="patient-name"]',
    '.agenda-patient-name',
    '.booking-patient-name',
    '.appointment-patient-name',
    '.patient-name',
    '[data-patient-name]',
    'h1',
    'h2',
    '.patient-info-name'
  ];
  for (const sel of nameSelectors) {
    const el = scope.querySelector(sel);
    if (el && el.textContent) {
      const text = el.textContent.trim();
      if (text.length > 2 && text.length < 100 && !text.includes('Doctolib')) {
        info.name = text;
        break;
      }
    }
  }

  // Téléphone
  const phoneSelectors = [
    '[data-testid*="patient-phone"]',
    '.booking-patient-phone',
    '.appointment-patient-phone'
  ];
  for (const sel of phoneSelectors) {
    const el = scope.querySelector(sel);
    if (el?.textContent?.trim()) {
      info.phone = el.textContent.trim().replace(/[^\d+]/g, '');
      break;
    }
  }
  if (!info.phone && scope.innerText) {
    const m = scope.innerText.match(/(?:\+33|0)[1-9](?:[\s.-]?\d{2}){4}/);
    if (m) info.phone = m[0].replace(/[^\d+]/g, '');
  }

  // Email
  const emailSelectors = [
    '[data-testid*="patient-email"]',
    '.booking-patient-email',
    '.appointment-patient-email'
  ];
  for (const sel of emailSelectors) {
    const el = scope.querySelector(sel);
    if (el?.textContent?.trim()) {
      info.email = el.textContent.trim();
      break;
    }
  }
  if (!info.email && scope.innerText) {
    const m = scope.innerText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (m) info.email = m[0];
  }

  if (!info.name && !info.phone && !info.email) {
    info.missing = true;
  }
  return info;
}

// Extraction depuis la fiche hover/preview (agenda) : nom + téléphone
function extractFromHoverPreview() {
  const phoneRe = /(?:\+33|0)[1-9](?:[\s.-]?\d{2}){4}/;

  const elems = Array.from(document.querySelectorAll('div, section, article, aside'))
    .filter(el => el.offsetParent !== null); // visible

  const leftElems = elems.filter(el => {
    const r = el.getBoundingClientRect();
    return r && r.left >= 0 && r.left < window.innerWidth * 0.45 && r.width > 180 && r.height > 80;
  });

  const pool = leftElems.length ? leftElems : elems;

  for (const el of pool) {
    const txt = (el.innerText || '').trim();
    if (!txt) continue;

    const m = txt.match(phoneRe);
    if (!m) continue;

    // ne garder que le téléphone
    const phone = m[0].replace(/[^\d+]/g, '');
    return { phone, found: true };
  }

  return { phone: '', found: false };
}

// ===== FETCH CONTACTS AIDE =====
function waitForContactInfo(timeoutMs = 2000) {
  const start = Date.now();

  const extract = () => {
    const txt = document.body?.innerText || '';
    const phone = (txt.match(/(?:\+33|0)[1-9](?:[\s.-]?\d{2}){4}/) || [])[0];
    const email = (txt.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/) || [])[0];
    return {
      phone: phone ? phone.replace(/[^\d+]/g, '') : '',
      email: email || ''
    };
  };

  return new Promise((resolve) => {
    const check = () => {
      const { phone, email } = extract();
      if (phone || email) {
        resolve({ phone, email });
        return true;
      }
      if (Date.now() - start > timeoutMs) {
        resolve({ phone: '', email: '' });
        return true;
      }
      return false;
    };

    if (check()) return;

    const obs = new MutationObserver(() => {
      if (check()) obs.disconnect();
    });

    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => {
      obs.disconnect();
      resolve({ phone: '', email: '' });
    }, timeoutMs);
  });
}

function waitForEmail(timeoutMs = 2500) {
  const start = Date.now();
  const emailRe = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;

  const extract = () => {
    const txt = document.body?.innerText || '';
    const m = txt.match(emailRe);
    return m ? m[0] : '';
  };

  return new Promise((resolve) => {
    const check = () => {
      const email = extract();
      if (email) return resolve(email);
      if (Date.now() - start > timeoutMs) return resolve('');
    };

    check();

    const obs = new MutationObserver(() => {
      const txt = extract();
      if (txt) { obs.disconnect(); resolve(txt); }
      else if (Date.now() - start > timeoutMs) { obs.disconnect(); resolve(''); }
    });

    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { obs.disconnect(); resolve(''); }, timeoutMs);
  });
}

// ===== MODAL =====
function createModal(patientInfo, rootEl) {
  currentRootEl = rootEl || currentRootEl;
  // Overlay
  currentOverlay = document.createElement('div');
  currentOverlay.className = 'reputy-overlay';
  currentOverlay.addEventListener('click', closeModal);
  document.body.appendChild(currentOverlay);
  
  // Modal
  currentModal = document.createElement('div');
  currentModal.className = 'reputy-modal';
  currentModal.addEventListener('click', (e) => e.stopPropagation());

  currentModal.innerHTML = `
    <div class="reputy-modal-header">
      <div class="reputy-modal-logo">
        <div class="reputy-logo-icon">${ICONS.logo}</div>
        <span>Reputy</span>
      </div>
      <button class="reputy-modal-close" id="reputy-close">${ICONS.close}</button>
    </div>
    <div class="reputy-modal-body">
      <p class="reputy-modal-title">Envoyer une demande d'avis</p>
      
      <!-- Choix du canal -->
      <div class="reputy-channel-selector">
        <button class="reputy-channel-btn active" data-channel="sms">
          ${ICONS.sms}
          <span>SMS</span>
        </button>
        <button class="reputy-channel-btn" data-channel="email">
          ${ICONS.email}
          <span>Email</span>
        </button>
      </div>
      
      <!-- Info patient -->
      ${patientInfo.name ? `
        <div class="reputy-patient-info">
          <div class="reputy-patient-name">${escapeHtml(patientInfo.name)}</div>
          <div class="reputy-patient-detail">${patientInfo.phone || patientInfo.email || 'Coordonnées à compléter'}</div>
        </div>
      ` : ''}
      
      <!-- Formulaire -->
      <div class="reputy-form-group">
        <label class="reputy-label">Nom du patient</label>
        <input type="text" class="reputy-input" id="reputy-name" 
               value="${escapeHtml(patientInfo.name)}" 
               placeholder="Prénom NOM">
      </div>
      
      <div class="reputy-form-group" id="reputy-phone-group">
        <label class="reputy-label">Téléphone</label>
        <input type="tel" class="reputy-input" id="reputy-phone" 
               value="${escapeHtml(patientInfo.phone)}" 
               placeholder="+33 6 12 34 56 78">
      </div>
      
      <div class="reputy-form-group" id="reputy-email-group" style="display: none;">
        <label class="reputy-label">Email</label>
        <input type="email" class="reputy-input" id="reputy-email" 
               value="${escapeHtml(patientInfo.email)}" 
               placeholder="patient@email.com">
      </div>

      ${(!patientInfo.email) ? `
        <div class="reputy-hint">
          Email non visible depuis l'agenda Doctolib.
          <button class="reputy-link-btn" id="reputy-fetch-email" type="button">Récupérer l’email depuis la fiche RDV</button>
        </div>
      ` : ''}

      <button class="reputy-btn-primary" id="reputy-send">
        ${ICONS.send}
        <span>Envoyer la demande</span>
      </button>
    </div>
  `;
  
  document.body.appendChild(currentModal);
  
  // Event listeners
  currentModal.querySelector('#reputy-close').addEventListener('click', closeModal);
  
  // Channel selector
  const channelBtns = currentModal.querySelectorAll('.reputy-channel-btn');
  channelBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      channelBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedChannel = btn.dataset.channel;
      
      // Toggle phone/email fields
      const phoneGroup = currentModal.querySelector('#reputy-phone-group');
      const emailGroup = currentModal.querySelector('#reputy-email-group');
      if (selectedChannel === 'sms') {
        phoneGroup.style.display = 'block';
        emailGroup.style.display = 'none';
      } else {
        phoneGroup.style.display = 'none';
        emailGroup.style.display = 'block';
      }
    });
  });
  
  // Send button
  currentModal.querySelector('#reputy-send').addEventListener('click', handleSend);

  // Bouton récupération email depuis fiche RDV (si présent)
  const fetchEmailBtn = currentModal.querySelector('#reputy-fetch-email');
  if (fetchEmailBtn) {
    fetchEmailBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      const original = fetchEmailBtn.textContent;
      fetchEmailBtn.disabled = true;
      fetchEmailBtn.textContent = 'Récupération...';
      try {
        if (lastRightClickAppointmentEl?.click) lastRightClickAppointmentEl.click();
        const email = await waitForEmail(2500);
        if (email) {
          const input = currentModal.querySelector('#reputy-email');
          if (input) input.value = email;
        } else {
          showToast('warning', 'Email non trouvé', 'Impossible de récupérer l’email automatiquement. Ajoutez-le manuellement.');
        }
      } catch (err) {
        console.error('[REPUTY] fetch email error', err);
        showToast('error', 'Erreur', 'Récupération email impossible.');
      } finally {
        fetchEmailBtn.disabled = false;
        fetchEmailBtn.textContent = original;
      }
    });
  }
  
  // Focus first empty field
  setTimeout(() => {
    const nameInput = currentModal.querySelector('#reputy-name');
    const phoneInput = currentModal.querySelector('#reputy-phone');
    if (!nameInput.value) {
      nameInput.focus();
    } else if (!phoneInput.value) {
      phoneInput.focus();
    }
  }, 100);
}

function closeModal() {
  if (currentOverlay) {
    currentOverlay.classList.add('reputy-fade-out');
    setTimeout(() => currentOverlay?.remove(), 200);
    currentOverlay = null;
  }
  if (currentModal) {
    currentModal.classList.add('reputy-fade-out');
    setTimeout(() => currentModal?.remove(), 200);
    currentModal = null;
  }
}

async function handleSend() {
  const sendBtn = currentModal.querySelector('#reputy-send');
  const originalContent = sendBtn.innerHTML;
  
  // Get form values
  const name = currentModal.querySelector('#reputy-name').value.trim();
  const phone = currentModal.querySelector('#reputy-phone').value.trim();
  const email = currentModal.querySelector('#reputy-email').value.trim();
  
  // Validation
  if (!name) {
    showToast('error', 'Erreur', 'Veuillez entrer le nom du patient.');
    return;
  }
  
  if (selectedChannel === 'sms' && !phone) {
    showToast('error', 'Erreur', 'Veuillez entrer le numéro de téléphone.');
    return;
  }
  
  if (selectedChannel === 'email' && !email) {
    showToast('error', 'Erreur', 'Veuillez entrer l\'adresse email.');
    return;
  }
  
  // Loading state
  sendBtn.disabled = true;
  sendBtn.innerHTML = `<div class="reputy-spinner"></div><span>Envoi en cours...</span>`;
  scheduleFailsafe();
  
  try {
    const response = await sendMessageToBackground({
      type: 'SEND_REVIEW_REQUEST',
      payload: {
        patientName: name,
        patientPhone: selectedChannel === 'sms' ? phone : undefined,
        patientEmail: selectedChannel === 'email' ? email : undefined,
        channel: selectedChannel
      }
    });
    
    if (response && response.success) {
      closeModal();
      showToast('success', 'Demande envoyée !', 
        `La demande d'avis a été envoyée par ${selectedChannel.toUpperCase()}.`,
        response.reviewUrl
      );
      markAsSeen(resolveRootFromEvent(lastClickEvent));
    } else {
      throw new Error(response?.error || 'Erreur inconnue');
    }
  } catch (error) {
    console.error('[REPUTY] Send error:', error);
    
    if (error.message.includes('API extension indisponible') || 
        error.message.includes('Extension context invalidated')) {
      showToast('warning', 'Extension rechargée', 
        'Veuillez recharger la page pour continuer.',
        null, true
      );
    } else {
      showToast('error', 'Erreur', error.message || 'Impossible d\'envoyer la demande.');
    }
  } finally {
    cancelFailsafe();
    cleanupOverlayAndBlockers();
    if (document.querySelector('.reputy-overlay')) {
      setTimeout(() => cleanupOverlayAndBlockers(), 1000);
    }
    sendBtn.disabled = false;
    sendBtn.innerHTML = originalContent;
  }
}

// ===== TOAST =====
function cleanupOverlayAndBlockers() {
  document.querySelectorAll('.reputy-overlay').forEach(el => el.remove());
  document.documentElement.style.pointerEvents = '';
  document.body.style.pointerEvents = '';
  document.body.style.overflow = '';
}

function cleanupToasts() {
  document.querySelectorAll('.reputy-toast').forEach(el => el.remove());
}

function scheduleFailsafe() {
  clearTimeout(failsafeTimer);
  failsafeTimer = setTimeout(() => cleanupOverlayAndBlockers(), 8000);
}

function cancelFailsafe() {
  clearTimeout(failsafeTimer);
}

function showToast(type, title, message, reviewUrl = null, showReload = false) {
  cleanupToasts();
  
  const toast = document.createElement('div');
  toast.className = `reputy-toast reputy-toast-${type}`;
  toast.style.pointerEvents = 'none';
  
  const icon = type === 'success' ? ICONS.check : ICONS.alert;
  
  let actionsHtml = '';
  if (reviewUrl) {
    actionsHtml = `
      <div class="reputy-toast-actions">
        <button class="reputy-toast-btn reputy-toast-btn-secondary" data-action="copy">
          ${ICONS.copy} Copier le lien
        </button>
      </div>
    `;
  } else if (showReload) {
    actionsHtml = `
      <div class="reputy-toast-actions">
        <button class="reputy-toast-btn reputy-toast-btn-primary" data-action="reload">
          ${ICONS.refresh} Recharger la page
        </button>
      </div>
    `;
  }
  
  toast.innerHTML = `
    <div class="reputy-toast-inner">
      <div class="reputy-toast-content">
        <div class="reputy-toast-icon">${icon}</div>
        <div class="reputy-toast-body">
          <div class="reputy-toast-title">${escapeHtml(title)}</div>
          <div class="reputy-toast-message">${escapeHtml(message)}</div>
          ${actionsHtml}
        </div>
      </div>
      <button class="reputy-toast-close">${ICONS.close}</button>
    </div>
  `;
  
  document.body.appendChild(toast);
  
  const closeToast = () => {
    toast.classList.add('reputy-fade-out');
    setTimeout(() => toast.remove(), 150);
  };
  
  toast.querySelector('.reputy-toast-close')?.addEventListener('click', closeToast);
  
  if (reviewUrl) {
    const copyBtn = toast.querySelector('[data-action="copy"]');
    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        const originalText = copyBtn.innerHTML;
        try {
          if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(reviewUrl);
          } else {
            const ta = document.createElement('textarea');
            ta.value = reviewUrl;
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            ta.remove();
          }
          copyBtn.innerHTML = `${ICONS.check} Copié ✅`;
          setTimeout(() => { copyBtn.innerHTML = originalText; }, 1000);
        } catch (e) {
          console.error('[REPUTY] Clipboard error', e);
          showToast('error', 'Copie impossible', 'Copiez manuellement : ' + reviewUrl);
        }
      });
    }
  }
  
  if (showReload) {
    const reloadBtn = toast.querySelector('[data-action="reload"]');
    if (reloadBtn) {
      reloadBtn.addEventListener('click', () => location.reload());
    }
  }
  
  const dismissTime = reviewUrl ? 8000 : 4000;
  setTimeout(() => {
    if (document.body.contains(toast)) {
      closeToast();
    }
  }, dismissTime);
}

// ===== INJECTION BOUTON "DEMANDER UN AVIS" =====
function injectReputyButtons() {
  // Chercher les boutons "Vu" de Doctolib
  const vuButtons = document.querySelectorAll('button');
  
  vuButtons.forEach(btn => {
    // Vérifier si c'est un bouton "Vu"
    const text = (btn.textContent || '').trim().toLowerCase();
    if (text !== 'vu') return;
    
    
    // Ne pas ajouter deux fois
    if (btn.dataset.reputyInjected) return;
    btn.dataset.reputyInjected = 'true';
    
    // Créer le bouton Reputy
    const reputyBtn = document.createElement('button');
    reputyBtn.className = 'reputy-vu-btn';
    reputyBtn.innerHTML = `<span class="reputy-btn-logo">${ICONS.logo}</span> Avis`;
    reputyBtn.title = 'Demander un avis avec Reputy';
    
    reputyBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation(); // limiter l'impact au bouton uniquement
      lastClickEvent = e;

      try {
        const rootEl = lastContextMenuEl || resolveRootFromEvent(e);
        const patientInfo = extractPatientInfo(rootEl);
        const now = Date.now();
        if (!patientInfo.phone && lastHoverPhone && (now - lastHoverTs) < 10000) {
          patientInfo.phone = lastHoverPhone;
          patientInfo.missing = false;
          console.log('[REPUTY][AGENDA] using hover phone');
        }
        if (!patientInfo.name && lastRightClickPatientName) {
          patientInfo.name = lastRightClickPatientName;
          patientInfo.missing = false;
          console.log('[REPUTY][AGENDA] name from appointment:', lastRightClickPatientName);
        }
        createModal(patientInfo, rootEl);
        // Failsafe overlay au cas où
        setTimeout(() => cleanupOverlayAndBlockers(), 1000);
      } catch (err) {
        console.error('[REPUTY] Click handler error:', err);
        cleanupOverlayAndBlockers?.();
        closeModal?.();
        showToast?.(
          'error',
          'Erreur',
          'Impossible d’ouvrir Reputy. Rechargez la page si besoin.'
        );
      }
    });
    
    // Insérer après le bouton Vu
    btn.parentNode?.insertBefore(reputyBtn, btn.nextSibling);
  });
}

function openReputyModal() {
  if (currentModal) {
    closeModal();
  }
  const patientInfo = extractPatientInfo();
  createModal(patientInfo);
}

// ===== HELPERS =====
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ===== INIT =====
function init() {
  console.log('[REPUTY] Initializing...');
  // Mémoriser la carte/popup au clic droit (agenda)
  document.addEventListener('contextmenu', (e) => {
    try {
      const el = e.target instanceof Element ? e.target : null;
      const txt = (el?.textContent || '').trim();
      if (txt.length > 2 && txt.length < 80) {
        lastRightClickPatientName = txt;
      }

      const path = e.composedPath?.() || [];
      lastRightClickAppointmentEl =
        path.find(node =>
          node instanceof Element &&
          (node.matches?.('[data-testid*="appointment"], [class*="appointment"], [class*="booking"], [role="button"]') ||
           node.querySelector?.('[data-testid*="patient"], [class*="patient"]'))
        ) || null;

      if (lastRightClickAppointmentEl) {
        const n = extractNameFromAppointmentEl(lastRightClickAppointmentEl);
        if (n) {
          lastRightClickPatientName = n;
          console.log('[REPUTY][AGENDA] name from appointment:', n);
        }
      }

      lastContextMenuEl = resolveRootFromEvent(e);
    } catch (_) {
      lastContextMenuEl = null;
    }
  }, true);

  sendMessageToBackground({ type: 'PING' })
    .then(r => console.log('[REPUTY] BG ping:', r))
    .catch(e => console.warn('[REPUTY] BG ping failed:', e));

  // Observer l'apparition de la fiche hover (agenda)
  const hoverObserver = new MutationObserver(() => {
    try {
      const info = extractFromHoverPreview();
      if (info.found && info.phone) {
        lastHoverPhone = info.phone;
        lastHoverTs = Date.now();
        console.log('[REPUTY][HOVER] phone:', lastHoverPhone);
      }
    } catch (_) {
      // ignore
    }
  });
  hoverObserver.observe(document.body, { childList: true, subtree: true });

  // Injection initiale
  injectReputyButtons();
  
  
  // Observer pour les pages SPA
  let scheduled = false;
const observer = new MutationObserver(() => {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    injectReputyButtons();
  });
});

observer.observe(document.body, { childList: true, subtree: true });

  
  // Badge Reputy (optionnel)
  // addReputyBadge();
  
  console.log('[REPUTY] Ready!');
}

// Démarrer
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

