(function () {
  var KEY = 'besta_consent_v2';
  var state = document.getElementById('consentState');
  function read() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function show() {
    var v = read();
    state.textContent = v ? (v.functional ? 'Current choice: functional storage allowed.' : 'Current choice: essential storage only.') : 'No choice has been made yet.';
  }
  function choose(functional) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ functional: functional, at: new Date().toISOString(), v: 2 }));
      if (!functional) localStorage.removeItem('besta_dasara_highscore');
    } catch (e) { /* storage blocked */ }
    show();
  }
  document.getElementById('choiceReject').addEventListener('click', function () { choose(false); });
  document.getElementById('choiceAccept').addEventListener('click', function () { choose(true); });
  show();
})();
