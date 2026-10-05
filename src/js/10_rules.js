// The duel's rules, with no drawing code.
//
// The board is a pyramid: each layer sits half a tile in from the one below. A tile is
// face up, and usable, when no tile of a higher layer overlaps it; everything else lies
// face down. Taking a tile into the tray uncovers what was under it at once, so a word can
// dig its way down; a tile with even a corner still under another stays shut. A word takes
// face-up tiles, plus at most the one open tile of the deck.
// Every letter has a value, and a word scores the sum of its letters times (length - 1).
//
// A turn only ends with a word: nobody passes. The game is over when the board is empty,
// or when no word is left to make and nothing is left to draw.
//
// The level also carries a planned game: a word for the player, one for the opponent, and
// so on, which together use every tile. While both keep to it the board comes out empty.

const MIN_WORD = 3;
const MAX_WORD = 9;

/** Words are shipped as "shared-prefix digit + the rest", sorted: see tools/build_level.py. */
function decodeWords(packed) {
  const out = [];
  let prev = '';
  let i = 0;
  while (i < packed.length) {
    const keep = packed.charCodeAt(i) - 48;
    let j = i + 1;
    while (j < packed.length && packed.charCodeAt(j) > 57) j++;
    prev = prev.slice(0, keep) + packed.slice(i + 1, j);
    out.push(prev);
    i = j;
  }
  return out;
}

function createModel(level, cfg) {
  const wordList = Array.isArray(level.words) ? level.words : decodeWords(level.words);
  const words = new Set(wordList);
  const common = level.common;
  const hints = level.hints || level.common;
  const values = level.values;

  const tiles = level.tiles.map(([x, y, z, ch], i) => (
    { id: i, ch, x, y, z, where: 'board', fromDeck: false, above: [] }));
  // Which tiles lie on top of which: fixed for the whole game.
  tiles.forEach((low) => {
    tiles.forEach((high) => {
      if (high.z > low.z && Math.abs(high.x - low.x) < 0.99 && Math.abs(high.y - low.y) < 0.99) low.above.push(high);
    });
  });

  const deck = level.deck.split('').map((ch, i) => (
    { id: tiles.length + i, ch, x: 0, y: 0, z: 0, where: 'deck', fromDeck: true, above: [] }));
  deck.forEach((t) => tiles.push(t));

  const waste = [];                 // opened deck tiles; only the last one can be used
  const tray = [];                  // tiles lifted for the word being spelled
  const scores = [0, cfg.botStartScore || 0];
  const moves = [0, 0];

  const tileAt = ([x, y, z]) => tiles.find((t) => !t.fromDeck && t.x === x && t.y === y && t.z === z);
  const plan = (level.plan || []).map((step) => ({ by: step.by, word: step.word, tiles: step.tiles.map(tileAt) }));
  let planIndex = 0;
  let onPlan = plan.length > 0;

  for (let i = 0; i < (level.openAtStart || 0) && deck.length; i++) {
    const t = deck.shift();
    t.where = 'waste';
    waste.push(t);
  }

  // Only tiles still lying on the board cover anything: one lifted into the tray does not.
  const isFree = (t) => t.above.every((a) => a.where !== 'board');

  /** 'free' (face up) | 'covered' (face down). */
  const stateOf = (t) => (isFree(t) ? 'free' : 'covered');

  const onBoard = () => tiles.filter((t) => !t.fromDeck && t.where !== 'gone');
  const openTile = () => (waste.length ? waste[waste.length - 1] : null);
  const trayWord = () => tray.map((t) => t.ch).join('');
  const trayValid = () => tray.length >= MIN_WORD && words.has(trayWord()) && tray.some((t) => !t.fromDeck);

  const multiplier = (length) => Math.max(1, length - 1);
  function pointsFor(word) {
    let sum = 0;
    for (let i = 0; i < word.length; i++) sum += values[word[i]] || 1;
    return sum * multiplier(word.length) * cfg.scoreScale;
  }

  function canLift(t) {
    if (tray.length >= MAX_WORD || t.where === 'tray') return false;
    if (t.fromDeck) return t.where === 'waste' && t === openTile();
    return t.where === 'board' && isFree(t);
  }

  function lift(t) {
    if (!canLift(t)) return false;
    t.where = 'tray';
    tray.push(t);
    return true;
  }

  /**
   * Puts a tray tile back where it came from. Tiles that were taken from under it go
   * back too: they are covered again, and a covered tile cannot be in a word.
   */
  function drop(t) {
    const i = tray.indexOf(t);
    if (i < 0) return false;
    tray.splice(i, 1);
    t.where = t.fromDeck ? 'waste' : 'board';
    tray.filter((u) => !u.fromDeck && !isFree(u)).forEach(drop);
    return true;
  }

  function clearTray() {
    const dropped = tray.slice();
    dropped.forEach(drop);
    return dropped;
  }

  /** Turns the next deck tile face up. An open tile sitting in the tray goes back first. */
  function draw() {
    if (!deck.length) return null;
    const top = openTile();
    if (top && top.where === 'tray') drop(top);
    const t = deck.shift();
    t.where = 'waste';
    waste.push(t);
    return t;
  }

  /** Plays the tray. Returns what changed so the view can animate it. */
  function submit(player) {
    if (!trayValid()) return null;
    const wasCovered = onBoard().filter((t) => !isFree(t));
    const word = trayWord();
    const used = tray.slice();
    used.forEach((t) => {
      t.where = 'gone';
      if (t.fromDeck) waste.splice(waste.indexOf(t), 1);
    });
    tray.length = 0;
    const points = pointsFor(word);
    scores[player] += points;
    moves[player] += 1;
    // Still the planned game? Only if this was the planned word, made of the planned tiles.
    const step = plan[planIndex];
    onPlan = onPlan && !!step && step.by === player && step.tiles.length === used.length
      && step.tiles.every((t, i) => t === used[i]);
    if (onPlan) planIndex += 1;
    return { word, points, tiles: used, revealed: wasCovered.filter(isFree) };
  }

  /** The planned word for this player, while the game has kept to the plan; else null. */
  function planned(player) {
    const step = onPlan ? plan[planIndex] : null;
    return step && step.by === player ? step : null;
  }

  // ---- what can be spelled

  /** Usable board tiles not already in the tray, by letter; the highest layer first. */
  function freeByLetter() {
    const by = {};
    tiles.forEach((t) => {
      if (t.where === 'board' && isFree(t)) (by[t.ch] = by[t.ch] || []).push(t);
    });
    Object.values(by).forEach((list) => list.sort((a, b) => b.z - a.z));
    return by;
  }

  /**
   * Tiles that would finish `word` after what is already in the tray, in order, or null.
   * Board tiles first; the open deck tile fills at most one missing letter.
   */
  function completion(word, by) {
    const prefix = trayWord();
    if (word.length > MAX_WORD || word.length <= prefix.length || !word.startsWith(prefix)) return null;
    const free = by || freeByLetter();
    const taken = {};
    const open = openTile();
    let openLeft = open && open.where === 'waste' ? open : null;
    const out = [];
    for (let i = prefix.length; i < word.length; i++) {
      const ch = word[i];
      const n = taken[ch] || 0;
      if (free[ch] && n < free[ch].length) {
        out.push(free[ch][n]);
        taken[ch] = n + 1;
      } else if (openLeft && openLeft.ch === ch) {
        out.push(openLeft);
        openLeft = null;
      } else {
        return null;
      }
    }
    const usesBoard = tray.some((t) => !t.fromDeck) || out.some((t) => !t.fromDeck);
    return usesBoard ? out : null;
  }

  function playable(list) {
    const by = freeByLetter();
    return list.filter((w) => completion(w, by) !== null);
  }

  function anyWordLeft() {
    const by = freeByLetter();
    return wordList.some((w) => completion(w, by) !== null);
  }

  /** The word the hand should lead to: an everyday five-letter word if there is one. */
  function hintWord(preferred) {
    if (preferred && completion(preferred)) return preferred;
    const rank = (w) => ({ 5: 0, 4: 1, 6: 2 }[w.length]);
    let best = null;
    playable(hints).forEach((w) => {
      if (best === null || rank(w) < rank(best)) best = w;
    });
    return best || playable(common)[0] || anyWord();
  }

  /** Any accepted word that can be made right now, the shortest there is; null if none. */
  function anyWord() {
    const by = freeByLetter();
    let best = null;
    for (const w of wordList) {
      if ((best === null || w.length < best.length) && completion(w, by) !== null) {
        best = w;
        if (w.length === MIN_WORD) break;
      }
    }
    return best;
  }

  /** The opponent's word. Low skill leans on short words; it only knows everyday ones. */
  function botWord(skill, rnd) {
    let options = playable(common);
    if (!options.length) return null;
    // An ad should be winnable by anyone who plays along: with `botMercy` the opponent
    // only takes words that leave it behind the player, or its cheapest word if none does.
    if (cfg.botMercy) {
      const behind = options.filter((w) => scores[1] + pointsFor(w) < scores[0]);
      if (behind.length) {
        options = behind;
      } else {
        let cheapest = options[0];
        options.forEach((w) => { if (pointsFor(w) < pointsFor(cheapest)) cheapest = w; });
        return cheapest;
      }
    }
    const byLength = {};
    options.forEach((w) => (byLength[w.length] = byLength[w.length] || []).push(w));
    const lengths = Object.keys(byLength).map(Number);
    // First a length (each extra letter is less likely the weaker the opponent), then one
    // of the most common words of that length.
    const weights = lengths.map((n) => Math.pow(0.12 + 1.6 * skill, n - MIN_WORD));
    let total = 0;
    weights.forEach((w) => { total += w; });
    let r = rnd() * total;
    let length = lengths[lengths.length - 1];
    for (let i = 0; i < lengths.length; i++) {
      r -= weights[i];
      if (r <= 0) { length = lengths[i]; break; }
    }
    const pool = byLength[length].slice(0, 8);
    return pool[Math.floor(rnd() * pool.length)];
  }

  return {
    tiles, tray, deck, waste, scores, moves,
    stateOf, canLift, lift, drop, clearTray, draw, submit, planned,
    openTile, trayWord, trayValid, completion, playable, anyWordLeft, anyWord, hintWord, botWord,
    pointsFor, multiplier,
    valueOf: (ch) => values[ch] || 1,
    boardCount: () => onBoard().length,
    boardEmpty: () => onBoard().length === 0,
    isWord: (w) => words.has(w),
  };
}
