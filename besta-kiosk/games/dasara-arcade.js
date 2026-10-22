/* ==========================================================
   DASARA ARCADE — hosts the Durga Maa vs Asuras game
   (games/durga/index.html, one self-contained file) in a frame.
   A finished run is saved only for signed-in players. The game id
   stays "demonhunt" so existing rows in the Sheet keep working.
   ========================================================== */
(function () {
  'use strict';
  const GAME_URL = 'games/durga/index.html';
  const LOAD_TIMEOUT_MS = 10000;
  const $ = (id) => document.getElementById(id);
  let loadTimer = null;

  function showLoading() {
    $('durgaStatus').className = 'durga-status';
    $('durgaStatusText').textContent = 'Loading Dasara Arcade…';
    $('durgaRetryBtn').hidden = true;
  }
  function showFailed() {
    $('durgaStatus').className = 'durga-status failed';
    $('durgaStatusText').textContent = 'The game could not start. Please check the internet connection and try again.';
    $('durgaRetryBtn').hidden = false;
  }
  function load() {
    showLoading();
    clearTimeout(loadTimer);
    $('durgaFrame').src = 'about:blank';
    // ?hs=1 lets the game keep its best score on this device, only if the visitor allowed functional storage
    const hs = window.BESTA_CONSENT.functionalAllowed() ? '1' : '0';
    setTimeout(() => { $('durgaFrame').src = GAME_URL + '?hs=' + hs + '&t=' + Date.now(); }, 30);
    loadTimer = setTimeout(showFailed, LOAD_TIMEOUT_MS);
  }
  function unload() { clearTimeout(loadTimer); $('durgaFrame').src = 'about:blank'; }   // stops the game loop and its sound

  function start() { BESTA.showScreen('screen-durga'); load(); }
  function leave() { unload(); BESTA.backToPicker(); }

  window.addEventListener('message', (e) => {
    if (e.source !== $('durgaFrame').contentWindow) return;
    const d = e.data;
    if (!d || typeof d !== 'object') return;
    if (d.type === 'durga:ready') { clearTimeout(loadTimer); $('durgaStatus').className = 'durga-status hidden'; return; }
    if (d.type === 'durga:activity') { BESTA.touch(); return; }
    if (d.type === 'durga:result' && BESTA.isSignedIn()) {
      BESTA.post('submitPlay', {
        game: 'demonhunt', score: Number(d.score) || 0,
        difficulty: 'Level ' + (Number(d.level) || 1) + (d.victory ? ' (cleared all)' : '')
      }).catch(() => { BESTA.toast('Your score could not be saved this time.'); });
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    $('durgaBackBtn').addEventListener('click', leave);
    $('durgaRetryBtn').addEventListener('click', load);
    document.addEventListener('besta:reset', unload);
  });

  BESTA.registerGame('demonhunt', { start });
})();
