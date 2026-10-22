/* ==========================================================
   Cookie / storage choices. Standard categories, three equal buttons,
   nothing optional is on until the visitor says so, and the choice can
   be changed at any time from "Cookie settings" in the footer.
   Google Sign-In is described in the text but is not a toggle here:
   it is the sign-in service itself, run by Google.
   ========================================================== */
window.BESTA_CONSENT = (function () {
  'use strict';
  const KEY = 'besta_consent_v2';
  let memory = null;      // used if the browser blocks localStorage
  let lastFocus = null;
  const $ = (id) => document.getElementById(id);

  function read() {
    try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v) return v; } catch (e) { /* blocked */ }
    return memory;
  }
  function write(functional) {
    const v = { functional: !!functional, at: new Date().toISOString(), v: 2 };
    memory = v;
    try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) { /* blocked */ }
    if (!functional) { try { localStorage.removeItem('besta_dasara_highscore'); } catch (e) { /* blocked */ } }
    return v;
  }

  const decided = () => !!read();
  const functionalAllowed = () => { const v = read(); return !!(v && v.functional); };

  function showBanner() { $('cookieBanner').hidden = false; }
  function hideBanner() { $('cookieBanner').hidden = true; }
  function showIfUndecided() { if (!decided()) showBanner(); }

  function openSettings() {
    lastFocus = document.activeElement;
    $('cookieFunctional').checked = functionalAllowed();
    hideBanner();
    $('cookieModal').hidden = false;
    $('cookieFunctional').focus();
  }
  function closeSettings() {
    $('cookieModal').hidden = true;
    if (!decided()) showBanner();    // still undecided: the banner comes back
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function choose(functional) { write(functional); hideBanner(); $('cookieModal').hidden = true; }

  function init() {
    $('cookieRejectBtn').addEventListener('click', () => choose(false));
    $('cookieAcceptBtn').addEventListener('click', () => choose(true));
    $('cookieCustomiseBtn').addEventListener('click', openSettings);
    $('cmRejectBtn').addEventListener('click', () => choose(false));
    $('cmAcceptBtn').addEventListener('click', () => choose(true));
    $('cmSaveBtn').addEventListener('click', () => choose($('cookieFunctional').checked));
    $('cookieSettingsBtn').addEventListener('click', openSettings);
    $('cookieModal').addEventListener('click', (e) => { if (e.target === $('cookieModal')) closeSettings(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('cookieModal').hidden) closeSettings(); });
  }

  return { init, showIfUndecided, decided, functionalAllowed, openSettings, closeSettings, choose };
})();
