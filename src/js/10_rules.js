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
// or when no word is left to make and no deck tile would change that.
//
// A short game should end with the board empty, not stuck. So the opponent, the hand and
// the deck all look one move ahead and avoid leaving letters that spell nothing.
//
// The level also carries a planned game: a word for the player, one for the opponent, and
// so on, which together use every tile. While both keep to it the board comes out empty.

const MIN_WORD = 3;
const MAX_WORD = 9;
const LOOKAHEAD = 10;          // with this many tiles or fewer left, a word is judged by what it leaves

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
  const LETTERS = Array.from(new Set(common.join(''))).sort();     // the letters everyday words here are made of
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
    dealUseful(t);
    return t;
  }

  /**
   * The deck lies face down, so nobody has seen its letters. The tile that comes up keeps
   * its letter when that makes a good word; otherwise it becomes the letter that does: a
   * word where there was none, or one that does not leave the board stuck.
   */
  function dealUseful(t) {
    withTrayBack(() => {
      // the best everyday word the open letter allows: what it leaves first, then its length
      const worth = () => {
        const by = freeByLetter();
        let best = -1;
        common.forEach((w) => {
          const picks = completion(w, by, true);
          if (picks) best = Math.max(best, leaves(picks, true) * 10 + w.length);
        });
        return best;
      };
      const mine = t.ch;
      let most = worth();
      let better = mine;
      LETTERS.forEach((ch) => {
        if (ch === mine) return;
        t.ch = ch;
        const n = worth();
        if (Math.floor(n / 10) > Math.floor(most / 10)) { most = n; better = ch; }
      });
      t.ch = better;
    });
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
    // One tile cannot make a word, so the last one on the board goes with the word that left it.
    const rest = onBoard();
    const last = rest.length === 1 ? rest[0] : null;
    if (last) last.where = 'gone';
    return { word, points, tiles: used, revealed: wasCovered.filter((t) => t !== last && isFree(t)), last };
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
   * `fresh` asks the same of an empty tray.
   */
  function completion(word, by, fresh) {
    const prefix = fresh ? '' : trayWord();
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
    const usesBoard = (!fresh && tray.some((t) => !t.fromDeck)) || out.some((t) => !t.fromDeck);
    return usesBoard ? out : null;
  }

  function playable(list) {
    const by = freeByLetter();
    return list.filter((w) => completion(w, by) !== null);
  }

  // ---- one move ahead

  /** Runs `fn` as if the tray had been put back: half a word in the tray should not count. */
  function withTrayBack(fn) {
    const held = tray.slice();
    held.forEach((t) => { t.where = t.fromDeck ? 'waste' : 'board'; });
    try {
      return fn();
    } finally {
      held.forEach((t) => { t.where = 'tray'; });
    }
  }

  /** The open deck tile's letter if it is there to be used, and how many tiles lie under the fan. */
  function deckNow() {
    const open = openTile();
    return { open: open && open.where === 'waste' ? open.ch : '', hidden: deck.length };
  }

  /**
   * Tiles for `word` out of these free ones, borrowing at most one letter from the deck:
   * the open tile's, or any letter at all if a tile is still face down. Null if it cannot
   * be made; else { picks, drew } where `drew` says a face-down tile was needed.
   */
  function fit(word, by, from) {
    const taken = {};
    const picks = [];
    let borrowed = false;
    let drew = false;
    for (let i = 0; i < word.length; i++) {
      const ch = word[i];
      const n = taken[ch] || 0;
      if (by[ch] && n < by[ch].length) {
        picks.push(by[ch][n]);
        taken[ch] = n + 1;
      } else if (!borrowed && (from.open === ch || from.hidden > 0)) {
        borrowed = true;
        drew = from.open !== ch;
      } else {
        return null;
      }
    }
    return picks.length ? { picks, drew } : null;
  }

  const clearedBefore = new Map();

  /**
   * Can everything still on the board be taken, word by word, in everyday words? The
   * answer for a given board and deck never changes, so it is kept.
   */
  function clearable(from) {
    const rest = tiles.filter((t) => !t.fromDeck && t.where === 'board');
    if (rest.length <= 1) return true;
    const key = rest.map((t) => t.id).join(',') + '|' + from.open + from.hidden;
    if (clearedBefore.has(key)) return clearedBefore.get(key);
    const by = freeByLetter();
    let ok = false;
    for (let k = 0; k < common.length && !ok; k++) {
      const made = fit(common[k], by, from);
      if (!made) continue;
      // a drawn tile covers the open one; a used open tile is gone
      const next = made.drew ? { open: '', hidden: from.hidden - 1 }
        : { open: made.picks.length < common[k].length ? '' : from.open, hidden: from.hidden };
      made.picks.forEach((t) => { t.where = 'gone'; });
      ok = clearable(next);
      made.picks.forEach((t) => { t.where = 'board'; });
    }
    clearedBefore.set(key, ok);
    return ok;
  }

  /**
   * What playing these tiles would leave behind: 3 an empty board (a single tile left
   * goes with the word), 2 a board that can still be emptied (or one too full to tell),
   * 1 a board with another word in it but no way to empty it, 0 letters that spell nothing.
   */
  function leaves(picks, fresh) {
    const going = fresh ? picks : tray.concat(picks);
    const left = onBoard().length - going.filter((t) => !t.fromDeck).length;
    if (left <= 1) return 3;
    if (left > LOOKAHEAD) return 2;
    const was = going.map((t) => t.where);
    going.forEach((t) => { t.where = 'gone'; });
    const from = deckNow();
    let mark = 2;
    if (!clearable(from)) {
      const by = freeByLetter();
      mark = wordList.some((w) => fit(w, by, from)) ? 1 : 0;
    }
    going.forEach((t, i) => { t.where = was[i]; });
    return mark;
  }

  /**
   * Of these words, the ones that leave the best board behind. With `anyGood`, every word
   * that leaves a board that can still be emptied will do, not only those that empty it.
   */
  function keepGoing(list, anyGood) {
    if (onBoard().length - MAX_WORD > LOOKAHEAD) return list;
    const by = freeByLetter();
    const marks = list.map((w) => leaves(completion(w, by)));
    let top = Math.max.apply(null, marks);
    if (anyGood) top = Math.min(top, 2);
    return list.filter((w, i) => marks[i] >= top);
  }

  /** Is there a word to make right now, tray put back? */
  function canPlay() {
    return withTrayBack(() => {
      const by = freeByLetter();
      return wordList.some((w) => completion(w, by, true) !== null);
    });
  }

  /** Would turning a deck tile over make an everyday word possible? */
  function deckCanHelp() {
    if (!deck.length) return false;
    return withTrayBack(() => {
      const by = freeByLetter();
      return common.some((w) => fit(w, by, { open: '', hidden: 1 }));
    });
  }

  function anyWordLeft() {
    const by = freeByLetter();
    return wordList.some((w) => completion(w, by) !== null);
  }

  /** The word the hand should lead to: an everyday five-letter word if there is one. */
  function hintWord(preferred) {
    if (preferred && completion(preferred)) return preferred;
    const rank = (w) => ({ 5: 0, 4: 1, 6: 2 }[w.length]);
    const pick = (list) => {
      let best = null;
      keepGoing(playable(list)).forEach((w) => {
        if (best === null || rank(w) < rank(best)) best = w;
      });
      return best;
    };
    // an everyday five-letter word, unless a plainer one is the one that keeps the game going
    const nice = pick(hints);
    const plain = pick(common);
    if (nice && plain && leaves(completion(plain)) > leaves(completion(nice))) return plain;
    // with no everyday word in sight the deck is the better advice, if it has one to give
    return nice || plain || (deckCanHelp() ? null : anyWord());
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
    options = keepGoing(options, true);     // she is in no hurry to end it: that leaves room to stay behind
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
    canPlay, deckCanHelp,
    pointsFor, multiplier,
    valueOf: (ch) => values[ch] || 1,
    boardCount: () => onBoard().length,
    boardEmpty: () => onBoard().length === 0,
    isWord: (w) => words.has(w),
  };
}
