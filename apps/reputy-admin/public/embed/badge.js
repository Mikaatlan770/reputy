/**
 * Reputy Badge - Script d'intégration
 * Affiche un badge compact avec la note moyenne
 */
(function() {
  'use strict';

  // Configuration
  var API_BASE = window.REPUTY_API_BASE || (window.location.origin);
  var STORAGE_KEY = 'reputy_badge_impression';
  var IMPRESSION_COOLDOWN = 5 * 60 * 1000; // 5 minutes

  // Trouver le conteneur et la clé
  var container = document.getElementById('reputy-badge');
  if (!container) {
    console.warn('[Reputy] Conteneur #reputy-badge non trouvé');
    return;
  }

  var publicKey = container.getAttribute('data-reputy-key');
  if (!publicKey) {
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

  // Anti-spam
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
  function renderStars(rating) {
    var html = '';
    for (var i = 1; i <= 5; i++) {
      var filled = i <= rating;
      html += '<svg width="20" height="20" viewBox="0 0 24 24" fill="' + (filled ? '#fbbf24' : '#e5e7eb') + '" style="display:inline-block;vertical-align:middle;">' +
        '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>' +
        '</svg>';
    }
    return html;
  }

  // Charger et afficher
  function loadAndRender() {
    container.innerHTML = '<div style="display:inline-block;padding:8px 12px;background:#f3f4f6;border-radius:8px;font-family:-apple-system,sans-serif;font-size:13px;color:#6b7280;">...</div>';

    var xhr = new XMLHttpRequest();
    xhr.open('GET', API_BASE + '/api/embed/items/' + publicKey, true);
    xhr.onreadystatechange = function() {
      if (xhr.readyState !== 4) return;

      if (xhr.status !== 200) {
        container.innerHTML = '';
        return;
      }

      try {
        var data = JSON.parse(xhr.responseText);
        render(data);

        if (canSendImpression()) {
          sendEvent('IMPRESSION');
          markImpression();
        }
      } catch (e) {
        container.innerHTML = '';
      }
    };
    xhr.send();
  }

  // Rendu du badge
  function render(data) {
    var cfg = data.config || {};
    var accent = cfg.accentColor || '#667eea';

    if (data.totalCount === 0) {
      container.innerHTML = '';
      return;
    }

    var html = '<a href="' + API_BASE + '/reviews/' + publicKey + '" target="_blank" ' +
      'style="display:inline-flex;align-items:center;gap:10px;padding:10px 16px;' +
      'background:#fff;border:1px solid #e5e7eb;border-radius:12px;' +
      'text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,sans-serif;' +
      'box-shadow:0 2px 4px rgba(0,0,0,0.05);transition:box-shadow 0.2s;" ' +
      'onmouseover="this.style.boxShadow=\'0 4px 8px rgba(0,0,0,0.1)\'" ' +
      'onmouseout="this.style.boxShadow=\'0 2px 4px rgba(0,0,0,0.05)\'">';

    // Logo R
    html += '<div style="width:36px;height:36px;background:linear-gradient(135deg,' + accent + ',#764ba2);border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:18px;">R</div>';

    // Rating
    html += '<div>';
    html += '<div style="display:flex;align-items:center;gap:4px;">';
    html += renderStars(Math.round(data.averageRating));
    html += '</div>';
    html += '<div style="font-size:12px;color:#6b7280;margin-top:2px;">';
    html += '<strong style="color:#1f2937;">' + data.averageRating.toFixed(1) + '</strong> / 5 · ' + data.totalCount + ' avis';
    html += '</div>';
    html += '</div>';

    html += '</a>';

    container.innerHTML = html;

    // Tracking clic
    var link = container.querySelector('a');
    if (link) {
      link.addEventListener('click', function() {
        sendEvent('CLICK');
      });
    }
  }

  loadAndRender();
})();
