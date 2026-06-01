/* ═══════════════════════════════════════════════════════════════
   ANTI-GRAVITY SPIN WHEEL — MAIN SCRIPT
   ═══════════════════════════════════════════════════════════════
   
   Cryptographically fair winner selection using crypto.getRandomValues.
   Canvas-based wheel rendering at 60 FPS.
   Web Audio API sound effects (no external files).
   Confetti particle system & animated star background.
   Full local storage persistence.
   ═══════════════════════════════════════════════════════════════ */

'use strict';

/* ═══════════════════════════════════════════
   1. CONSTANTS & CONFIGURATION
   ═══════════════════════════════════════════ */

/** Neon segment colours that complement the dark theme */
const SEGMENT_COLORS = [
  '#f72585', '#b5179e', '#7209b7', '#560bad',
  '#3f37c9', '#4361ee', '#4895ef', '#4cc9f0',
  '#06d6a0', '#00f5d4', '#ffd166', '#ef476f',
  '#ff006e', '#118ab2', '#e63946', '#2ec4b6',
];

/** Confetti colours */
const CONFETTI_COLORS = [
  '#00f0ff', '#b400ff', '#ff006e', '#ffd166',
  '#06d6a0', '#4361ee', '#f72585', '#4cc9f0',
];

/** Storage keys */
const STORAGE_KEYS = {
  entries:   'agWheel_entries',
  history:   'agWheel_history',
  settings:  'agWheel_settings',
};

/** Pointer angle — top of wheel (−90° in canvas coords) */
const POINTER_ANGLE = -Math.PI / 2;

/** DPR for crisp canvas on retina screens */
const DPR = Math.min(window.devicePixelRatio || 1, 3);


/* ═══════════════════════════════════════════
   2. STATE
   ═══════════════════════════════════════════ */

const state = {
  entries: [],          // Array of name strings
  history: [],          // Array of { name, timestamp }
  settings: {
    preventDuplicates: false,
    soundEnabled: true,
  },
  isSpinning: false,
  currentRotation: 0,   // Radians — cumulative wheel rotation
};


/* ═══════════════════════════════════════════
   3. DOM REFERENCES
   ═══════════════════════════════════════════ */

const dom = {};

function cacheDom() {
  dom.nameInput          = document.getElementById('name-input');
  dom.addBtn             = document.getElementById('add-btn');
  dom.shuffleBtn         = document.getElementById('shuffle-btn');
  dom.clearBtn           = document.getElementById('clear-btn');
  dom.spinBtn            = document.getElementById('spin-btn');
  dom.entryList          = document.getElementById('entry-list');
  dom.entryCount         = document.getElementById('entry-count');
  dom.historyList        = document.getElementById('history-list');
  dom.historyEmpty       = document.getElementById('history-empty');
  dom.clearHistoryBtn    = document.getElementById('clear-history-btn');
  dom.preventDuplicates  = document.getElementById('prevent-duplicates');
  dom.soundToggle        = document.getElementById('sound-toggle');
  dom.wheelCanvas        = document.getElementById('wheel-canvas');
  dom.starsCanvas        = document.getElementById('stars-canvas');
  dom.confettiCanvas     = document.getElementById('confetti-canvas');
  dom.wheelContainer     = document.getElementById('wheel-container');
  dom.winnerModal        = document.getElementById('winner-modal');
  dom.winnerName         = document.getElementById('winner-name');
  dom.closeModalBtn      = document.getElementById('close-modal-btn');
  dom.srAnnounce         = document.getElementById('sr-announce');
}


/* ═══════════════════════════════════════════
   4. INITIALIZATION
   ═══════════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', () => {
  cacheDom();
  loadState();
  initWheelCanvas();
  initStars();
  initConfetti();
  bindEvents();
  renderEntryList();
  renderHistory();
  drawWheel();
  updateSpinBtn();
});


/* ═══════════════════════════════════════════
   5. LOCAL STORAGE
   ═══════════════════════════════════════════ */

function loadState() {
  try {
    const e = localStorage.getItem(STORAGE_KEYS.entries);
    const h = localStorage.getItem(STORAGE_KEYS.history);
    const s = localStorage.getItem(STORAGE_KEYS.settings);
    if (e) state.entries  = JSON.parse(e);
    if (h) state.history  = JSON.parse(h);
    if (s) {
      const parsed = JSON.parse(s);
      state.settings = { ...state.settings, ...parsed };
    }
  } catch { /* ignore corrupt data */ }

  // Sync UI with loaded settings
  if (dom.preventDuplicates) {
    dom.preventDuplicates.checked = state.settings.preventDuplicates;
    dom.preventDuplicates.setAttribute('aria-checked', String(state.settings.preventDuplicates));
  }
  if (dom.soundToggle) {
    dom.soundToggle.checked = state.settings.soundEnabled;
    dom.soundToggle.setAttribute('aria-checked', String(state.settings.soundEnabled));
  }
}

function saveEntries()  { localStorage.setItem(STORAGE_KEYS.entries,  JSON.stringify(state.entries)); }
function saveHistory()  { localStorage.setItem(STORAGE_KEYS.history,  JSON.stringify(state.history)); }
function saveSettings() { localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(state.settings)); }


/* ═══════════════════════════════════════════
   6. EVENT BINDING
   ═══════════════════════════════════════════ */

function bindEvents() {
  // Entry management
  dom.addBtn.addEventListener('click', handleAdd);
  dom.shuffleBtn.addEventListener('click', handleShuffle);
  dom.clearBtn.addEventListener('click', handleClear);
  dom.spinBtn.addEventListener('click', handleSpin);
  dom.clearHistoryBtn.addEventListener('click', handleClearHistory);
  dom.closeModalBtn.addEventListener('click', closeModal);

  // Textarea keyboard shortcut: Ctrl+Enter to add
  dom.nameInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleAdd();
    }
  });

  // Settings toggles
  dom.preventDuplicates.addEventListener('change', () => {
    state.settings.preventDuplicates = dom.preventDuplicates.checked;
    dom.preventDuplicates.setAttribute('aria-checked', String(dom.preventDuplicates.checked));
    saveSettings();
  });

  dom.soundToggle.addEventListener('change', () => {
    state.settings.soundEnabled = dom.soundToggle.checked;
    dom.soundToggle.setAttribute('aria-checked', String(dom.soundToggle.checked));
    saveSettings();
  });

  // Modal overlay click to close
  dom.winnerModal.addEventListener('click', (e) => {
    if (e.target === dom.winnerModal) closeModal();
  });

  // Keyboard: Escape to close modal
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && dom.winnerModal.classList.contains('active')) {
      closeModal();
    }
    // Space bar to spin when spin button is focused or no input focused
    if (e.key === ' ' && document.activeElement === dom.spinBtn) {
      e.preventDefault();
      handleSpin();
    }
  });

  // Window resize → redraw wheel & resize canvases
  window.addEventListener('resize', debounce(() => {
    initWheelCanvas();
    resizeStars();
    resizeConfetti();
    drawWheel();
  }, 200));
}


/* ═══════════════════════════════════════════
   7. ENTRY MANAGEMENT
   ═══════════════════════════════════════════ */

function handleAdd() {
  const raw = dom.nameInput.value.trim();
  if (!raw) return;

  // Parse multi-line input
  const names = raw.split(/\n/)
    .map(n => n.trim())
    .filter(n => n.length > 0);

  if (names.length === 0) return;

  let added = 0;
  names.forEach(name => {
    if (state.settings.preventDuplicates) {
      const exists = state.entries.some(e => e.toLowerCase() === name.toLowerCase());
      if (exists) return;
    }
    state.entries.push(name);
    added++;
  });

  if (added > 0) {
    dom.nameInput.value = '';
    saveEntries();
    renderEntryList();
    drawWheel();
    updateSpinBtn();
    announce(`${added} ${added === 1 ? 'entry' : 'entries'} added`);
  } else {
    announce('No new entries added (duplicates prevented)');
  }

  dom.nameInput.focus();
}

function removeEntry(index) {
  if (index < 0 || index >= state.entries.length) return;
  const removed = state.entries.splice(index, 1)[0];
  saveEntries();
  renderEntryList();
  drawWheel();
  updateSpinBtn();
  announce(`${removed} removed`);
}

function handleClear() {
  if (state.entries.length === 0) return;
  state.entries = [];
  saveEntries();
  renderEntryList();
  drawWheel();
  updateSpinBtn();
  announce('All entries cleared');
}

function handleShuffle() {
  if (state.entries.length < 2) return;
  // Fisher-Yates shuffle using crypto randomness
  for (let i = state.entries.length - 1; i > 0; i--) {
    const j = cryptoRandomInt(i + 1);
    [state.entries[i], state.entries[j]] = [state.entries[j], state.entries[i]];
  }
  saveEntries();
  renderEntryList();
  drawWheel();
  announce('Entries shuffled');
}

function updateSpinBtn() {
  dom.spinBtn.disabled = state.entries.length < 2 || state.isSpinning;
}


/* ═══════════════════════════════════════════
   8. ENTRY LIST RENDERING
   ═══════════════════════════════════════════ */

function renderEntryList() {
  dom.entryList.innerHTML = '';
  dom.entryCount.textContent = state.entries.length;

  state.entries.forEach((name, i) => {
    const li = document.createElement('li');
    li.className = 'entry-item';
    li.style.animationDelay = `${i * 30}ms`;

    const color = SEGMENT_COLORS[i % SEGMENT_COLORS.length];

    li.innerHTML = `
      <span class="entry-color" style="color:${color};background:${color}" aria-hidden="true"></span>
      <span class="entry-name" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
      <button class="entry-remove" aria-label="Remove ${escapeHtml(name)}" data-index="${i}">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    `;

    // Bind remove
    li.querySelector('.entry-remove').addEventListener('click', () => removeEntry(i));

    dom.entryList.appendChild(li);
  });
}


/* ═══════════════════════════════════════════
   9. WHEEL CANVAS SETUP & RENDERING
   ═══════════════════════════════════════════ */

let wheelCtx;
let wheelSize = 500;
let wheelCenter, wheelRadius;

function initWheelCanvas() {
  const container = dom.wheelContainer;
  const rect = container.getBoundingClientRect();
  wheelSize = Math.floor(Math.min(rect.width, rect.height));

  dom.wheelCanvas.width  = wheelSize * DPR;
  dom.wheelCanvas.height = wheelSize * DPR;
  dom.wheelCanvas.style.width  = wheelSize + 'px';
  dom.wheelCanvas.style.height = wheelSize + 'px';

  wheelCtx    = dom.wheelCanvas.getContext('2d');
  wheelCtx.scale(DPR, DPR);
  wheelCenter = wheelSize / 2;
  wheelRadius = wheelSize / 2 - 8;
}

/**
 * Draw the wheel — called on every frame during spin and once when static.
 */
function drawWheel() {
  const ctx = wheelCtx;
  const cx  = wheelCenter;
  const cy  = wheelCenter;
  const r   = wheelRadius;
  const n   = state.entries.length;

  ctx.clearRect(0, 0, wheelSize, wheelSize);

  if (n === 0) {
    drawEmptyWheel(ctx, cx, cy, r);
    return;
  }

  if (n === 1) {
    drawSingleSegment(ctx, cx, cy, r);
    return;
  }

  const segAngle = (2 * Math.PI) / n;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(state.currentRotation);

  // Draw segments
  for (let i = 0; i < n; i++) {
    const startA = i * segAngle;
    const endA   = startA + segAngle;
    const color  = SEGMENT_COLORS[i % SEGMENT_COLORS.length];

    // Filled segment
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, startA, endA);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();

    // Segment border
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Segment text
    ctx.save();
    ctx.rotate(startA + segAngle / 2);

    // Dynamic font sizing
    let fontSize;
    if (n <= 8)       fontSize = 15;
    else if (n <= 16) fontSize = 13;
    else if (n <= 24) fontSize = 11;
    else if (n <= 40) fontSize = 9;
    else              fontSize = 7;

    ctx.font      = `bold ${fontSize}px 'Inter', sans-serif`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur  = 4;

    // Truncate long names
    const maxW = r - 35;
    let label = state.entries[i];
    while (ctx.measureText(label).width > maxW && label.length > 1) {
      label = label.slice(0, -1);
    }
    if (label !== state.entries[i]) label += '…';

    ctx.fillText(label, r - 18, 0);
    ctx.restore();
  }

  ctx.restore();

  // Outer ring glow
  drawOuterRing(ctx, cx, cy, r);

  // Center hub
  drawCenterHub(ctx, cx, cy);
}

/** Empty state wheel */
function drawEmptyWheel(ctx, cx, cy, r) {
  // Outer circle
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, 2 * Math.PI);
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.15)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Dashed inner circle
  ctx.beginPath();
  ctx.setLineDash([8, 6]);
  ctx.arc(cx, cy, r * 0.6, 0, 2 * Math.PI);
  ctx.strokeStyle = 'rgba(180, 0, 255, 0.12)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.setLineDash([]);

  // Text
  ctx.font = "600 16px 'Inter', sans-serif";
  ctx.fillStyle = 'rgba(232, 232, 240, 0.25)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Add entries to begin', cx, cy - 10);
  ctx.font = "400 12px 'Inter', sans-serif";
  ctx.fillText('Minimum 2 required', cx, cy + 12);

  drawOuterRing(ctx, cx, cy, r);
  drawCenterHub(ctx, cx, cy);
}

/** Single-segment wheel */
function drawSingleSegment(ctx, cx, cy, r) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(state.currentRotation);

  ctx.beginPath();
  ctx.arc(0, 0, r, 0, 2 * Math.PI);
  ctx.fillStyle = SEGMENT_COLORS[0];
  ctx.fill();

  ctx.font = "bold 16px 'Inter', sans-serif";
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 4;
  ctx.fillText(state.entries[0], 0, 0);

  ctx.restore();
  drawOuterRing(ctx, cx, cy, r);
  drawCenterHub(ctx, cx, cy);
}

/** Decorative outer ring */
function drawOuterRing(ctx, cx, cy, r) {
  ctx.save();
  // Outer glow ring
  const grad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  grad.addColorStop(0, 'rgba(0, 240, 255, 0.5)');
  grad.addColorStop(0.5, 'rgba(180, 0, 255, 0.4)');
  grad.addColorStop(1, 'rgba(255, 0, 110, 0.4)');

  ctx.beginPath();
  ctx.arc(cx, cy, r + 3, 0, 2 * Math.PI);
  ctx.strokeStyle = grad;
  ctx.lineWidth = 3;
  ctx.shadowColor = 'rgba(0, 240, 255, 0.3)';
  ctx.shadowBlur = 15;
  ctx.stroke();

  // Second subtle ring
  ctx.beginPath();
  ctx.arc(cx, cy, r + 7, 0, 2 * Math.PI);
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.shadowBlur = 0;
  ctx.stroke();

  ctx.restore();
}

/** Center hub decoration */
function drawCenterHub(ctx, cx, cy) {
  ctx.save();

  // Outer hub ring
  const hubGrad = ctx.createRadialGradient(cx, cy, 8, cx, cy, 28);
  hubGrad.addColorStop(0, 'rgba(0, 240, 255, 0.9)');
  hubGrad.addColorStop(0.5, 'rgba(180, 0, 255, 0.7)');
  hubGrad.addColorStop(1, 'rgba(5, 5, 16, 0.8)');

  ctx.beginPath();
  ctx.arc(cx, cy, 24, 0, 2 * Math.PI);
  ctx.fillStyle = hubGrad;
  ctx.shadowColor = 'rgba(0, 240, 255, 0.5)';
  ctx.shadowBlur = 20;
  ctx.fill();

  // Inner hub
  ctx.beginPath();
  ctx.arc(cx, cy, 12, 0, 2 * Math.PI);
  ctx.fillStyle = '#0a0a1a';
  ctx.shadowBlur = 0;
  ctx.fill();

  // Bright dot
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, 2 * Math.PI);
  ctx.fillStyle = 'rgba(0, 240, 255, 0.8)';
  ctx.shadowColor = 'rgba(0, 240, 255, 0.6)';
  ctx.shadowBlur = 10;
  ctx.fill();

  ctx.restore();
}


/* ═══════════════════════════════════════════
   10. CRYPTOGRAPHICALLY SECURE RANDOM
   ═══════════════════════════════════════════ */

/**
 * Returns a cryptographically secure random integer in [0, max).
 * Uses rejection sampling to avoid modulo bias.
 */
function cryptoRandomInt(max) {
  if (max <= 0) return 0;
  const array = new Uint32Array(1);
  const maxUint32 = 0xFFFFFFFF;
  const limit = maxUint32 - (maxUint32 % max);

  // Rejection sampling
  let value;
  do {
    crypto.getRandomValues(array);
    value = array[0];
  } while (value >= limit);

  return value % max;
}

/**
 * Returns a crypto-secure random float in [0, 1).
 */
function cryptoRandomFloat() {
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  return array[0] / 0x100000000;
}


/* ═══════════════════════════════════════════
   11. SPIN LOGIC
   ═══════════════════════════════════════════ */

function handleSpin() {
  if (state.isSpinning || state.entries.length < 2) return;

  state.isSpinning = true;
  dom.spinBtn.disabled = true;
  dom.spinBtn.classList.add('spinning');

  // ── 1. Select winner BEFORE animation ──
  const winnerIndex = cryptoRandomInt(state.entries.length);
  const winnerName  = state.entries[winnerIndex];

  // ── 2. Calculate target rotation to land on winner ──
  const n        = state.entries.length;
  const segAngle = (2 * Math.PI) / n;

  // We want the middle of the winning segment to align with the pointer (top = -π/2)
  // Segment i center (unrotated) = i * segAngle + segAngle / 2
  // After rotation: center + rotation ≡ POINTER_ANGLE (mod 2π)
  // rotation = POINTER_ANGLE - i * segAngle - segAngle / 2

  // Add a small crypto-random offset within the segment so it doesn't always hit the center
  const offsetRange = segAngle * 0.7;  // Stay within 70% of segment
  const offset = (cryptoRandomFloat() - 0.5) * offsetRange;

  let targetAngle = POINTER_ANGLE - winnerIndex * segAngle - segAngle / 2 + offset;

  // Normalise into [0, 2π)
  targetAngle = ((targetAngle % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

  // Add multiple full rotations (crypto-random between 6 and 12)
  const fullSpins = 6 + cryptoRandomInt(7);
  targetAngle += fullSpins * 2 * Math.PI;

  // Total rotation from current
  const totalDelta = targetAngle - (state.currentRotation % (2 * Math.PI));
  const finalRotation = state.currentRotation + totalDelta + (totalDelta < 0 ? 2 * Math.PI : 0);

  // ── 3. Random duration ──
  const duration = 4000 + cryptoRandomInt(3000); // 4–7 seconds

  // ── 4. Animate ──
  animateSpin(finalRotation, duration, winnerName);
}

/**
 * Animate the wheel spin with custom easing.
 * Uses a combination of ease-out curves for realistic deceleration.
 */
function animateSpin(targetRotation, duration, winnerName) {
  const startRotation = state.currentRotation;
  const delta = targetRotation - startRotation;
  const startTime = performance.now();

  // Track last segment for tick sound
  let lastSegIndex = -1;

  function frame(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Custom easing: power curve for realistic spin deceleration
    // Starts fast, slows down gradually, with a satisfying "click" at the end
    const eased = 1 - Math.pow(1 - progress, 4);

    state.currentRotation = startRotation + delta * eased;
    drawWheel();

    // ── Tick sound ──
    if (state.settings.soundEnabled && state.entries.length > 1) {
      const currentSegIndex = getCurrentSegmentIndex();
      if (currentSegIndex !== lastSegIndex) {
        lastSegIndex = currentSegIndex;
        playTickSound(progress); // quieter as it slows
      }
    }

    if (progress < 1) {
      requestAnimationFrame(frame);
    } else {
      // ── Spin complete ──
      state.currentRotation = targetRotation;
      drawWheel();
      state.isSpinning = false;
      dom.spinBtn.classList.remove('spinning');
      updateSpinBtn();

      // Show winner after short delay for dramatic effect
      setTimeout(() => {
        showWinner(winnerName);
      }, 300);
    }
  }

  requestAnimationFrame(frame);
}

/** Determine which segment index is currently at the pointer */
function getCurrentSegmentIndex() {
  const n = state.entries.length;
  if (n === 0) return -1;
  const segAngle = (2 * Math.PI) / n;
  // Pointer is at POINTER_ANGLE; wheel is rotated by state.currentRotation
  // The angle on the wheel at the pointer = POINTER_ANGLE - currentRotation
  let angle = (POINTER_ANGLE - state.currentRotation) % (2 * Math.PI);
  if (angle < 0) angle += 2 * Math.PI;
  return Math.floor(angle / segAngle) % n;
}


/* ═══════════════════════════════════════════
   12. WINNER DISPLAY
   ═══════════════════════════════════════════ */

function showWinner(name) {
  // Add to history
  state.history.unshift({
    name,
    timestamp: Date.now(),
  });
  if (state.history.length > 50) state.history.pop(); // Keep last 50
  saveHistory();
  renderHistory();

  // Show modal
  dom.winnerName.textContent = name;
  dom.winnerModal.hidden = false;
  // Force reflow for transition
  void dom.winnerModal.offsetHeight;
  dom.winnerModal.classList.add('active');

  // Focus close button for keyboard users
  setTimeout(() => dom.closeModalBtn.focus(), 100);

  // Screen reader announcement
  announce(`Winner: ${name}`);

  // Effects
  if (state.settings.soundEnabled) playWinSound();
  launchConfetti();
}

function closeModal() {
  dom.winnerModal.classList.remove('active');
  setTimeout(() => {
    dom.winnerModal.hidden = true;
  }, 400);
  dom.spinBtn.focus();
}


/* ═══════════════════════════════════════════
   13. HISTORY
   ═══════════════════════════════════════════ */

function renderHistory() {
  dom.historyList.innerHTML = '';
  const isEmpty = state.history.length === 0;
  dom.historyEmpty.classList.toggle('hidden', !isEmpty);

  state.history.forEach((item, i) => {
    const li = document.createElement('li');
    li.className = 'history-item';
    li.style.animationDelay = `${i * 40}ms`;

    const time = formatTime(item.timestamp);
    li.innerHTML = `
      <span class="history-rank ${i === 0 ? 'first' : ''}">${i + 1}</span>
      <div class="history-info">
        <div class="history-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</div>
        <div class="history-time">${time}</div>
      </div>
    `;

    dom.historyList.appendChild(li);
  });
}

function handleClearHistory() {
  state.history = [];
  saveHistory();
  renderHistory();
  announce('Winner history cleared');
}


/* ═══════════════════════════════════════════
   14. SOUND EFFECTS — Web Audio API
   ═══════════════════════════════════════════ */

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Short click/tick as wheel passes a segment boundary.
 * Volume decreases as the wheel slows down (progress → 1).
 */
function playTickSound(progress) {
  try {
    const ctx = getAudioContext();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = 'sine';
    // Higher pitch as wheel slows for a satisfying clicking effect
    osc.frequency.value = 600 + (1 - progress) * 400;

    const volume = 0.08 * (0.3 + 0.7 * (1 - progress));
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);

    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.04);
  } catch { /* Audio not available */ }
}

/**
 * Celebratory ascending arpeggio when winner is selected.
 */
function playWinSound() {
  try {
    const ctx = getAudioContext();
    // C5 → E5 → G5 → C6 arpeggio
    const notes = [523.25, 659.25, 783.99, 1046.5];

    notes.forEach((freq, i) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'triangle';
      osc.frequency.value = freq;

      const t = ctx.currentTime + i * 0.12;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.12, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.5);

      osc.start(t);
      osc.stop(t + 0.5);
    });

    // Final shimmer chord
    const shimmerNotes = [1046.5, 1318.5, 1568.0];
    shimmerNotes.forEach((freq) => {
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.type = 'sine';
      osc.frequency.value = freq;

      const t = ctx.currentTime + 0.5;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(0.06, t + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);

      osc.start(t);
      osc.stop(t + 1.2);
    });
  } catch { /* Audio not available */ }
}


/* ═══════════════════════════════════════════
   15. CONFETTI PARTICLE SYSTEM
   ═══════════════════════════════════════════ */

let confettiCtx;
let confettiParticles = [];
let confettiAnimating = false;

function initConfetti() {
  resizeConfetti();
  confettiCtx = dom.confettiCanvas.getContext('2d');
}

function resizeConfetti() {
  dom.confettiCanvas.width  = window.innerWidth * DPR;
  dom.confettiCanvas.height = window.innerHeight * DPR;
  dom.confettiCanvas.style.width  = window.innerWidth + 'px';
  dom.confettiCanvas.style.height = window.innerHeight + 'px';
}

function launchConfetti() {
  confettiParticles = [];
  const count = 200;

  for (let i = 0; i < count; i++) {
    confettiParticles.push({
      x: window.innerWidth / 2 * DPR,
      y: window.innerHeight / 2 * DPR,
      vx: (Math.random() - 0.5) * 25 * DPR,
      vy: (Math.random() - 0.5) * 25 * DPR - 8 * DPR,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      size: (Math.random() * 8 + 3) * DPR,
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 15,
      opacity: 1,
      gravity: 0.15 * DPR,
      drag: 0.985,
      shape: Math.random() > 0.4 ? 'rect' : 'circle',
      aspectRatio: 0.4 + Math.random() * 0.6,
    });
  }

  if (!confettiAnimating) {
    confettiAnimating = true;
    animateConfetti();
  }
}

function animateConfetti() {
  if (!confettiAnimating) return;

  const ctx = confettiCtx;
  const w = dom.confettiCanvas.width;
  const h = dom.confettiCanvas.height;
  ctx.clearRect(0, 0, w, h);

  let alive = false;

  confettiParticles.forEach(p => {
    if (p.opacity <= 0.01) return;
    alive = true;

    p.vy += p.gravity;
    p.vx *= p.drag;
    p.vy *= p.drag;
    p.x += p.vx;
    p.y += p.vy;
    p.rotation += p.rotationSpeed;
    p.opacity -= 0.004;

    ctx.save();
    ctx.globalAlpha = Math.max(0, p.opacity);
    ctx.translate(p.x, p.y);
    ctx.rotate((p.rotation * Math.PI) / 180);
    ctx.fillStyle = p.color;

    if (p.shape === 'rect') {
      ctx.fillRect(-p.size / 2, -p.size * p.aspectRatio / 2, p.size, p.size * p.aspectRatio);
    } else {
      ctx.beginPath();
      ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  });

  if (alive) {
    requestAnimationFrame(animateConfetti);
  } else {
    confettiAnimating = false;
    ctx.clearRect(0, 0, w, h);
  }
}


/* ═══════════════════════════════════════════
   16. STAR BACKGROUND
   ═══════════════════════════════════════════ */

let starsCtx;
let stars = [];
const STAR_COUNT = 200;

function initStars() {
  resizeStars();
  starsCtx = dom.starsCanvas.getContext('2d');
  createStars();
  animateStars();
}

function resizeStars() {
  dom.starsCanvas.width  = window.innerWidth * DPR;
  dom.starsCanvas.height = window.innerHeight * DPR;
  dom.starsCanvas.style.width  = window.innerWidth + 'px';
  dom.starsCanvas.style.height = window.innerHeight + 'px';
}

function createStars() {
  const w = dom.starsCanvas.width;
  const h = dom.starsCanvas.height;
  stars = [];

  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({
      x: Math.random() * w,
      y: Math.random() * h,
      radius: Math.random() * 1.8 + 0.3,
      opacity: Math.random() * 0.7 + 0.2,
      twinkleSpeed: 0.003 + Math.random() * 0.008,
      twinkleOffset: Math.random() * Math.PI * 2,
      driftX: (Math.random() - 0.5) * 0.08,
      driftY: (Math.random() - 0.5) * 0.05,
      color: Math.random() > 0.7
        ? (Math.random() > 0.5 ? 'rgba(0,240,255,' : 'rgba(180,0,255,')
        : 'rgba(255,255,255,',
    });
  }
}

function animateStars() {
  const ctx = starsCtx;
  const w = dom.starsCanvas.width;
  const h = dom.starsCanvas.height;
  const time = performance.now() * 0.001;

  ctx.clearRect(0, 0, w, h);

  stars.forEach(s => {
    // Twinkle
    const twinkle = 0.5 + 0.5 * Math.sin(time * s.twinkleSpeed * 100 + s.twinkleOffset);
    const alpha = s.opacity * twinkle;

    // Drift
    s.x += s.driftX;
    s.y += s.driftY;

    // Wrap around screen
    if (s.x < 0) s.x = w;
    if (s.x > w) s.x = 0;
    if (s.y < 0) s.y = h;
    if (s.y > h) s.y = 0;

    ctx.beginPath();
    ctx.arc(s.x, s.y, s.radius * DPR, 0, Math.PI * 2);
    ctx.fillStyle = s.color + alpha.toFixed(3) + ')';
    ctx.fill();
  });

  requestAnimationFrame(animateStars);
}


/* ═══════════════════════════════════════════
   17. UTILITY FUNCTIONS
   ═══════════════════════════════════════════ */

/** HTML-escape a string for safe insertion */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/** Format timestamp for display */
function formatTime(ts) {
  const d = new Date(ts);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();

  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (isToday) return `Today ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${time}`;

  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' + time;
}

/** Screen-reader live announcement */
function announce(msg) {
  if (dom.srAnnounce) {
    dom.srAnnounce.textContent = msg;
    setTimeout(() => { dom.srAnnounce.textContent = ''; }, 3000);
  }
}

/** Simple debounce */
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
