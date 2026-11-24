// web/scanner/app.js
(function () {
  var toggleBtn = document.getElementById('toggle-cam');
  var manualInput = document.getElementById('manual-ticket');
  var manualBtn = document.getElementById('manual-btn');
  var resultEl = document.getElementById('result');

  var scanner = new Html5Qrcode('reader');
  var scanning = false;
  var processing = false;

  // Audio feedback
  function beep() {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.frequency.value = 880;
      gain.gain.value = 0.3;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (_) {}
  }

  function vibrate() {
    if (navigator.vibrate) navigator.vibrate(100);
  }

  function showResult(status, body) {
    resultEl.className = 'result-card';

    if (status === 'checked_in') {
      resultEl.classList.add('status-checked-in');
      resultEl.innerHTML =
        '<div class="result-title" style="color:var(--color-accent)">✓ Checked In</div>' +
        '<p class="result-detail">Name: <strong>' + esc(body.full_name) + '</strong></p>' +
        '<p class="result-detail">Organization: <strong>' + esc(body.organization) + '</strong></p>' +
        '<p class="result-detail">Ticket: <strong>' + esc(body.ticket_id) + '</strong></p>' +
        '<p class="result-detail">Time: <strong>' + formatTime(body.checked_in_at) + '</strong></p>';
      beep();
      vibrate();
    } else if (status === 'already_checked_in') {
      resultEl.classList.add('status-already');
      resultEl.innerHTML =
        '<div class="result-title" style="color:#f0c040">Already Checked In</div>' +
        '<p class="result-detail">Name: <strong>' + esc(body.full_name) + '</strong></p>' +
        '<p class="result-detail">Organization: <strong>' + esc(body.organization) + '</strong></p>' +
        '<p class="result-detail">Ticket: <strong>' + esc(body.ticket_id) + '</strong></p>' +
        '<p class="result-detail">Checked in at: <strong>' + formatTime(body.checked_in_at) + '</strong></p>';
    } else {
      resultEl.classList.add('status-error');
      resultEl.innerHTML =
        '<div class="result-title" style="color:var(--color-error)">✗ Error</div>' +
        '<p class="result-detail">' + esc(body.message || 'Unknown error') + '</p>';
    }

    resultEl.classList.remove('hidden');
  }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s || '';
    return d.innerHTML;
  }

  function formatTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    return d.toLocaleString();
  }

  function doCheckin(ticketId) {
    if (processing) return;
    processing = true;
    manualBtn.disabled = true;

    fetch('/api/checkin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket_id: ticketId })
    })
      .then(function (resp) {
        return resp.json().then(function (data) {
          return { ok: resp.ok, status: resp.status, data: data };
        });
      })
      .then(function (result) {
        showResult(result.data.status, result.data);
      })
      .catch(function () {
        showResult('error', { message: 'Network error — check your connection.' });
      })
      .finally(function () {
        processing = false;
        manualBtn.disabled = false;
      });
  }

  // Camera toggle
  toggleBtn.addEventListener('click', function () {
    if (scanning) {
      scanner.stop().then(function () {
        scanning = false;
        toggleBtn.textContent = 'Start Camera';
      });
    } else {
      scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        function (decoded) {
          if (processing) return;
          scanner.pause(true);
          doCheckin(decoded);
          setTimeout(function () {
            if (scanning) {
              try { scanner.resume(); } catch (_) {}
            }
          }, 2000);
        }
      ).then(function () {
        scanning = true;
        toggleBtn.textContent = 'Stop Camera';
      }).catch(function () {
        showResult('error', { message: 'Camera access denied or unavailable.' });
      });
    }
  });

  // Manual entry
  manualBtn.addEventListener('click', function () {
    var val = manualInput.value.trim();
    if (!val) return;
    doCheckin(val);
  });

  manualInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      manualBtn.click();
    }
  });
})();
