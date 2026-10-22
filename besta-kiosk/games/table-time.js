/* ==========================================================
   TABLE TIME — selfie jigsaw, fixed 5x5, pick-and-swap.
   Tap a tile to pick it up (it gets a gold frame), tap another
   tile to swap places. The photo never leaves this device and is
   erased when the game ends. The game id stays "orderup" so older
   rows in the Sheet keep working.
   ========================================================== */
(function () {
  'use strict';
  const GRID = 5;
  const MAX_FILE_BYTES = 15 * 1024 * 1024;
  const $ = (id) => document.getElementById(id);

  let boardPx = 0, tilePx = 0;
  let order = [];          // slot -> pieceId
  let pieces = [];         // pieceId -> element
  let selectedSlot = null;
  let startTime = null, timer = null;
  let photo = null;        // data URL, kept in memory only
  let lastSeconds = 0;
  let stream = null;
  let tutIndex = 0;
  let building = false;

  // ---------- Entry / cleanup ----------
  function start() {
    BESTA.setMsg('ttCaptureMsg', '');
    BESTA.showScreen('screen-tt-capture');
  }

  function erasePhoto() {
    clearInterval(timer);
    stopCamera();
    photo = null; order = []; pieces = []; selectedSlot = null; building = false;
    $('ttBoard').innerHTML = '';
    $('ttPeekThumb').style.backgroundImage = 'none';
    hidePeek();
    ['ttGalleryInput', 'ttCameraInput'].forEach((id) => { $(id).value = ''; });
  }

  function leave() { erasePhoto(); BESTA.backToPicker(); }

  // ---------- Photo capture ----------
  function squareCrop(source, w, h, mirror) {
    const size = Math.min(w, h);
    const out = document.createElement('canvas');
    const outSize = 900;
    out.width = outSize; out.height = outSize;
    const ctx = out.getContext('2d');
    if (mirror) { ctx.translate(outSize, 0); ctx.scale(-1, 1); }
    ctx.drawImage(source, (w - size) / 2, (h - size) / 2, size, size, 0, 0, outSize, outSize);
    return out.toDataURL('image/jpeg', 0.9);
  }

  function readFile(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) return BESTA.setMsg('ttCaptureMsg', 'That file is not a photo. Please choose a picture.', 'error');
    if (file.size > MAX_FILE_BYTES) return BESTA.setMsg('ttCaptureMsg', 'That photo is too large. Please choose one under 15 MB.', 'error');
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      photo = squareCrop(img, img.naturalWidth, img.naturalHeight, false);
      URL.revokeObjectURL(url);
      input.value = '';
      buildPuzzle();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      BESTA.setMsg('ttCaptureMsg', 'That photo could not be opened. Please try another one.', 'error');
    };
    img.src = url;
  }

  async function openCamera() {
    BESTA.setMsg('ttCaptureMsg', '');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { $('ttCameraInput').click(); return; }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      $('ttCameraVideo').srcObject = stream;
      $('ttCameraOverlay').classList.add('active');
      $('ttCamShutterBtn').focus();
    } catch (err) {
      const blocked = err && (err.name === 'NotAllowedError' || err.name === 'SecurityError');
      BESTA.setMsg('ttCaptureMsg', blocked
        ? 'Camera access was blocked. Allow the camera in your browser settings, or choose a photo from your gallery.'
        : 'The camera could not be started. Please choose a photo from your gallery instead.', 'error');
    }
  }

  function stopCamera() {
    $('ttCameraOverlay').classList.remove('active');
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    $('ttCameraVideo').srcObject = null;
  }

  function takeShot() {
    const v = $('ttCameraVideo');
    if (!v.videoWidth) return BESTA.setMsg('ttCaptureMsg', 'The camera is not ready yet. Please try again.', 'error');
    photo = squareCrop(v, v.videoWidth, v.videoHeight, true);
    stopCamera();
    buildPuzzle();
  }

  // ---------- Build & jumble ----------
  function buildPuzzle() {
    if (building || !photo) return;
    building = true;
    BESTA.showScreen('screen-tt-puzzle');
    const board = $('ttBoard'); board.innerHTML = '';
    pieces = []; selectedSlot = null;

    const avail = Math.min(window.innerWidth - 56, window.innerHeight - 190, 560);
    boardPx = Math.max(240, Math.floor(avail / GRID) * GRID);
    tilePx = boardPx / GRID;
    board.style.width = boardPx + 'px'; board.style.height = boardPx + 'px';
    $('ttPeekThumb').style.backgroundImage = 'url(' + photo + ')';

    const total = GRID * GRID;
    order = [...Array(total).keys()];
    for (let i = 0; i < total; i++) {
      const row = Math.floor(i / GRID), col = i % GRID;
      const el = document.createElement('button');
      el.type = 'button'; el.className = 'piece';
      el.style.width = tilePx + 'px'; el.style.height = tilePx + 'px';
      el.style.backgroundImage = 'url(' + photo + ')';
      el.style.backgroundSize = boardPx + 'px ' + boardPx + 'px';
      el.style.backgroundPosition = '-' + (col * tilePx) + 'px -' + (row * tilePx) + 'px';
      el.setAttribute('aria-pressed', 'false');
      el.addEventListener('click', () => onPick(i));
      board.appendChild(el);
      pieces[i] = el;
      const c = boardPx / 2 - tilePx / 2;
      el.style.transition = 'none';
      el.style.transform = 'translate(' + c + 'px,' + c + 'px) scale(.25) rotate(' + Math.round(Math.random() * 360 - 180) + 'deg)';
    }

    do { shuffle(order); } while (isSolved());
    requestAnimationFrame(() => {
      order.forEach((pid, slot) => {
        setTimeout(() => { if (!pieces[pid]) return; pieces[pid].style.transition = 'transform .5s cubic-bezier(.22,1.3,.5,1)'; place(pid, slot); }, pid * 30);
      });
      setTimeout(() => { labelAll(); runTutorial(); building = false; }, total * 30 + 650);
    });
  }

  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } }
  const slotOf = (pid) => order.indexOf(pid);
  const isSolved = () => order.every((pid, slot) => pid === slot);
  function place(pid, slot) {
    pieces[pid].style.transform = 'translate(' + ((slot % GRID) * tilePx) + 'px,' + (Math.floor(slot / GRID) * tilePx) + 'px)';
  }
  function labelPiece(pid) {
    const s = slotOf(pid);
    pieces[pid].setAttribute('aria-label', 'Tile ' + (pid + 1) + ', now in row ' + (Math.floor(s / GRID) + 1) + ', column ' + ((s % GRID) + 1) + (pid === s ? ', correct place' : ''));
  }
  function labelAll() { pieces.forEach((_, pid) => labelPiece(pid)); }
  function say(text) { $('ttStatus').textContent = text; }

  // ---------- Pick and swap ----------
  function select(pid) {
    clearSelection();
    selectedSlot = slotOf(pid);
    pieces[pid].classList.add('selected');
    pieces[pid].setAttribute('aria-pressed', 'true');
    say('Picked up tile ' + (pid + 1) + '. Choose another tile to swap with.');
  }
  function clearSelection() {
    if (selectedSlot !== null) {
      const pid = order[selectedSlot];
      pieces[pid].classList.remove('selected');
      pieces[pid].setAttribute('aria-pressed', 'false');
    }
    selectedSlot = null;
  }

  function onPick(pid) {
    if (!photo) return;
    const slot = slotOf(pid);
    if (selectedSlot === null) { select(pid); return; }
    if (selectedSlot === slot) { clearSelection(); say('Tile put down.'); return; }

    const firstPid = order[selectedSlot];
    const firstSlot = selectedSlot;
    clearSelection();                 // remove the highlight before the tiles change places
    order[firstSlot] = pid;
    order[slot] = firstPid;
    place(pid, firstSlot);
    place(firstPid, slot);
    pieces.forEach((el, p) => el.classList.toggle('locked', p === slotOf(p)));
    labelPiece(pid); labelPiece(firstPid);
    say('Swapped tile ' + (firstPid + 1) + ' with tile ' + (pid + 1) + '.');
    if (isSolved()) setTimeout(onWin, 350);
  }

  // ---------- How to play ----------
  const STEPS = [
    'This is your photo, all mixed up.',
    'Tap a tile to pick it up. It gets a gold frame.',
    'Tap another tile to swap places. Match every tile to win.'
  ];
  function renderStep() {
    $('ttTutLabel').textContent = 'Step ' + (tutIndex + 1) + ' of ' + STEPS.length;
    $('ttTutText').textContent = STEPS[tutIndex];
    $('ttTutNextBtn').textContent = tutIndex === STEPS.length - 1 ? 'Start playing' : 'Next';
    const a = document.querySelector('#ttTutDemo .tut-tile.a'), b = document.querySelector('#ttTutDemo .tut-tile.b');
    a.classList.remove('swap', 'pick'); b.classList.remove('swap');
    if (tutIndex === 1) a.classList.add('pick');
    if (tutIndex === 2) setTimeout(() => { a.classList.add('swap'); b.classList.add('swap'); }, 400);
  }
  function runTutorial() { tutIndex = 0; BESTA.showScreen('screen-tt-tutorial'); renderStep(); }
  function endTutorial() { BESTA.showScreen('screen-tt-puzzle'); startTimer(); }

  // ---------- Peek (tap to show, tap again or tap outside to hide) ----------
  function showPeek() { $('ttPeekThumb').classList.add('show'); $('ttPeekBackdrop').classList.add('show'); $('ttPeekBtn').setAttribute('aria-pressed', 'true'); }
  function hidePeek() { $('ttPeekThumb').classList.remove('show'); $('ttPeekBackdrop').classList.remove('show'); $('ttPeekBtn').setAttribute('aria-pressed', 'false'); }
  const togglePeek = () => ($('ttPeekThumb').classList.contains('show') ? hidePeek() : showPeek());

  // ---------- Timer, win, saving ----------
  function startTimer() {
    startTime = Date.now();
    clearInterval(timer);
    timer = setInterval(() => { $('ttTimerLabel').textContent = BESTA.fmtTime(Math.floor((Date.now() - startTime) / 1000)); }, 500);
  }

  async function saveTime() {
    const box = $('ttSaveStatus');
    if (!BESTA.isSignedIn()) { box.textContent = 'Sign in next time to save your time and join the leaderboard.'; return; }
    box.innerHTML = '<span class="skeleton" style="width:220px;height:16px;margin:6px auto;"></span>';
    try {
      await BESTA.post('submitPlay', { game: 'orderup', timeSeconds: lastSeconds });
      box.textContent = 'Your time has been saved.';
    } catch (e) {
      box.innerHTML = '';
      const p = document.createElement('p'); p.className = 'msg error'; p.textContent = BESTA.friendlyError(e);
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn-text'; b.textContent = 'Try saving again';
      b.addEventListener('click', saveTime);
      box.appendChild(p); box.appendChild(b);
    }
  }

  function onWin() {
    clearInterval(timer);
    lastSeconds = Math.floor((Date.now() - startTime) / 1000);
    hidePeek();
    $('ttWinTimeLabel').textContent = 'Your time: ' + BESTA.fmtTime(lastSeconds);
    $('ttSaveStatus').textContent = '';
    BESTA.showScreen('screen-tt-win');
    saveTime();
  }

  async function showLeaderboard() {
    BESTA.showScreen('screen-tt-leaderboard');
    const list = $('ttLbList');
    list.innerHTML = Array.from({ length: 5 }, () => '<div class="skeleton-row"><span class="skeleton" style="width:28px;height:18px;"></span><span class="skeleton" style="flex:1;height:18px;"></span><span class="skeleton" style="width:48px;height:18px;"></span></div>').join('');
    try {
      const rows = await BESTA.request('GET', null, { action: 'leaderboard', game: 'orderup' });
      if (!Array.isArray(rows)) throw new Error('bad-response');
      if (!rows.length) { list.innerHTML = '<p class="muted">No times yet. Be the first to sign in and set one.</p>'; return; }
      const colours = ['#8A6A00', '#555B61', '#8A4B1E'];
      list.innerHTML = rows.map((r, i) =>
        '<div class="lb-row"><span class="lb-rank">' + (i < 3 ? '<span style="color:' + colours[i] + '">' + BESTA.icon('medal') + '</span><span class="visually-hidden">' + (i + 1) + '</span>' : (i + 1)) + '</span>' +
        '<span class="lb-name">' + BESTA.escapeHtml(r.name) + '</span><span class="lb-time">' + BESTA.fmtTime(Number(r.timeSeconds) || 0) + '</span></div>').join('');
    } catch (e) {
      list.innerHTML = '';
      const p = document.createElement('p'); p.className = 'msg error'; p.textContent = 'The leaderboard could not be loaded. ' + BESTA.friendlyError(e);
      const b = document.createElement('button'); b.type = 'button'; b.className = 'btn-text'; b.textContent = 'Try again';
      b.addEventListener('click', showLeaderboard);
      list.appendChild(p); list.appendChild(b);
    }
  }

  // ---------- Wiring ----------
  document.addEventListener('DOMContentLoaded', () => {
    $('ttTakePhotoBtn').addEventListener('click', openCamera);
    $('ttGalleryBtn').addEventListener('click', () => $('ttGalleryInput').click());
    $('ttGalleryInput').addEventListener('change', (e) => readFile(e.target));
    $('ttCameraInput').addEventListener('change', (e) => readFile(e.target));
    $('ttCamCancelBtn').addEventListener('click', stopCamera);
    $('ttCamShutterBtn').addEventListener('click', takeShot);
    $('ttTutNextBtn').addEventListener('click', () => { if (tutIndex === STEPS.length - 1) endTutorial(); else { tutIndex++; renderStep(); } });
    $('ttTutSkipBtn').addEventListener('click', endTutorial);
    $('ttPeekBtn').addEventListener('click', togglePeek);
    $('ttPeekBackdrop').addEventListener('click', hidePeek);
    $('ttViewLeaderboardBtn').addEventListener('click', showLeaderboard);
    $('ttAgainBtn').addEventListener('click', () => { erasePhoto(); start(); });
    ['ttBackBtn1', 'ttBackBtn2', 'ttBackBtn3'].forEach((id) => $(id).addEventListener('click', leave));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if ($('ttCameraOverlay').classList.contains('active')) stopCamera(); else hidePeek(); } });
    document.addEventListener('besta:reset', erasePhoto);
  });

  BESTA.registerGame('orderup', { start });
})();
