// Layout and the flow of the game: whose turn it is, what a touch does, when the ad ends.

let APP = null;
let ROOT = null;
let MODEL = null;
const UI = {};
const VIEWS = [];

const BOUNDS = (() => {
  const t = LEVEL ? LEVEL.tiles : [[0, 0, 0, 'A']];
  const xs = t.map((v) => v[0]);
  const ys = t.map((v) => v[1]);
  return {
    minX: Math.min.apply(null, xs), maxX: Math.max.apply(null, xs),
    minY: Math.min.apply(null, ys), maxY: Math.max.apply(null, ys),
    maxZ: Math.max.apply(null, t.map((v) => v[2])),
  };
})();
const BOARD_W = (BOUNDS.maxX - BOUNDS.minX + 1) * PITCH_X;
const BOARD_H = (BOUNDS.maxY - BOUNDS.minY + 1) * PITCH_Y + BOUNDS.maxZ * LAYER_LIFT;
const PLATE_PAD = 18;
const PLATE_W = BOARD_W + PLATE_PAD * 2;
const PLATE_H = BOARD_H + PLATE_PAD * 2;
const TRAY_SCALE = 70 / TILE_W;

const L = { W: 720, H: 1280, landscape: false, board: { x: 360, y: 500, s: 1 }, tray: { x: 360, y: 900, s: 1 },
  row: { x: 360, y: 250, s: 1 }, panel: 1 };

const PRAISE = { 3: 'NICE!', 4: 'GOOD!', 5: 'GREAT!', 6: 'AWESOME!', 7: 'AMAZING!', 8: 'INCREDIBLE!', 9: 'LEGENDARY!' };

// ---------------------------------------------------------------- layout

function layout() {
  const sw = APP.screen.width;
  const sh = APP.screen.height;
  const landscape = sw > sh * 1.08;
  const safe = landscape ? { w: 1180, h: 660 } : { w: 720, h: 1180 };
  const s = Math.min(sw / safe.w, sh / safe.h);
  const W = sw / s;
  const H = sh / s;
  ROOT.scale.set(s);
  L.W = W;
  L.H = H;
  L.landscape = landscape;
  UI.backdrop.resize(W, H);

  let k;
  if (!landscape) {
    const cx = W / 2;
    const headerH = 88;
    UI.header.place(W, headerH);
    k = Math.min(1, (W - 24) / 690);
    // The score bar hangs under the header and the store button sits at the foot. What
    // lies between (her word, the board, the deck, the tray, the button) is one block,
    // centred in the space that is left, with the board as large as that space allows.
    UI.scorebar.c.position.set(cx, headerH + 64 * k);
    UI.footer.c.position.set(cx, H - 64);
    const top = headerH + 136 * k;
    const bottom = H - 128;
    const fixed = (84 + 16 + 14 + 96 + 30 + 84 + 14 + 96) * k;
    const bs = clamp(Math.min((W - 44) / PLATE_W, (bottom - top - fixed) / PLATE_H), 0.45, 1.36);
    // On a tall screen there is height to spare: it goes into the gaps, a little at a
    // time, so the column still fills the screen instead of floating in the middle of it.
    const spare = Math.max(0, bottom - top - fixed - PLATE_H * bs);
    let y = top + spare * 0.12;
    UI.oppRow.c.position.set(cx, y + 42 * k);
    y += (84 + 16) * k;                       // 16: her word's score badge hangs below its last tile
    L.board = { x: cx, y: y + (PLATE_H * bs) / 2, s: bs };
    y += PLATE_H * bs + 14 * k + spare * 0.2;
    UI.deckrow.c.position.set(cx, y + 48 * k);
    y += (96 + 30) * k + spare * 0.16;        // 30: the tray's multiplier tab stands in this gap
    UI.tray.c.position.set(cx, y + 42 * k);
    y += (84 + 14) * k + spare * 0.16;
    UI.controls.c.position.set(cx, y + 48 * k);
  } else {
    const headerH = 76;
    UI.header.place(W, headerH);
    const leftW = W * 0.52;
    const bs = clamp(Math.min((leftW - 50) / PLATE_W, (H - headerH - 32) / PLATE_H), 0.45, 1.36);
    L.board = { x: leftW / 2 + 8, y: headerH + (H - headerH) / 2, s: bs };
    const cx = W * 0.76;
    // the same gaps as the upright layout: under the score bar's caption, under her word's
    // badge, and above the tray for its tab
    k = Math.min(1, (W * 0.45) / 690, (H - headerH) / 730);
    const top = headerH + (H - headerH - 708 * k) / 2;
    UI.scorebar.c.position.set(cx, top + 64 * k);
    UI.oppRow.c.position.set(cx, top + 186 * k);
    UI.deckrow.c.position.set(cx, top + 300 * k);
    UI.tray.c.position.set(cx, top + 420 * k);
    UI.controls.c.position.set(cx, top + 526 * k);
    UI.footer.c.position.set(cx, top + 640 * k);
  }
  [UI.scorebar, UI.oppRow, UI.deckrow, UI.tray, UI.controls, UI.footer].forEach((piece) => piece.c.scale.set(k));
  L.panel = k;
  L.tray = { x: UI.tray.c.x, y: UI.tray.c.y, s: k };
  L.row = { x: UI.oppRow.c.x, y: UI.oppRow.c.y, s: k };

  const b = L.board;
  UI.plate.clear();
  UI.plate.roundRect(-(PLATE_W / 2) * b.s, -(PLATE_H / 2) * b.s, PLATE_W * b.s, PLATE_H * b.s, 34 * b.s)
    .fill({ color: THEME.panel, alpha: 0.5 }).stroke({ width: 3, color: 0xffffff, alpha: 0.34 });
  UI.plate.position.set(b.x, b.y);
  UI.endcard.place(W, H);
}

/** Where a tile belongs right now, from the model and the layout. */
function homeOf(view) {
  const m = view.m;
  if (m.where === 'gone') return null;
  if (m.where === 'tray') {
    const i = MODEL.tray.indexOf(m);
    // The player's letters fill the tray's slots from the left. The opponent's word is
    // laid out above the board instead, centred, each tile where a slot would be.
    const row = Game.trayOwner === 1 ? L.row : L.tray;
    const slots = Game.trayOwner === 1 ? Game.opponentWordLength : SLOTS;
    return { x: row.x + (i - (slots - 1) / 2) * SLOT_PITCH * row.s, y: row.y - 5 * row.s, s: TRAY_SCALE * row.s, z: Z_TRAY + i, look: 'free' };
  }
  if (m.where === 'deck') {
    const below = MODEL.deck.indexOf(m);            // 0 = the top of the deck
    const p = UI.deckrow.point(DeckRow.TOP_X - below * DeckRow.FAN);
    return { x: p.x, y: p.y - 4 * L.panel, s: DeckRow.SCALE * L.panel, z: Z_DECK + 50 - below, look: 'back' };
  }
  if (m.where === 'waste') {
    const p = UI.deckrow.point(DeckRow.OPEN_X);
    return { x: p.x, y: p.y - 4 * L.panel, s: DeckRow.SCALE * L.panel, z: Z_DECK + 60 + MODEL.waste.indexOf(m), look: 'free' };
  }
  const b = L.board;
  const cx = (BOUNDS.minX + BOUNDS.maxX) / 2;
  const cy = (BOUNDS.minY + BOUNDS.maxY) / 2;
  return {
    x: b.x + (m.x - cx) * PITCH_X * b.s,
    y: b.y + ((m.y - cy) * PITCH_Y - (m.z - BOUNDS.maxZ / 2) * LAYER_LIFT - TILE_DEPTH / 2) * b.s,
    s: b.s,
    z: m.z * 1000 + m.y * 20 + m.x,
    look: MODEL.stateOf(m) === 'free' ? 'free' : 'back',
  };
}

// Set once a capture has stopped the clock (?at= in 90_main.js): a late resize may still move
// tiles, but must not turn over ones whose flip the stopped clock never reached.
let FROZEN = false;

/** Moves a tile to where it belongs. Returns true if it started turning over on the way. */
function settle(view, animate, duration) {
  const h = homeOf(view);
  if (!h || view.busy) return false;
  const c = view.c;
  // A tile on the board that changes face turns over where it lies.
  if (view.flipping || (animate && !FROZEN && view.m.where === 'board' && view.look !== '' && view.look !== h.look)) {
    const starting = !view.flipping && view.look !== h.look;
    c.position.set(h.x, h.y);
    c.zIndex = h.z;
    view.flipTo(h.look, h.s);
    return starting;
  }
  gsap.killTweensOf(c, 'x,y');
  gsap.killTweensOf(c.scale);
  if (!FROZEN) view.setLook(h.look);
  const far = Math.abs(c.x - h.x) + Math.abs(c.y - h.y) > 3;
  if (!animate || !far) {
    c.position.set(h.x, h.y);
    c.scale.set(h.s);
    c.zIndex = h.z;
    return false;
  }
  c.zIndex = Math.max(h.z, Z_FLY - 100 + (h.z % 100));
  gsap.to(c.scale, { x: h.s, y: h.s, duration: duration || 0.28, ease: 'back.out(1.8)' });
  gsap.to(c, { x: h.x, y: h.y, duration: duration || 0.28, ease: 'power2.out', onComplete: () => { c.zIndex = h.z; } });
  return false;
}

/** Settles every tile; a tile turning over makes its sound once for the lot. */
function settleAll(animate) {
  let turned = false;
  VIEWS.forEach((v) => { if (settle(v, animate)) turned = true; });
  if (turned) Sfx.flip();
}

// ---------------------------------------------------------------- the hand

const Hint = {
  timer: null,
  ringed: null,

  clear() {
    if (this.timer) { this.timer.kill(); this.timer = null; }
    UI.hand.hide();
    if (this.ringed) { this.ringed.setRing(false); this.ringed = null; }
  },

  schedule(delay) {
    this.clear();
    this.timer = gsap.delayedCall(delay, () => this.show());
  },

  show() {
    this.timer = null;
    if (Game.phase !== 'player') return;
    const step = Game.nextStep();
    if (!step) return;
    let p;
    let scale = L.panel;
    if (step.kind !== 'submit') {
      const view = step.kind === 'deck' ? MODEL.deck[0].view : step.view;
      const h = homeOf(view);
      p = { x: h.x, y: h.y + 8 * h.s };
      scale = clamp(h.s * 1.1, 0.7, 1.1);
      this.ringed = view;
      view.setRing(true);
    } else {
      p = UI.controls.spotPoint(UI.controls.submit);
    }
    UI.hand.show(p.x, p.y, scale);
    if (!Game.guided) track('hint_shown', { kind: step.kind });     // the tutorial's own steps are not idle hints
  },
};

// ---------------------------------------------------------------- the game

const Game = {
  phase: 'boot',
  guided: false,            // the hand shows every word (the tutorial setting)
  taught: false,            // the first word has been played
  hintTarget: null,
  touched: false,
  trayOwner: 0,             // whose word is being laid out: 0 the player, 1 the opponent
  opponentWordLength: 0,
  endRequested: false,
  endReason: '',
  startedAt: 0,

  seconds() { return +((performance.now() - this.startedAt) / 1000).toFixed(1); },

  touch() {
    Sfx.unlock();
    if (!this.touched) {
      this.touched = true;
      track('first_interaction', { seconds: this.seconds() });
    }
  },

  // ---- what the hand should point at next

  nextStep() {
    const word = MODEL.trayWord();
    const tray = MODEL.tray;
    // The planned word, tile by tile, for as long as the tray holds exactly its tiles.
    const step = MODEL.planned(0);
    if (step && tray.every((t, i) => t === step.tiles[i])) {
      if (tray.length === step.tiles.length) return { kind: 'submit' };
      return { kind: 'tile', view: step.tiles[tray.length].view };
    }
    let target = this.hintTarget;
    const stillGood = target && target.startsWith(word) && (target === word || MODEL.completion(target));
    if (!stillGood) target = MODEL.hintWord(step ? step.word : null);
    this.hintTarget = target;
    if (target && target !== word) return { kind: 'tile', view: MODEL.completion(target)[0].view };
    if (MODEL.trayValid()) return { kind: 'submit' };
    // letters that lead to no word: point at the last one, which goes back when tapped
    if (word.length) return { kind: 'undo', view: tray[tray.length - 1].view };
    if (MODEL.deck.length) return { kind: 'deck' };
    return null;
  },

  nudge() {
    if (this.phase === 'player') Hint.schedule(this.guided ? 0.35 : CFG.hintIdle);
  },

  // ---- touches

  onTile(view) {
    if (this.phase !== 'player') return;
    this.touch();
    const m = view.m;
    if (m.where === 'tray') {
      MODEL.drop(m);                 // back to where it was taken from
      Sfx.untap();
      track('tile_returned', { letter: m.ch });
      this.trayChanged();
      return;
    }
    if (m.where === 'deck') { this.onDeck(); return; }
    if (MODEL.canLift(m)) {
      MODEL.lift(m);
      Sfx.tap(MODEL.tray.length - 1);
      view.flashOnce(0xffffff, 0.5);
      this.trayChanged();
      return;
    }
    Sfx.locked();
    view.shake();
    if (MODEL.tray.length >= MAX_WORD) UI.tray.shake();
    else if (m.where === 'board') {
      const h = homeOf(view);
      UI.fx.floatText('COVERED', h.x, h.y - 50 * h.s, 30, 0xffffff, { rise: 40, hold: 0.8 });
      track('covered_tile_tap', {});
    }
    this.nudge();
  },

  onDeck() {
    if (this.phase !== 'player' || this.drawing) return;
    this.touch();
    if (!MODEL.deck.length) { Sfx.locked(); return; }
    this.drawTile(0).then(() => { this.trayChanged(); this.checkStuck(); });
  },

  onSubmit() {
    if (this.phase !== 'player') return;
    this.touch();
    if (!MODEL.tray.length) { Sfx.locked(); UI.tray.shake(); this.nudge(); return; }
    if (!MODEL.trayValid()) {
      const word = MODEL.trayWord();
      Sfx.invalid();
      UI.tray.shake();
      MODEL.tray.forEach((t) => t.view.flashOnce(0xff4d5e, 0.7));
      UI.fx.floatText(word.length < MIN_WORD ? 'TOO SHORT' : 'NOT A WORD', L.tray.x, L.tray.y - 84 * L.tray.s, 40, 0xffffff, { stroke: 0xb32840, rise: 40, hold: 0.9 });
      track('invalid_word', { word, length: word.length });
      this.nudge();
      return;
    }
    this.resolve(0);
  },

  onCta(source) {
    this.touch();
    Sfx.click();
    track('cta_click', { source, phase: this.phase, seconds: this.seconds() });
    Net.openStore();
  },

  /** The tray's frame and the button, from what is in the tray and whose turn it is. */
  showTray() {
    const word = this.trayOwner === 1 ? '' : MODEL.trayWord();       // the opponent's word is not in the tray
    UI.tray.set(word.length, MODEL.multiplier(word.length), word !== '' && MODEL.trayValid());
    if (this.phase === 'bot' || this.trayOwner === 1) UI.controls.show('opponent');
    else if (this.phase === 'player' && word !== '' && MODEL.trayValid()) UI.controls.show('points', MODEL.pointsFor(word));
    else UI.controls.show('idle');
  },

  trayChanged() {
    const was = UI.controls.enabled;
    settleAll(true);
    this.showTray();
    if (UI.controls.enabled && !was) Sfx.ready();
    this.nudge();
  },

  /** Turns the top deck tile face up and slides it to the open spot. */
  async drawTile(player) {
    const tile = MODEL.draw();
    if (!tile) return;
    this.drawing = true;
    const view = tile.view;
    view.relabel();
    MODEL.deck.forEach((t) => t.view.relabel());
    Sfx.flip();
    track('deck_draw', { by: player === 0 ? 'player' : 'opponent', letter: tile.ch, left: MODEL.deck.length });
    const h = homeOf(view);
    view.busy = true;
    view.c.zIndex = Z_FLY;
    gsap.killTweensOf(view.c);
    gsap.killTweensOf(view.c.scale);
    gsap.to(view.c, { x: h.x, y: h.y, duration: 0.32, ease: 'power2.out' });
    await tween(view.c.scale, { x: 0, duration: 0.15, ease: 'power2.in' });
    view.setLook('free');
    await tween(view.c.scale, { x: h.s, y: h.s, duration: 0.2, ease: 'back.out(2.5)' });
    view.flashOnce(0xffffff, 0.6);
    view.busy = false;
    this.drawing = false;
    settleAll(true);
  },

  // ---- turns

  async start() {
    this.startedAt = performance.now();
    this.guided = !!CFG.tutorial;
    this.phase = 'intro';
    track('game_start', { tiles: MODEL.boardCount(), deck: MODEL.deck.length });
    gsap.delayedCall(0.2, () => Sfx.prepare());
    if (CFG.autoEndSeconds > 0) gsap.delayedCall(CFG.autoEndSeconds, () => this.requestEnd('timeout'));
    await intro();
    this.playerTurn(true);
  },

  playerTurn(first) {
    if (this.endRequested) { this.end(); return; }
    this.phase = 'player';
    this.trayOwner = 0;
    this.showTray();
    UI.scorebar.setTurn(0);
    this.hintTarget = null;
    if (!first) {
      Sfx.turn();
      UI.fx.floatText('YOUR TURN', L.board.x, L.board.y, 72, 0xffffff, { rise: 30, hold: 0.9 });
    }
    if (this.checkStuck()) return;
    Hint.schedule(this.guided ? (first ? 0.25 : 0.6) : CFG.hintIdle);
  },

  /**
   * A turn does not pass without a word. With no word to make the hand points at the
   * deck; when no deck tile would help either, the game is over.
   */
  checkStuck() {
    if (this.phase !== 'player' || MODEL.canPlay()) return false;
    if (MODEL.deckCanHelp()) { Hint.schedule(0.8); return false; }
    MODEL.clearTray();
    settleAll(true);
    this.endReason = 'no_words';
    UI.fx.floatText('NO WORDS LEFT', L.board.x, L.board.y, 56, 0xffffff, { rise: 30, hold: 1.1 });
    this.phase = 'resolving';
    Hint.clear();
    this.showTray();
    wait(1.2).then(() => this.end());
    return true;
  },

  async botTurn() {
    this.phase = 'bot';
    this.showTray();
    UI.scorebar.setTurn(1);
    UI.scorebar.thinking(true);
    await wait(randRange(0.9, 1.3));
    // Her planned word while the game has kept to the plan; otherwise an everyday word she
    // can see. With none she turns one deck tile over, if that would give her a word, and
    // takes any word at all as a last resort.
    const step = MODEL.planned(1);
    let word = step ? step.word : MODEL.botWord(CFG.botSkill, rand);
    if (!word && MODEL.deckCanHelp()) {
      await this.drawTile(1);
      await wait(0.45);
      word = MODEL.botWord(CFG.botSkill, rand);
    }
    if (!word) word = MODEL.anyWord();
    UI.scorebar.thinking(false);
    if (!word) {
      this.endReason = 'no_words';
      this.end();
      return;
    }
    const picks = step ? step.tiles : MODEL.completion(word);
    this.trayOwner = 1;
    this.opponentWordLength = picks.length;
    for (let i = 0; i < picks.length; i++) {
      MODEL.lift(picks[i]);
      Sfx.botTap(i);
      picks[i].view.flashOnce(0xff9fb4, 0.7);
      settleAll(true);
      await wait(0.21);
    }
    await wait(0.15);
    UI.oppRow.showBadge(homeOf(picks[picks.length - 1].view), MODEL.pointsFor(word));
    await wait(0.75);
    this.resolve(1);
  },

  /** A word was accepted: celebrate it, bank the points, turn over what it uncovered. */
  async resolve(player) {
    this.phase = 'resolving';
    Hint.clear();
    const used = MODEL.tray.map((t) => t.view);
    const res = MODEL.submit(player);
    const n = used.length;
    const mine = player === 0;
    const color = mine ? 0xffe066 : 0xff9fb4;
    if (mine && !this.taught) {
      this.taught = true;
      track('tutorial_completed', { word: res.word, followed: res.word === LEVEL.opener });
    }
    track(mine ? 'word_submitted' : 'bot_word', { word: res.word, length: n, points: res.points, turn: MODEL.moves[player] });
    UI.controls.show(mine ? 'idle' : 'opponent');       // the tray's frame stays until the tiles have left it

    const row = mine ? L.tray : L.row;
    const ks = row.s;
    used.forEach((v, i) => {
      v.busy = true;
      v.c.zIndex = Z_FLY + i;
      gsap.killTweensOf(v.c, 'x,y');
      gsap.to(v.c, { y: v.c.y - 30 * ks, duration: 0.15, delay: i * 0.05, yoyo: true, repeat: 1, ease: 'power2.out' });
      gsap.delayedCall(i * 0.05, () => v.flashOnce(color, 0.9));
    });
    if (mine) {
      Sfx.word(n);
      UI.fx.floatText(PRAISE[n] || 'NICE!', L.board.x, L.board.y, 92, 0xffe066, { stroke: 0x7a3b00, rise: 50, hold: 1.2 });
      UI.fx.sparkle(L.tray.x, L.tray.y, 0xffe066, 14, 240 * ks);
      UI.fx.floatText('+' + res.points, L.tray.x, L.tray.y - 92 * ks, 56, 0xffe066, { stroke: 0x7a3b00, rise: 46, hold: 1.0 });
    } else {
      Sfx.botWord();                 // the word and its score are already on screen, in her row
    }
    await wait(0.34 + n * 0.05);
    UI.oppRow.hideBadge();

    const p = UI.scorebar.avatarPoint(player);
    used.forEach((v, i) => {
      const delay = i * 0.06;
      gsap.to(v.c, { x: p.x, y: p.y, duration: 0.4, delay, ease: 'power2.in' });
      gsap.to(v.c.scale, { x: 0.22 * ks, y: 0.22 * ks, duration: 0.4, delay, ease: 'power2.in' });
      gsap.delayedCall(delay + 0.4, () => {
        v.c.visible = false;
        UI.fx.sparkle(p.x, p.y, color, 4, 70);
        UI.scorebar.bump(player);
        Sfx.coin(i);
      });
    });
    await wait(0.42 + n * 0.06);
    UI.scorebar.setScore(player, MODEL.scores[player], true);
    UI.scorebar.setTilesLeft(MODEL.boardCount());
    this.showTray();
    if (res.last) {
      // the last tile on the board goes with the word
      const v = res.last.view;
      v.busy = true;
      v.c.zIndex = Z_FLY;
      if (v.look !== 'free') v.setLook('free');
      v.flashOnce(color, 0.9);
      gsap.to(v.c, { x: p.x, y: p.y, duration: 0.45, delay: 0.1, ease: 'power2.in' });
      gsap.to(v.c.scale, { x: 0.22 * ks, y: 0.22 * ks, duration: 0.45, delay: 0.1, ease: 'power2.in' });
      gsap.delayedCall(0.55, () => { v.c.visible = false; UI.fx.sparkle(p.x, p.y, color, 4, 70); Sfx.coin(n); });
      await wait(0.6);
    }

    // What the word uncovered turns face up.
    if (res.revealed.length) Sfx.flip();
    res.revealed.forEach((t, i) => {
      const v = t.view;
      const h = homeOf(v);
      v.busy = true;
      gsap.to(v.c.scale, {
        x: 0, duration: 0.13, delay: i * 0.06, ease: 'power2.in',
        onComplete: () => {
          v.setLook('free');
          v.flashOnce(0xffffff, 0.85);
          gsap.to(v.c.scale, { x: h.s, y: h.s, duration: 0.26, ease: 'back.out(2.5)', onComplete: () => { v.busy = false; settle(v, false); } });
        },
      });
    });
    await wait(0.5 + res.revealed.length * 0.06);
    settleAll(false);
    this.afterMove(player);
  },

  afterMove(player) {
    this.trayOwner = 0;
    if (MODEL.boardEmpty() || this.endRequested) { this.end(); return; }
    if (player === 0) { this.botTurn(); return; }
    if (CFG.rounds > 0 && MODEL.moves[0] >= CFG.rounds) { this.endReason = 'rounds'; this.end(); return; }
    this.playerTurn(false);
  },

  requestEnd(reason) {
    if (this.phase === 'end') return;
    this.endReason = reason;
    this.endRequested = true;
    if (this.phase === 'player') this.end();
  },

  async end() {
    if (this.phase === 'end') return;
    this.phase = 'end';
    Hint.clear();
    UI.scorebar.setTurn(-1);
    UI.scorebar.thinking(false);
    const you = MODEL.scores[0];
    const bot = MODEL.scores[1];
    const result = you > bot ? 'win' : you < bot ? 'lose' : 'tie';
    const seconds = this.seconds();
    track('game_end', { result, you, opponent: bot, words: MODEL.moves[0], seconds, tilesLeft: MODEL.boardCount(), reason: this.endReason || 'board_cleared' });
    await wait(0.45);
    UI.endcard.show(result, you, bot);
    if (result === 'win') { Sfx.win(); UI.fx.confetti(L.W, L.H); } else { Sfx.lose(); }
    track('endcard_shown', { result, seconds });
    Net.gameEnd();
  },
};

// ---------------------------------------------------------------- building and opening the scene

function buildScene() {
  MODEL = createModel(LEVEL, CFG);
  ROOT = new Container();
  APP.stage.addChild(ROOT);
  APP.stage.eventMode = 'static';
  APP.stage.hitArea = APP.screen;
  APP.stage.on('pointerdown', () => Game.touch());

  UI.backdrop = new Backdrop();
  UI.plate = new Graphics();
  UI.header = new Header();
  UI.scorebar = new ScoreBar();
  UI.oppRow = new OpponentRow();
  UI.deckrow = new DeckRow();
  UI.tray = new TrayPanel();
  UI.controls = new Controls();
  UI.footer = new Footer();
  UI.tiles = new Container();
  UI.tiles.sortableChildren = true;
  UI.fx = new Effects();
  UI.hand = new Hand();
  UI.endcard = new EndCard();
  ROOT.addChild(UI.backdrop.c, UI.plate, UI.header.c, UI.scorebar.c, UI.oppRow.c, UI.deckrow.c, UI.tray.c, UI.controls.c,
    UI.footer.c, UI.tiles, UI.oppRow.badge, UI.fx.c, UI.hand.c, UI.endcard.c);

  MODEL.tiles.forEach((m) => {
    const view = new TileView(m);
    VIEWS.push(view);
    UI.tiles.addChild(view.c);
  });
  UI.scorebar.setScore(0, MODEL.scores[0], false);
  UI.scorebar.setScore(1, MODEL.scores[1], false);
  UI.scorebar.setTilesLeft(MODEL.boardCount());

  APP.ticker.add((ticker) => { if (!Clock.manual) UI.backdrop.tick(ticker.deltaMS / 1000); });

  // The renderer follows the window; when its size changes, everything is laid out again.
  let lastW = 0;
  let lastH = 0;
  APP.ticker.add(() => {
    if (APP.screen.width === lastW && APP.screen.height === lastH) return;
    lastW = APP.screen.width;
    lastH = APP.screen.height;
    layout();
    settleAll(false);
  });
}

/** The opening: the interface slides in and the tiles are dealt, the bottom layer first. */
async function intro() {
  layout();
  const pieces = [UI.scorebar.c, UI.deckrow.c, UI.tray.c, UI.controls.c, UI.footer.c];
  gsap.from(UI.header.c, { y: -130, duration: 0.5, ease: 'power3.out' });
  gsap.from(UI.plate, { alpha: 0, duration: 0.5 });
  pieces.forEach((c, i) => {
    gsap.from(c, { alpha: 0, y: c.y + 50, duration: 0.45, delay: 0.1 + i * 0.06, ease: 'power3.out' });
  });

  const order = VIEWS.slice().sort((a, b) => (a.m.fromDeck - b.m.fromDeck) || (a.m.z - b.m.z) || (a.m.y - b.m.y) || (a.m.x - b.m.x));
  let last = 0;
  order.forEach((view, i) => {
    const h = homeOf(view);
    const c = view.c;
    const delay = 0.3 + i * 0.026 + (view.m.fromDeck ? 0.1 : 0) + view.m.z * 0.12;
    last = Math.max(last, delay);
    view.setLook(h.look);
    view.busy = true;
    c.zIndex = h.z;
    c.scale.set(h.s);
    c.alpha = 0;
    if (view.m.fromDeck) c.position.set(h.x - 240, h.y);
    else c.position.set(h.x, h.y - 480);
    gsap.to(c, { alpha: 1, duration: 0.12, delay });
    gsap.to(c, {
      x: h.x, y: h.y, duration: view.m.fromDeck ? 0.4 : 0.45, delay, ease: view.m.fromDeck ? 'power3.out' : 'bounce.out',
      onStart: () => Sfx.deal(),
      onComplete: () => { view.busy = false; },
    });
  });
  await wait(last + 0.6);
  layout();
  settleAll(false);
}
