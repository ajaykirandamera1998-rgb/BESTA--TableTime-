/* ==========================================================
   BESTA KIOSK — core app
   Sign up / Log in with Google, offers, saved results, leaderboard,
   data deletion, policy viewer, idle reset and backend calls.
   Nothing about a person is kept in browser storage: the session
   lives in memory and is wiped on sign-out or after inactivity.
   ========================================================== */
window.BESTA = (function () {
  'use strict';
  const CFG = window.BESTA_CONFIG;
  const $ = (id) => document.getElementById(id);
  const games = {};
  let session = null;           // { signedIn:true, name, idToken }
  let currentScreen = 'screen-home';
  let legalReturn = 'screen-home';
  let authMode = 'signup';      // which tab the Google button belongs to
  let idleTimer = null;
  let googleRequested = false;
  let googleReady = false;
  let toastTimer = null;
  let lbCache = { at: 0, rows: null };

  const TITLES = {
    'screen-home': 'Sign up or log in',
    'screen-reconsent': 'Updated Privacy Policy',
    'screen-offers': 'Coupons and offers',
    'screen-picker': 'Choose a game',
    'screen-delete': 'Delete my data',
    'screen-tt-capture': 'Table Time — take your photo',
    'screen-tt-puzzle': 'Table Time — puzzle',
    'screen-tt-tutorial': 'Table Time — how to play',
    'screen-tt-win': 'Table Time — solved',
    'screen-tt-leaderboard': 'Table Time — fastest times',
    'screen-durga': 'Dasara Arcade',
    'screen-legal': 'Policy'
  };
  const CHROME_OFF = new Set(['screen-tt-puzzle', 'screen-tt-tutorial', 'screen-durga', 'screen-legal']);

  // ---------- Small helpers ----------
  const icon = (name) => '<svg class="fa" aria-hidden="true"><use href="#fa-' + name + '"/></svg>';
  const fmtTime = (s) => Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  function escapeHtml(str) { const d = document.createElement('div'); d.textContent = String(str == null ? '' : str); return d.innerHTML; }

  function toast(message) {
    const t = $('toast');
    t.textContent = message; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 4500);
  }

  function setMsg(id, text, kind) {
    const el = $(id); if (!el) return;
    el.textContent = text || '';
    el.className = 'msg' + (kind ? ' ' + kind : '');
  }

  function busy(btn, on, label) {
    if (on) { btn.dataset.label = btn.innerHTML; btn.innerHTML = '<span class="spinner" aria-hidden="true"></span> ' + (label || 'Please wait…'); btn.disabled = true; btn.setAttribute('aria-busy', 'true'); }
    else { if (btn.dataset.label) btn.innerHTML = btn.dataset.label; btn.disabled = false; btn.removeAttribute('aria-busy'); }
  }

  function friendlyError(e) {
    const m = String((e && e.message) || '');
    if (e && e.userMessage) return e.userMessage;
    if (e && e.name === 'AbortError') return 'That took too long. Please check the internet connection and try again.';
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'We could not reach the server. Please check the internet connection and try again.';
    if (/http-4\d\d/.test(m)) return 'The request was not accepted. Please try again.';
    if (/http-5\d\d/.test(m)) return 'The service is busy right now. Please try again in a moment.';
    return 'Something went wrong. Please try again.';
  }

  // ---------- Screens ----------
  function showScreen(id) {
    const el = $(id); if (!el) return;
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    currentScreen = id;
    el.classList.add('active');
    el.scrollTop = 0;
    $('app').dataset.chrome = CHROME_OFF.has(id) ? 'off' : 'on';
    document.body.dataset.screen = id;
    document.title = (TITLES[id] ? TITLES[id] + ' | ' : '') + 'Besta — The Indian Kitchen';
    const h = el.querySelector('h1, h2');
    if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    touch();
  }

  // ---------- Backend (through the private proxy) ----------
  async function request(method, payload, params) {
    if (!CFG.BACKEND_URL) throw Object.assign(new Error('not-configured'), { userMessage: 'This service is not available right now.' });
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const opts = method === 'GET'
        ? { signal: ctrl.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' }
        : { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(payload),
            signal: ctrl.signal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' };
      const url = method === 'GET' ? CFG.BACKEND_URL + '?' + new URLSearchParams(params) : CFG.BACKEND_URL;
      const res = await fetch(url, opts);
      if (!res.ok) throw new Error('http-' + res.status);
      return await res.json();
    } finally { clearTimeout(timer); }
  }

  // The only thing sent to identify a player is the Google token; the server reads the email from it.
  const auth = () => (session && session.idToken ? { idToken: session.idToken } : null);

  async function post(action, extra) {
    const a = auth();
    if (!a) throw Object.assign(new Error('not-signed-in'), { userMessage: 'Please log in to do that.' });
    const r = await request('POST', Object.assign({ action }, a, extra || {}));
    if (r.status !== 'ok') throw Object.assign(new Error('server'), { userMessage: r.message || 'Something went wrong. Please try again.' });
    return r;
  }

  // ---------- Idle reset (the next guest must never see the last guest's session) ----------
  function touch() {
    clearTimeout(idleTimer);
    if (!CFG.IDLE_SECONDS) return;
    idleTimer = setTimeout(() => { if (currentScreen !== 'screen-home') endSession('Returned to the start screen after a period of inactivity.'); }, CFG.IDLE_SECONDS * 1000);
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach((ev) => document.addEventListener(ev, touch, { passive: true }));

  function endSession(message) {
    session = null;
    if (window.google && window.google.accounts && googleReady) { try { window.google.accounts.id.disableAutoSelect(); } catch (e) { /* ignore */ } }
    ['ageCheck', 'consentCheck', 'rcAge', 'rcConsent', 'offersConsent'].forEach((id) => { const c = $(id); if (c) c.checked = false; });
    $('offersPhone').value = '';
    ['signupMsg', 'loginMsg', 'offersMsg', 'deleteMsg', 'reconsentMsg'].forEach((id) => setMsg(id, ''));
    $('toSignupBtn').hidden = true;
    $('legalFrame').src = 'about:blank';
    document.dispatchEvent(new Event('besta:reset')); // games erase photos, stop audio, etc.
    setAuthTab('signup');
    refreshSignupLock();
    showScreen('screen-home');
    loadLeaderboards();
    if (message) toast(message);
  }

  // ---------- Sign up / Log in with Google ----------
  function decodeJwt(jwt) {
    try {
      const part = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(decodeURIComponent(escape(atob(part))));
    } catch (e) { return {}; }
  }

  function loadGoogle() {
    if (googleRequested || !CFG.GOOGLE_CLIENT_ID) return;
    googleRequested = true;
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.defer = true;
    s.onload = initGoogle;
    s.onerror = () => {
      googleRequested = false;
      const msg = 'Google could not be reached. Please check the internet connection and reload the page.';
      setMsg('signupMsg', msg, 'error'); setMsg('loginMsg', msg, 'error');
    };
    document.head.appendChild(s);
  }

  function initGoogle() {
    const gid = window.google.accounts.id;
    gid.initialize({ client_id: CFG.GOOGLE_CLIENT_ID, callback: onCredential, auto_select: false, cancel_on_tap_outside: true });
    gid.disableAutoSelect();
    gid.renderButton($('googleBtnSignup'), { theme: 'outline', size: 'large', shape: 'rectangular', text: 'signup_with', logo_alignment: 'left', width: 300 });
    gid.renderButton($('googleBtnLogin'), { theme: 'outline', size: 'large', shape: 'rectangular', text: 'signin_with', logo_alignment: 'left', width: 300 });
    googleReady = true;
    $('googleSkeletonSignup').hidden = true; $('googleSkeletonLogin').hidden = true;
  }

  function setAuthTab(mode) {
    authMode = mode;
    const signup = mode === 'signup';
    $('tabSignup').setAttribute('aria-selected', String(signup)); $('tabSignup').tabIndex = signup ? 0 : -1;
    $('tabLogin').setAttribute('aria-selected', String(!signup)); $('tabLogin').tabIndex = signup ? -1 : 0;
    $('panelSignup').hidden = !signup; $('panelLogin').hidden = signup;
    setMsg('signupMsg', ''); setMsg('loginMsg', ''); $('toSignupBtn').hidden = true;
  }

  // The Google button stays locked until the visitor confirms their age and gives consent.
  function refreshSignupLock() {
    const ok = $('ageCheck').checked && $('consentCheck').checked;
    $('googleWrapSignup').classList.toggle('locked', !ok);
    $('googleWrapSignup').setAttribute('aria-disabled', String(!ok));
    $('signupHint').textContent = ok ? '' : 'Tick both boxes to continue with Google.';
  }

  async function onCredential(resp) {
    const claims = decodeJwt(resp.credential);
    const mode = authMode;
    const msgId = mode === 'signup' ? 'signupMsg' : 'loginMsg';
    if (mode === 'signup' && !($('ageCheck').checked && $('consentCheck').checked)) { setMsg(msgId, 'Please tick both boxes first.', 'error'); return; }
    session = { signedIn: true, name: String(claims.name || ''), idToken: resp.credential };
    setMsg(msgId, mode === 'signup' ? 'Creating your account…' : 'Checking your account…');
    try {
      if (mode === 'signup') {
        const r = await post('register', { ageConfirmed: true, consentVersion: CFG.POLICY_VERSION });
        setMsg(msgId, '');
        renderPicker();
        if (r.isNew) showScreen('screen-offers');
        else { showScreen('screen-picker'); toast('You already have an account, so we logged you in.'); }
      } else {
        const r = await post('login', { consentVersion: CFG.POLICY_VERSION });
        if (!r.found) {
          session = null;
          setMsg(msgId, 'We could not find an account for this Google account. Please sign up first.', 'error');
          $('toSignupBtn').hidden = false;
          return;
        }
        if (r.name) session.name = r.name;
        setMsg(msgId, '');
        if (r.needsConsent) { setMsg('reconsentMsg', ''); showScreen('screen-reconsent'); }
        else { renderPicker(); showScreen('screen-picker'); }
      }
    } catch (e) {
      session = null;
      setMsg(msgId, friendlyError(e), 'error');
    }
  }

  function wireAuth() {
    $('tabSignup').addEventListener('click', () => setAuthTab('signup'));
    $('tabLogin').addEventListener('click', () => setAuthTab('login'));
    $('toSignupBtn').addEventListener('click', () => setAuthTab('signup'));
    $('authTabs').addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const next = authMode === 'signup' ? 'login' : 'signup'; setAuthTab(next); $(next === 'signup' ? 'tabSignup' : 'tabLogin').focus(); }
    });
    ['ageCheck', 'consentCheck'].forEach((id) => $(id).addEventListener('change', refreshSignupLock));
    $('signOutBtn').addEventListener('click', () => endSession());

    // The policy changed since this person last agreed: ask again before continuing.
    $('reconsentBtn').addEventListener('click', async () => {
      if (!($('rcAge').checked && $('rcConsent').checked)) return setMsg('reconsentMsg', 'Please tick both boxes to continue.', 'error');
      const btn = $('reconsentBtn'); busy(btn, true, 'Saving…');
      try { await post('register', { ageConfirmed: true, consentVersion: CFG.POLICY_VERSION }); renderPicker(); showScreen('screen-picker'); }
      catch (e) { setMsg('reconsentMsg', friendlyError(e), 'error'); }
      finally { busy(btn, false); }
    });
    $('reconsentCancelBtn').addEventListener('click', () => endSession());
  }

  // ---------- Leaderboard (public: first name + last initial) ----------
  function fillLeaderboard(el, rows, limit) {
    if (!rows.length) { el.innerHTML = '<p class="muted">No times yet. Sign up and be the first to set one.</p>'; return; }
    const colours = ['#8A6A00', '#555B61', '#8A4B1E'];
    el.innerHTML = rows.slice(0, limit).map((r, i) =>
      '<div class="lb-row"><span class="lb-rank">' + (i < 3 ? '<span style="color:' + colours[i] + '">' + icon('medal') + '</span><span class="visually-hidden">' + (i + 1) + '</span>' : (i + 1)) + '</span>' +
      '<span class="lb-name">' + escapeHtml(r.name) + '</span><span class="lb-time">' + fmtTime(Number(r.timeSeconds) || 0) + '</span></div>').join('');
  }

  const skeletonRows = (n) => Array.from({ length: n }, () => '<div class="skeleton-row"><span class="skeleton" style="width:28px;height:18px;"></span><span class="skeleton" style="flex:1;height:18px;"></span><span class="skeleton" style="width:48px;height:18px;"></span></div>').join('');

  async function loadLeaderboards(force) {
    const targets = [['homeLb', 5], ['pickerLb', 10]].map(([id, n]) => [$(id), n]);
    if (!force && lbCache.rows && Date.now() - lbCache.at < 20000) { targets.forEach(([el, n]) => fillLeaderboard(el, lbCache.rows, n)); return; }
    targets.forEach(([el]) => { el.innerHTML = skeletonRows(3); el.setAttribute('aria-busy', 'true'); });
    try {
      const rows = await request('GET', null, { action: 'leaderboard', game: 'orderup' });
      if (!Array.isArray(rows)) throw new Error('bad-response');
      lbCache = { at: Date.now(), rows };
      targets.forEach(([el, n]) => fillLeaderboard(el, rows, n));
    } catch (e) {
      targets.forEach(([el]) => {
        el.innerHTML = '';
        const p = document.createElement('p'); p.className = 'msg error'; p.textContent = 'The leaderboard could not be loaded.';
        const b = document.createElement('button'); b.type = 'button'; b.className = 'btn-text'; b.textContent = 'Try again';
        b.addEventListener('click', () => loadLeaderboards(true));
        el.appendChild(p); el.appendChild(b);
      });
    } finally { targets.forEach(([el]) => el.removeAttribute('aria-busy')); }
  }

  // ---------- Picker ----------
  function isGameActive(g) {
    if (g.alwaysOn) return true;
    const d = new Date();   // the tablet's own local date, so a game ends at midnight in India
    const today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    return today >= g.startDate && today <= g.endDate;
  }

  async function refreshResults() {
    const box = $('myResults');
    box.innerHTML = '<span class="skeleton" style="width:min(320px,80%);height:18px;margin:0 auto;"></span>';
    try {
      const r = await post('myResults');
      const parts = [];
      if (r.bestTime) parts.push('Your best Table Time: ' + fmtTime(r.bestTime));
      if (r.arcadeBest != null) parts.push('Your best Dasara Arcade score: ' + Number(r.arcadeBest).toLocaleString());
      box.textContent = parts.length ? parts.join('  ·  ') : 'No results saved yet. Play a game to set your first one.';
    } catch (e) { box.textContent = ''; }
  }

  function renderPicker() {
    const first = String((session && session.name) || '').trim().split(/\s+/)[0];
    $('pickerGreeting').textContent = first ? 'Welcome, ' + first : 'Welcome';
    const grid = $('gameGrid'); grid.innerHTML = '';
    CFG.GAMES.filter(isGameActive).forEach((g) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'game-tile';
      b.innerHTML = '<span class="icon">' + icon(g.icon) + '</span><span class="tile-title">' + escapeHtml(g.name) + '</span><span class="tile-blurb">' + escapeHtml(g.blurb) + '</span>';
      b.addEventListener('click', () => { if (games[g.id]) games[g.id].start(); });
      grid.appendChild(b);
    });
    refreshResults();
    loadLeaderboards(true);
  }

  function backToPicker() { renderPicker(); showScreen('screen-picker'); }

  // ---------- Coupons and offers (optional, separate consent) ----------
  function wireOffers() {
    $('offersBtn').addEventListener('click', () => { setMsg('offersMsg', ''); showScreen('screen-offers'); });
    $('offersSkipBtn').addEventListener('click', backToPicker);
    $('offersSaveBtn').addEventListener('click', async () => {
      const phone = $('offersPhone').value.trim();
      if (!phone) return setMsg('offersMsg', 'Enter your mobile number, or choose “No thanks”.', 'error');
      if (!$('offersConsent').checked) return setMsg('offersMsg', 'Please tick the box to agree to receive coupons and offers, or choose “No thanks”.', 'error');
      const btn = $('offersSaveBtn');
      busy(btn, true, 'Saving…'); setMsg('offersMsg', '');
      try {
        await post('saveOffersOptIn', { phone, consent: true, consentVersion: CFG.POLICY_VERSION });
        $('offersPhone').value = ''; $('offersConsent').checked = false;
        toast('Thank you. Your number has been saved.');
        backToPicker();
      } catch (e) { setMsg('offersMsg', friendlyError(e), 'error'); }
      finally { busy(btn, false); }
    });
  }

  // ---------- Delete my data ----------
  function wireDelete() {
    $('deleteBtn').addEventListener('click', () => { setMsg('deleteMsg', ''); showScreen('screen-delete'); });
    $('deleteCancelBtn').addEventListener('click', backToPicker);
    $('deleteConfirmBtn').addEventListener('click', async () => {
      const btn = $('deleteConfirmBtn');
      busy(btn, true, 'Deleting…'); setMsg('deleteMsg', '');
      try {
        await post('deleteMyData');
        lbCache = { at: 0, rows: null };
        endSession('Your data has been deleted.');
      } catch (e) { setMsg('deleteMsg', friendlyError(e), 'error'); }
      finally { busy(btn, false); }
    });
  }

  // ---------- Policy viewer (keeps the kiosk session; nothing opens in a new tab) ----------
  function openLegal(href, title) {
    legalReturn = currentScreen === 'screen-legal' ? legalReturn : currentScreen;
    $('legalTitle').textContent = title || 'Policy';
    $('legalFrame').title = title || 'Policy';
    $('legalFrame').src = href;
    showScreen('screen-legal');
  }
  function wireLegal() {
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[data-legal]');
      if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault();
      if (!$('cookieModal').hidden) window.BESTA_CONSENT.closeSettings();
      openLegal(a.getAttribute('href'), a.dataset.legal);
    });
    $('legalBackBtn').addEventListener('click', () => { $('legalFrame').src = 'about:blank'; showScreen(legalReturn); });
  }

  // ---------- Contact bar (mobile) and footer details ----------
  function buildContact() {
    const c = CFG.CONTACT || {};
    const bar = $('ctaBar'); bar.innerHTML = '';
    const maps = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent((c.name || '') + ', ' + (c.address || ''));
    const add = (cls, href, ic, label, ext) => {
      const a = document.createElement('a');
      a.className = 'btn ' + cls; a.href = href; a.innerHTML = icon(ic) + label;
      if (ext) { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
      bar.appendChild(a);
    };
    if (c.phone) add('primary', 'tel:' + c.phone.replace(/[^+\d]/g, ''), 'phone', 'Call', false);
    add(c.phone ? '' : 'primary', maps, 'location-dot', 'Directions', true);
    if (c.email) add('', 'mailto:' + c.email, 'envelope', 'Email', false);
    if (c.phone) {
      const addr = $('footerAddress');
      const a = document.createElement('a');
      a.href = 'tel:' + c.phone.replace(/[^+\d]/g, ''); a.textContent = c.phone;
      addr.appendChild(document.createTextNode(' · ')); addr.appendChild(a);
    }
  }

  function enterFromIntro() {   // the intro fades out by itself; the home screen is already underneath
    window.BESTA_CONSENT.showIfUndecided();   // asked after the intro, never over it
    if (CFG.GOOGLE_CLIENT_ID) loadGoogle();
    const h = $('homeTitle'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    touch();
  }

  document.addEventListener('DOMContentLoaded', () => {
    window.BESTA_CONSENT.init();
    wireAuth(); wireOffers(); wireDelete(); wireLegal(); buildContact();
    const hasClient = !!CFG.GOOGLE_CLIENT_ID;
    $('authUnavailable').hidden = hasClient;
    if (!hasClient) { $('authTabs').hidden = true; $('panelSignup').hidden = true; $('panelLogin').hidden = true; }
    refreshSignupLock();
    loadLeaderboards();
  });

  // Messages from the embedded game keep the idle timer alive.
  window.addEventListener('message', (e) => { if (e.data && e.data.type === 'durga:activity') touch(); });

  return {
    showScreen, request, post, auth, toast, setMsg, busy, friendlyError, fmtTime, escapeHtml, icon, touch,
    registerGame: (id, h) => { games[id] = h; }, backToPicker, enterFromIntro, endSession,
    isSignedIn: () => !!(session && session.signedIn)
  };
})();
