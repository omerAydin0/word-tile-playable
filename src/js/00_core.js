/* global PIXI, gsap */
// All source files are concatenated into one closure by build.py, in file-name order.

const { Application, Container, Sprite, Graphics, Text, Texture, Point, Rectangle } = PIXI;

const DEFAULTS = {
  variant: 'duel',
  brand: 'WORD TILE DUEL',
  headline: 'CAN YOU BEAT EMMA?',
  ctaLabel: 'PLAY NOW',
  playerName: 'YOU',
  opponentName: 'EMMA',
  theme: 'beach',
  rounds: 0,              // 0 = play until the board is empty; N = stop after N words each
  tutorial: true,         // the hand shows the word to make, every turn
  hintIdle: 5,            // with tutorial off: seconds without a touch before the hand appears
  botStartScore: 0,
  botSkill: 0.15,         // 0 = three-letter words, 1 = the longest word it knows
  botMercy: true,         // the opponent never takes a word that would put it ahead
  scoreScale: 1,
  autoEndSeconds: 0,      // 0 = never cut the game short
  endTitles: { win: 'YOU WIN!', lose: 'SO CLOSE!', tie: "IT'S A TIE!" },
  endSubtitle: 'Ready for the next level?',
  storeUrl: { ios: '', android: '' },
  network: 'preview',
  sound: true,
  music: true,            // a light loop under the effects; it starts with the first touch
  seed: 0,                // 0 = a different game every time
  debug: false,
};

const INJECTED = window.__PLAYABLE__ || {};
const CFG = Object.assign({}, DEFAULTS, INJECTED.config || {});
const LEVEL = INJECTED.level;

// Preview builds take overrides from the query string, so one file can show every variant.
if (CFG.network === 'preview') {
  const NUMERIC = ['rounds', 'hintIdle', 'botStartScore', 'botSkill', 'scoreScale', 'autoEndSeconds', 'seed'];
  const TOGGLES = ['tutorial', 'sound', 'music', 'debug', 'botMercy'];
  const TEXT = ['variant', 'brand', 'headline', 'ctaLabel', 'theme', 'endSubtitle', 'playerName', 'opponentName'];
  new URLSearchParams(window.location.search).forEach((value, key) => {
    if (NUMERIC.includes(key) && value !== '' && !isNaN(Number(value))) CFG[key] = Number(value);
    else if (TOGGLES.includes(key)) CFG[key] = !(value === '0' || value === 'false');
    else if (TEXT.includes(key)) CFG[key] = value;
  });
}

// ---------------------------------------------------------------- small helpers

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(CFG.seed || (Date.now() & 0x7fffffff));
const randRange = (lo, hi) => lo + (hi - lo) * rand();
const pick = (list) => list[Math.floor(rand() * list.length)];

function weightedPick(items, weights) {
  let total = 0;
  for (const w of weights) total += w;
  let r = rand() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

const wait = (seconds) => new Promise((resolve) => gsap.delayedCall(seconds, resolve));
const tween = (target, vars) => new Promise((resolve) => gsap.to(target, Object.assign({}, vars, { onComplete: resolve })));

// ---------------------------------------------------------------- funnel events

// The preview page embeds the ad with ?report=1 and listens for its events. Nothing is
// posted otherwise: an ad has no business messaging whatever frame it is served in.
const REPORT_TO_PARENT = CFG.network === 'preview' && window.parent !== window
  && new URLSearchParams(window.location.search).has('report');

const T0 = performance.now();
const EVENTS = [];

function track(event, data) {
  const entry = Object.assign({ event, t: Math.round(performance.now() - T0), variant: CFG.variant }, data || {});
  EVENTS.push(entry);
  try {
    window.dispatchEvent(new CustomEvent('playable:event', { detail: entry }));
    if (REPORT_TO_PARENT) window.parent.postMessage({ source: 'word-tile-playable', payload: entry }, '*');
  } catch (_) { /* a tracking failure must never stop the ad */ }
  if (CFG.debug) console.log('[playable]', event, JSON.stringify(entry));
}
