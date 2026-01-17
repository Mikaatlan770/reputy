/**
 * Reputy Widget - Script d'intégration
 * Affiche les avis sur le site du client
 */
(function() {
  'use strict';

  // Configuration
  var API_BASE = window.REPUTY_API_BASE || (window.location.origin);
  var STORAGE_KEY = 'reputy_widget_impression';
  var IMPRESSION_COOLDOWN = 5 * 60 * 1000; // 5 minutes

  // Trouver le conteneur et la clé
  var container = document.getElementById('reputy-widget');
  if (!container) {
    console.warn('[Reputy] Conteneur #reputy-widget non trouvé');
    return;
  }

  var publicKey = container.getAttribute('data-reputy-key');
  if (!publicKey) {
    // Essayer via l'URL du script
    var scripts = document.getElementsByTagName('script');
    for (var i = 0; i < scripts.length; i++) {
      var src = scripts[i].src || '';
      var match = src.match(/[?&]key=([^&]+)/);
      if (match) {
        publicKey = match[1];
        break;
      }
    }
  }

  if (!publicKey) {
    console.warn('[Reputy] Clé publique non trouvée');
    return;
  }

  // Anti-spam: vérifier si on a déjà envoyé une impression récemment
  function canSendImpression() {
    try {
      var last = localStorage.getItem(STORAGE_KEY + '_' + publicKey);
      if (!last) return true;
      return (Date.now() - parseInt(last, 10)) > IMPRESSION_COOLDOWN;
    } catch (e) {
      return true;
    }
  }

  function markImpression() {
    try {
      localStorage.setItem(STORAGE_KEY + '_' + publicKey, Date.now().toString());
    } catch (e) {}
  }

  // Envoyer un événement
  function sendEvent(type) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('POST', API_BASE + '/api/embed/event', true);
      xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(JSON.stringify({
        publicKey: publicKey,
        type: type,
        pageUrl: window.location.href,
        referrer: document.referrer || undefined
      }));
    } catch (e) {}
  }

  // Générer les étoiles
  function renderStars(rating, size) {
    size = size || 16;
    var html = '';
    for (var i = 1; i <= 5; i++) {
      var filled = i <= rating;
      html += '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="' + (filled ? '#fbbf24' : '#e5e7eb') + '" style="display:inline-block;vertical-align:middle;">' +
        '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>' +
        '</svg>';
    }
    return html;
  }

  // Formater la date
  function formatDate(dateStr) {
    try {
      var d = new Date(dateStr);
      return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) {
      return dateStr;
    }
  }

  // Charger et afficher les avis
  function loadAndRender() {
    container.innerHTML = '<div style="text-align:center;padding:20px;color:#6b7280;">Chargement des avis...</div>';

    var xhr = new XMLHttpRequest();
    xhr.open('GET', API_BASE + '/api/embed/items/' + publicKey, true);
    xhr.onreadystatechange = function() {
      if (xhr.readyState !== 4) return;

      if (xhr.status !== 200) {
        container.innerHTML = '<div style="text-align:center;padding:20px;color:#ef4444;">Impossible de charger les avis</div>';
        return;
      }

      try {
        var data = JSON.parse(xhr.responseText);
        render(data);

        // Envoyer l'impression
        if (canSendImpression()) {
          sendEvent('IMPRESSION');
          markImpression();
        }
      } catch (e) {
        container.innerHTML = '<div style="text-align:center;padding:20px;color:#ef4444;">Erreur de chargement</div>';
      }
    };
    xhr.send();
  }

  // Rendu du widget
  function render(data) {
    var cfg = data.config || {};
    var accent = cfg.accentColor || '#667eea';
    var items = data.items || [];

    if (items.length === 0) {
      container.innerHTML = '<div style="text-align:center;padding:20px;color:#6b7280;">Aucun avis disponible</div>';
      return;
    }

    var html = '<div class="reputy-widget" style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;max-width:100%;background:#fff;border-radius:12px;box-shadow:0 4px 6px -1px rgba(0,0,0,0.1);overflow:hidden;">';
    
    // Header
    html += '<div style="padding:16px 20px;background:linear-gradient(135deg,' + accent + ' 0%,#764ba2 100%);color:#fff;">';
    html += '<div style="font-size:18px;font-weight:600;">' + (data.locationName || 'Avis clients') + '</div>';
    html += '<div style="display:flex;align-items:center;gap:8px;margin-top:4px;">';
    html += renderStars(Math.round(data.averageRating), 18);
    html += '<span style="font-size:14px;">' + data.averageRating.toFixed(1) + '/5 (' + data.totalCount + ' avis)</span>';
    html += '</div></div>';

    // Liste des avis
    html += '<div style="max-height:400px;overflow-y:auto;">';
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      html += '<div style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">';
      html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;">';
      html += '<div>';
      html += '<div style="font-weight:600;color:#1f2937;">' + item.initials + '</div>';
      if (cfg.showDate) {
        html += '<div style="font-size:12px;color:#9ca3af;margin-top:2px;">' + formatDate(item.date) + '</div>';
      }
      html += '</div>';
      if (cfg.showStars) {
        html += '<div>' + renderStars(item.rating, 14) + '</div>';
      }
      html += '</div>';
      if (item.text) {
        html += '<p style="margin:8px 0 0;font-size:14px;color:#374151;line-height:1.5;">"' + item.text + '"</p>';
      }
      if (cfg.showSource) {
        html += '<div style="margin-top:8px;font-size:11px;color:#9ca3af;">';
        html += item.source === 'google' ? '📍 Google' : '✓ Vérifié';
        html += '</div>';
      }
      html += '</div>';
    }
    html += '</div>';

    // Footer
    html += '<div style="padding:12px 20px;background:#f9fafb;text-align:center;border-top:1px solid #e5e7eb;">';
    html += '<a href="' + API_BASE + '/reviews/' + publicKey + '" target="_blank" style="color:' + accent + ';font-size:13px;text-decoration:none;" onclick="try{parent.postMessage({type:\'reputy_click\',key:\'' + publicKey + '\'},\'*\');}catch(e){}">';
    html += 'Voir tous les avis →</a>';
    html += '</div>';

    html += '</div>';

    container.innerHTML = html;

    // Tracking du clic
    var link = container.querySelector('a');
    if (link) {
      link.addEventListener('click', function() {
        sendEvent('CLICK');
      });
    }
  }

  // Lancer
  loadAndRender();
})();
