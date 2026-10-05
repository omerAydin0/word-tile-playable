// Start-up: wait for the font, create the renderer, paint the art, build the scene.

async function boot() {
  if (!LEVEL) { console.error('playable: no level was injected by the build'); return; }
  try {
    await Promise.race([
      document.fonts.load('700 40px Fredoka'),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  } catch (_) { /* the fallback font will do */ }

  APP = new Application();
  await APP.init({
    resizeTo: window,
    antialias: true,
    autoDensity: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    background: THEME.strip,
    preference: 'webgl',
  });
  document.body.appendChild(APP.canvas);

  buildArt();
  buildScene();
  layout();
  settleAll(false);
  track('ad_loaded', { network: CFG.network, ms: Math.round(performance.now()) });

  if (CFG.debug || CFG.network === 'preview') {
    // A handle for tests and for poking at the ad from the console.
    window.__playable = {
      config: CFG,
      events: EVENTS,
      game: Game,
      model: () => MODEL,
      phase: () => Game.phase,
      tapLetter(ch) {
        const m = MODEL.tiles.find((t) => t.ch === ch && MODEL.canLift(t));
        if (m) Game.onTile(m.view);
        return !!m;
      },
      spell(word) { return word.split('').every((ch) => this.tapLetter(ch)); },
      /** Does what the hand is pointing at, until it points at the button. Returns the word. */
      playHint() {
        for (let i = 0; i < 20; i++) {
          const step = Game.nextStep();
          if (!step || step.kind === 'submit') break;
          Game.onTile(step.kind === 'deck' ? MODEL.deck[0].view : step.view);
        }
        return MODEL.trayWord();
      },
      submit: () => Game.onSubmit(),
      draw: () => Game.onDeck(),
      layout: () => L,
      app: APP,
      ui: UI,
      /** Where everything is, in CSS pixels: for checking the layout on a given screen. */
      boxes() {
        const k = ROOT.scale.x;
        const around = (x, y, w, h) => ({ x: (x - w / 2) * k, y: (y - h / 2) * k, w: w * k, h: h * k });
        const drawn = (c) => { const b = c.getBounds(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
        const tileBox = (view) => { const h = homeOf(view); return around(h.x, h.y + TILE_DEPTH / 2 * h.s, TILE_W * h.s, TILE_H * h.s); };
        const span = (boxes) => {
          const x = Math.min(...boxes.map((b) => b.x)), y = Math.min(...boxes.map((b) => b.y));
          return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
        };
        const p = L.panel;
        return {
          screen: { w: APP.screen.width, h: APP.screen.height },
          landscape: L.landscape,
          header: drawn(UI.header.strip),
          scorebar: drawn(UI.scorebar.c),
          opponentRow: around(L.row.x, L.row.y, SLOTS * SLOT_PITCH * L.row.s, 82 * L.row.s),
          plate: around(L.board.x, L.board.y, PLATE_W * L.board.s, PLATE_H * L.board.s),
          deck: span(VIEWS.filter((v) => v.m.where === 'deck' || v.m.where === 'waste').map(tileBox)),
          tray: around(L.tray.x, L.tray.y, SLOTS * SLOT_PITCH * L.tray.s, 72 * L.tray.s),
          button: around(UI.controls.c.x, UI.controls.c.y, 308 * p, 102 * p),
          footer: drawn(UI.footer.c),
          // the two things that appear and go: the tray's multiplier tab and the opponent's score badge
          tab: UI.tray.chip.scale.x > 0.5 ? drawn(UI.tray.chip) : null,
          badge: UI.oppRow.badge.scale.x > 0.5 ? drawn(UI.oppRow.badge) : null,
          deckTiles: VIEWS.filter((v) => v.m.where === 'deck' || v.m.where === 'waste').map(tileBox),
          rowTiles: Game.trayOwner === 1 ? MODEL.tray.map((t) => tileBox(t.view)) : [],
          headlineScale: UI.header.text.scale.x * k,
          boardTile: TILE_W * L.board.s * k,
          trayTile: 70 * L.tray.s * k,
          deckTile: TILE_W * DeckRow.SCALE * p * k,
        };
      },
      /** Moves the ad to that second of its own clock and draws it (the clock is then driven by hand). */
      seek: (seconds) => Clock.seek(seconds),
      /** Everything heard up to that second, as a WAV file in base64: the soundtrack of a video. */
      soundtrack: (seconds) => Sfx.render(seconds),
      /** Seeks, then returns the drawn canvas as a data URL: much faster than a browser screenshot. */
      async frame(seconds, type, quality) {
        const at = await Clock.seek(seconds);      // the canvas is read in the same task it was drawn in
        return { phase: at.phase, tray: at.tray, image: APP.canvas.toDataURL(type || 'image/jpeg', quality || 0.92) };
      },
      /** Runs the clocks by hand for `seconds`: a tab that isn't being painted gets no animation frames. */
      async advance(seconds) {
        gsap.ticker.lagSmoothing(0);
        const end = performance.now() + seconds * 1000;
        while (performance.now() < end) {
          APP.resize();
          APP.ticker.update();
          gsap.ticker.tick();
          await new Promise((resolve) => setTimeout(resolve, 16));
        }
        APP.ticker.update();
        APP.render();
      },
    };
  }

  // Preview builds can be driven from outside:
  //   ?play=HEART,submit,w1.5,hint   the ad plays itself: letters to tap, `submit`, `draw`,
  //                                  `hint` (do what the hand shows), `w<seconds>`, or
  //                                  `follow` (the whole game, following the hand)
  //   ?clock=manual                  nothing moves until __playable.seek(seconds) is called
  //   ?at=7.5                        seek there and stop
  //   ?simulate=2000                 play that many games without drawing them
  // Screenshots, videos and tests are all made this way.
  const query = new URLSearchParams(window.location.search);
  const driven = CFG.network === 'preview';
  if (driven && (query.get('clock') === 'manual' || query.get('at'))) Clock.takeOver();
  Net.ready(() => Game.start());
  if (driven) {
    if (query.get('play')) runScript(query.get('play').split(','));
    if (query.get('at')) {
      Clock.seek(parseFloat(query.get('at'))).then(() => {
        FROZEN = true;
        const root = document.documentElement;
        root.setAttribute('data-frozen', query.get('at'));
        root.setAttribute('data-events', JSON.stringify(EVENTS));
        root.setAttribute('data-phase', Game.phase);
      });
    }
    if (query.get('simulate')) {
      const report = {};
      ['hint', 'casual', 'short'].forEach((policy) => { report[policy] = simulate(Number(query.get('simulate')), policy); });
      document.documentElement.setAttribute('data-simulation', JSON.stringify(report));
    }
  }
  document.documentElement.setAttribute('data-ready', '1');
}

/**
 * The ad's clock, taken off the frame loop and stepped by hand. A headless browser paints
 * too few frames to play an ad in real time, and a video needs every frame at an exact
 * moment; with this the ad can be put at any second and drawn there.
 */
const Clock = {
  manual: false,
  base: 0,
  now: 0,

  takeOver() {
    if (this.manual) return;
    this.manual = true;
    gsap.ticker.remove(gsap.updateRoot);
    this.base = gsap.ticker.time;
    APP.resize();
    APP.ticker.update();
  },

  /** One turn of the event loop. A message channel, because nested timers are held to 4 ms each. */
  breathe() {
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => { channel.port1.close(); resolve(); };
      channel.port2.postMessage(0);
    });
  },

  async seek(seconds) {
    this.takeOver();
    while (this.now < seconds - 1e-6) {
      const step = Math.min(1 / 60, seconds - this.now);
      this.now += step;
      gsap.updateRoot(this.base + this.now);
      UI.backdrop.tick(step);
      await this.breathe();           // lets code that was waiting on a tween carry on
    }
    APP.render();
    return { seconds: this.now, phase: Game.phase, tray: MODEL.tray.length };
  },
};

/**
 * Plays the ad many times without drawing it, to see how it tends to end. The player
 * either follows the hand ('hint'), takes any everyday word ('casual') or always the
 * cheapest one ('short'); the opponent plays as it does in the ad, keeping to the planned
 * game for as long as the player does.
 */
function simulate(games, policy) {
  const out = { games, win: 0, tie: 0, lose: 0, cleared: 0, you: 0, opponent: 0, words: 0 };
  for (let g = 0; g < games; g++) {
    const rnd = mulberry32(g + 1);
    const m = createModel(LEVEL, CFG);
    // A move is a word and, if they matter, the tiles to make it from.
    const mine = () => {
      const step = m.planned(0);
      if (policy === 'hint') return step ? step : m.hintWord(null) && { word: m.hintWord(null) };
      const options = m.playable(LEVEL.common);
      if (!options.length) return null;
      if (policy === 'casual') return { word: options[Math.floor(rnd() * options.length)] };
      return { word: options.reduce((a, b) => (m.pointsFor(b) < m.pointsFor(a) ? b : a)) };
    };
    const hers = () => {
      const step = m.planned(1);
      if (step) return step;
      const word = m.botWord(CFG.botSkill, rnd);
      return word ? { word } : null;
    };
    const play = (player, pick) => {
      let move = pick();
      while (!move && m.deck.length) { m.draw(); move = pick(); }
      if (!move && m.anyWord()) move = { word: m.anyWord() };
      if (!move) return false;
      (move.tiles || m.completion(move.word)).forEach((t) => m.lift(t));
      m.submit(player);
      return true;
    };
    for (;;) {
      if (!play(0, mine) || m.boardEmpty()) break;
      if (!play(1, hers) || m.boardEmpty()) break;
      if (CFG.rounds > 0 && m.moves[0] >= CFG.rounds) break;
    }
    out.you += m.scores[0];
    out.opponent += m.scores[1];
    out.words += m.moves[0] + m.moves[1];
    if (m.boardEmpty()) out.cleared++;
    out[m.scores[0] > m.scores[1] ? 'win' : m.scores[0] < m.scores[1] ? 'lose' : 'tie']++;
  }
  out.you = Math.round(out.you / games);
  out.opponent = Math.round(out.opponent / games);
  out.words = +(out.words / games).toFixed(1);
  return out;
}

async function runScript(steps) {
  // A person takes a moment per tile; at that pace the hand has time to lead.
  const pace = Number(new URLSearchParams(window.location.search).get('pace')) || 0.75;
  const ready = async () => {
    while (Game.phase !== 'player' && Game.phase !== 'end') await wait(0.1);
    return Game.phase === 'player';
  };
  const tap = async (view) => { Game.onTile(view); await wait(pace); };
  // Does what the hand points at, one tap at a time, until it points at the button.
  const followHand = async () => {
    await wait(pace);
    for (let i = 0; i < 20 && Game.phase === 'player'; i++) {
      const step = Game.nextStep();
      if (!step || step.kind === 'submit') return;
      await tap(step.kind === 'deck' ? MODEL.deck[0].view : step.view);
    }
  };
  for (const step of steps) {
    if (/^w[\d.]+$/.test(step)) { await wait(parseFloat(step.slice(1))); continue; }
    if (!await ready()) return;
    if (step === 'submit') Game.onSubmit();
    else if (step === 'draw') { Game.onDeck(); await wait(pace); }
    else if (step === 'hint') await followHand();
    else if (step === 'follow') {
      // the whole game, as a player who does what the hand shows
      while (await ready()) {
        await followHand();
        if (!MODEL.trayValid()) return;
        Game.onSubmit();
        await wait(0.3);
      }
    } else {
      for (const ch of step.toUpperCase()) {
        const tile = MODEL.tiles.find((t) => t.ch === ch && MODEL.canLift(t));
        if (tile) await tap(tile.view);
      }
    }
  }
}

boot().catch((error) => {
  console.error('playable: failed to start', error);
  track('error', { message: String(error && error.message ? error.message : error) });
});
