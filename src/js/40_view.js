// What is on screen: the backdrop, the tiles, the interface pieces and the effects.
// Everything is positioned in design units; `layout()` in 50_game.js decides where.

const PITCH_X = TILE_W + 4;
const PITCH_Y = TILE_H + 2;
const LAYER_LIFT = TILE_DEPTH;
const TILE_ANCHOR_Y = (TILE_PAD + TILE_FACE_H / 2) / (TILE_H + TILE_PAD * 2);
const INK = 0x16264a;
const VALUE_INK = 0xf0781e;
const SLOT_PITCH = 74;
const SLOTS = 9;

// How a word's length bonus looks on the tray: x2 for three letters up to x8 for nine.
// The first two colours are the game's; the rest carry on from soft to loud.
const MULTIPLIER_LOOK = {
  2: { color: 0x55e04a, fill: 0.26, glow: 0.14, line: 5 },
  3: { color: 0x2fd6ae, fill: 0.28, glow: 0.16, line: 5 },
  4: { color: 0x34a9ff, fill: 0.30, glow: 0.18, line: 6 },
  5: { color: 0x7b68ff, fill: 0.32, glow: 0.22, line: 6 },
  6: { color: 0xd04df2, fill: 0.34, glow: 0.26, line: 7 },
  7: { color: 0xff8a1f, fill: 0.36, glow: 0.30, line: 7 },
  8: { color: 0xff3b4e, fill: 0.40, glow: 0.36, line: 8 },
};

const Z_TRAY = 5000;
const Z_DECK = 4000;
const Z_FLY = 9000;

/** Removes a throwaway sprite. Its other tweens are stopped first: one that outlives it would write to a destroyed object. */
function discard(node) {
  gsap.killTweensOf(node);
  gsap.killTweensOf(node.scale);
  node.destroy();
}

// ---------------------------------------------------------------- backdrop

class Backdrop {
  constructor() {
    this.c = new Container();
    this.scene = new Sprite();
    this.clouds = [0.3, 0.78].map((u, i) => {
      const s = sprite(ART.cloud);
      s.tint = THEME.cloud;
      s.alpha = 0.8 - i * 0.2;
      return { s, u, v: [0.17, 0.27][i], size: [0.8, 0.55][i], speed: [0.006, 0.004][i] };
    });
    this.c.addChild(this.scene, this.clouds[0].s, this.clouds[1].s);
    this.W = 0;
    this.H = 0;
  }

  /** The scene is painted for the screen it is on, and again when that changes shape. */
  resize(W, H) {
    if (Math.abs(W - this.W) < 1 && Math.abs(H - this.H) < 1) return;
    this.W = W;
    this.H = H;
    const old = this.scene.texture;
    this.scene.texture = paintScene(W, H);
    if (old && old !== Texture.EMPTY) old.destroy(true);
  }

  tick(dt) {
    for (const c of this.clouds) {
      c.u += c.speed * dt;
      if (c.u > 1.25) c.u = -0.25;
      c.s.position.set(c.u * this.W, c.v * this.H);
      c.s.scale.set(c.size * Math.max(1, this.W / 900));
    }
  }
}

// ---------------------------------------------------------------- tiles

class TileView {
  constructor(m) {
    this.m = m;
    m.view = this;
    this.look = '';
    this.busy = false;                 // mid-flight: layout must not snap it home
    this.c = new Container();
    this.shadow = sprite(ART.tileShadow);
    this.shadow.y = TILE_DEPTH / 2;
    this.shadow.alpha = 0.75;
    this.ring = sprite(ART.tileRing);
    this.ring.y = TILE_DEPTH / 2;
    this.ring.tint = THEME.accent;
    this.ring.visible = false;
    this.base = sprite(ART.tile, 0.5, TILE_ANCHOR_Y);
    this.text = label(m.ch, 76, INK);
    this.text.position.set(-3, -5);
    this.value = label(String(MODEL.valueOf(m.ch)), 27, VALUE_INK);
    this.value.position.set(35, 33);
    this.flash = sprite(ART.tileMask, 0.5, TILE_ANCHOR_Y);
    this.flash.alpha = 0;
    this.c.addChild(this.shadow, this.ring, this.base, this.text, this.value, this.flash);
    this.c.eventMode = 'static';
    this.c.cursor = 'pointer';
    this.c.hitArea = new Rectangle(-TILE_W / 2, -TILE_FACE_H / 2, TILE_W, TILE_H);
    this.c.on('pointerdown', (e) => { e.stopPropagation(); Game.onTile(this); });
    this.c.alpha = 0;                  // dealt in by the intro
  }

  /** 'free' (face up) | 'back' (face down) */
  setLook(look) {
    if (look === this.look) return;
    this.look = look;
    const up = look === 'free';
    this.base.texture = up ? ART.tile : ART.tileBack;
    this.text.visible = up;
    this.value.visible = up;
  }

  /** Turns the tile over to `look`, ending at scale `s`. A second call mid-turn is remembered. */
  flipTo(look, s) {
    this.wantLook = look;
    if (this.flipping || look === this.look) return;
    this.flipping = true;
    const c = this.c;
    gsap.killTweensOf(c.scale);
    gsap.to(c.scale, {
      x: 0, duration: 0.11, ease: 'power2.in',
      onComplete: () => {
        this.setLook(look);
        if (look === 'free') this.flashOnce(0xffffff, 0.7);
        gsap.to(c.scale, {
          x: s, y: s, duration: 0.22, ease: 'back.out(2.5)',
          onComplete: () => {
            this.flipping = false;
            if (this.wantLook !== this.look) this.flipTo(this.wantLook, s);
          },
        });
      },
    });
  }

  setRing(on) {
    if (this.ring.visible === on) return;
    this.ring.visible = on;
    gsap.killTweensOf(this.ring);
    this.ring.alpha = 1;
    if (on) gsap.to(this.ring, { alpha: 0.35, duration: 0.5, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  }

  flashOnce(color, strength) {
    this.flash.tint = color;
    gsap.killTweensOf(this.flash);
    this.flash.alpha = strength || 0.8;
    gsap.to(this.flash, { alpha: 0, duration: 0.45, ease: 'power2.out' });
  }

  shake() {
    gsap.killTweensOf(this.c, 'rotation');
    this.c.rotation = 0;
    gsap.fromTo(this.c, { rotation: -0.09 }, { rotation: 0, duration: 0.45, ease: 'elastic.out(1.2,0.25)' });
  }
}

// ---------------------------------------------------------------- interface pieces

function fitWidth(text, maxWidth) {
  text.scale.set(1);
  text.scale.set(Math.min(1, maxWidth / Math.max(1, text.width)));
}

function pressable(target, onPress) {
  target.eventMode = 'static';
  target.cursor = 'pointer';
  target.on('pointerdown', (e) => {
    e.stopPropagation();
    gsap.killTweensOf(target.scale);
    gsap.fromTo(target.scale, { x: 0.92, y: 0.92 }, { x: 1, y: 1, duration: 0.3, ease: 'back.out(3)' });
    onPress();
  });
}

class Header {
  constructor() {
    this.c = new Container();
    this.strip = new Graphics();
    this.text = label(CFG.headline, 46, 0xffffff, { letterSpacing: 1, dropShadow: SHADOW });
    this.c.addChild(this.strip, this.text);
  }

  place(W, h) {
    this.strip.clear();
    this.strip.rect(0, 0, W, h).fill({ color: THEME.strip, alpha: 0.82 });
    this.strip.rect(0, h - 3, W, 3).fill({ color: 0xffffff, alpha: 0.18 });
    this.text.position.set(W / 2, h / 2);
    fitWidth(this.text, W - 48);
  }
}

/** Two player cards and, between them, the number of tiles left on the board. */
class ScoreBar {
  constructor() {
    this.c = new Container();
    this.sides = [
      this.makeSide(0, CFG.playerName, ART.cardYou, ART.you),
      this.makeSide(1, CFG.opponentName, ART.cardFoe, ART.foe),
    ];
    this.counter = sprite(ART.tileBlue, 0.5, TILE_ANCHOR_Y);
    this.counter.scale.set(0.66);
    this.counter.y = -10;
    this.left = label('0', 40, 0xffffff, { dropShadow: SHADOW });
    this.left.y = -12;
    this.caption = label('Tiles left', 21, 0xffffff, { stroke: { color: THEME.strip, width: 5, join: 'round' } });
    this.caption.y = 46;
    this.c.addChild(this.counter, this.left, this.caption);
    this.shown = [0, 0];
  }

  makeSide(index, name, cardTexture, avatarTexture) {
    const dir = index === 0 ? -1 : 1;
    const box = new Container();
    box.x = dir * 190;
    const card = sprite(cardTexture);
    card.y = 2;
    const lit = new Graphics().roundRect(-156, -49, 312, 98, 28).stroke({ width: 6, color: THEME.accent });
    lit.alpha = 0;
    const avatar = sprite(avatarTexture);
    avatar.x = dir * 104;
    avatar.scale.set(0.88);
    const score = label('0', 46, 0xffffff, { dropShadow: SHADOW });
    score.anchor.set(index === 0 ? 0 : 1, 0.5);
    score.position.set(dir * 52, -14);
    const title = label(name, 23, 0xffffff, { dropShadow: SHADOW });
    title.anchor.set(index === 0 ? 0 : 1, 0.5);
    title.position.set(dir * 52, 24);
    box.addChild(card, lit, avatar, score, title);
    this.c.addChild(box);
    return { box, lit, avatar, score, title, name };
  }

  setScore(index, value, animate) {
    const side = this.sides[index];
    const from = this.shown[index];
    this.shown[index] = value;
    if (!animate) { side.score.text = String(value); return; }
    // The number climbs in ten steps, not every frame: each change redraws the text.
    const counter = { v: 0 };
    gsap.to(counter, {
      v: 10, duration: 0.6, ease: 'power1.out',
      onUpdate: () => { side.score.text = String(Math.round(from + (value - from) * Math.floor(counter.v) / 10)); },
      onComplete: () => { side.score.text = String(value); },
    });
    gsap.fromTo(side.score.scale, { x: 1.35, y: 1.35 }, { x: 1, y: 1, duration: 0.5, ease: 'back.out(2.5)' });
  }

  setTurn(index) {
    this.sides.forEach((side, i) => {
      const on = i === index;
      gsap.to(side.lit, { alpha: on ? 1 : 0, duration: 0.25 });
      gsap.to(side.box, { alpha: on || index < 0 ? 1 : 0.78, duration: 0.25 });
      gsap.to(side.box.scale, { x: on ? 1.03 : 1, y: on ? 1.03 : 1, duration: 0.3, ease: 'back.out(2)' });
    });
  }

  setTilesLeft(n) {
    if (this.left.text === String(n)) return;
    this.left.text = String(n);
    gsap.fromTo(this.left.scale, { x: 1.4, y: 1.4 }, { x: 1, y: 1, duration: 0.4, ease: 'back.out(2.5)' });
  }

  bump(index) {
    const a = this.sides[index].avatar;
    gsap.killTweensOf(a.scale);
    gsap.fromTo(a.scale, { x: 1.15, y: 1.15 }, { x: 0.88, y: 0.88, duration: 0.5, ease: 'elastic.out(1.1,0.4)' });
  }

  /** Dots run before the opponent's name while it picks a word. */
  thinking(on) {
    const side = this.sides[1];
    if (this.thinkTween) { this.thinkTween.kill(); this.thinkTween = null; }
    side.title.text = side.name;
    if (!on) return;
    const step = { n: 0 };
    this.thinkTween = gsap.to(step, {
      n: 3, duration: 0.9, ease: 'none', repeat: -1,
      onUpdate: () => { side.title.text = '.'.repeat(1 + Math.min(2, Math.floor(step.n))) + ' ' + side.name; },
    });
  }

  /** Where flying tiles should land, in root coordinates. */
  avatarPoint(index) { return ROOT.toLocal(this.sides[index].avatar.getGlobalPosition()); }
}

/** The deck: a fan of face-down tiles and, to its right, the one that is open. */
class DeckRow {
  constructor() {
    this.c = new Container();
    this.openWell = new Graphics().roundRect(-40, -40, 80, 88, 16).fill({ color: THEME.panel, alpha: 0.3 })
      .stroke({ width: 3, color: 0xffffff, alpha: 0.45 });
    this.openWell.position.set(DeckRow.OPEN_X, 0);
    this.c.addChild(this.openWell);
  }

  /** Root coordinates of a spot `x` design units from the row's centre. */
  point(x) {
    const p = ROOT.toLocal(this.c.getGlobalPosition());
    return { x: p.x + x * this.c.scale.x, y: p.y };
  }
}
DeckRow.TOP_X = 2;          // the top of the deck: the right end of the fan
DeckRow.FAN = 26;           // how far each tile below it peeks out to the left
DeckRow.OPEN_X = 156;
DeckRow.SCALE = 0.64;

/**
 * Where the opponent's word is laid out: above the board, centred, with no slots drawn.
 * When the word is complete a round badge with its score sits on the last tile's corner.
 */
class OpponentRow {
  constructor() {
    this.c = new Container();                 // only a place: the tiles live in the tile layer
    this.badge = new Container();
    this.badge.eventMode = 'none';
    this.badge.addChild(new Graphics().circle(0, 0, 25).fill({ color: 0xf2841c }).stroke({ width: 3, color: 0xffffff }));
    this.badgeText = label('', 25, 0xffffff);
    this.badge.addChild(this.badgeText);
    this.badge.scale.set(0);
  }

  /** `at` is the last tile's home (root coordinates). */
  showBadge(at, points) {
    this.badgeText.text = String(points);
    fitWidth(this.badgeText, 40);
    this.badge.position.set(at.x + TILE_W * 0.42 * at.s, at.y + TILE_FACE_H * 0.4 * at.s);
    gsap.killTweensOf(this.badge.scale);
    gsap.fromTo(this.badge.scale, { x: 0, y: 0 }, { x: L.panel, y: L.panel, duration: 0.3, ease: 'back.out(3)' });
  }

  hideBadge() {
    gsap.killTweensOf(this.badge.scale);
    gsap.to(this.badge.scale, { x: 0, y: 0, duration: 0.15 });
  }
}

/** Nine slots; the letters lifted so far sit in the first ones, inside a coloured frame. */
class TrayPanel {
  constructor() {
    this.c = new Container();
    for (let i = 0; i < SLOTS; i++) {
      const s = sprite(ART.slot);
      s.x = (i - (SLOTS - 1) / 2) * SLOT_PITCH;
      this.c.addChild(s);
    }
    this.frame = new Graphics();
    this.hintText = label('TAP TILES TO SPELL A WORD', 27, 0xffffff, { letterSpacing: 1, dropShadow: SHADOW });
    this.chip = new Container();
    this.chipBack = new Graphics();
    this.chipText = label('', 25, 0xffffff, { stroke: { color: 0x0b2c66, width: 4, join: 'round' } });
    this.chipText.y = -3;
    this.chip.addChild(this.chipBack, this.chipText);
    this.chip.scale.set(0);
    // the tab sits behind the frame's top edge, so it reads as part of it
    this.c.addChild(this.chip, this.frame, this.hintText);
    this.key = '';
  }

  /**
   * A frame appears around the letters once they spell a word. It says how much the
   * word's length is worth: it takes the colour of its multiplier, soft at x2 and loud
   * at x8, and carries the multiplier on a tab. Letters that spell nothing get no frame.
   */
  set(count, mult, valid) {
    const key = count + '|' + mult + '|' + valid;
    if (key === this.key) return;
    this.key = key;
    gsap.to(this.hintText, { alpha: count ? 0 : 1, duration: 0.2 });
    const g = this.frame;
    g.clear();
    const left = -(SLOTS / 2) * SLOT_PITCH - 3;
    const tier = valid ? MULTIPLIER_LOOK[Math.min(mult, 8)] : null;
    if (tier) {
      const width = count * SLOT_PITCH + 6;
      g.roundRect(left - 5, -46, width + 10, 92, 23).fill({ color: tier.color, alpha: tier.glow });
      g.roundRect(left, -41, width, 82, 19).fill({ color: tier.color, alpha: tier.fill })
        .stroke({ width: tier.line, color: tier.color });
    }
    gsap.killTweensOf(this.chip.scale);
    if (!tier) { gsap.to(this.chip.scale, { x: 0, y: 0, duration: 0.12 }); return; }
    this.chipText.text = 'x' + mult;
    this.chipBack.clear();
    this.chipBack.roundRect(-30, -17, 60, 38, 12).fill({ color: tier.color });
    this.chip.position.set(left + count * SLOT_PITCH - 34, -52);
    gsap.fromTo(this.chip.scale, { x: 0.5, y: 0.5 }, { x: 1, y: 1, duration: 0.28, ease: 'back.out(3.5)' });
  }

  shake() {
    if (this.shaking) return;
    this.shaking = true;
    const x = this.c.x;
    gsap.fromTo(this.c, { x: x - 14 }, { x, duration: 0.5, ease: 'elastic.out(1.4,0.22)', onComplete: () => { this.shaking = false; } });
  }
}

/**
 * One button. It shows what the word in the tray is worth and plays it when tapped:
 * green with a tick when the letters spell a word, grey at 0 when they do not, and grey
 * with "OPPONENT'S TURN" while she plays. Letters are taken back by tapping them.
 */
class Controls {
  constructor() {
    this.c = new Container();
    this.submit = new Container();
    this.submitBack = sprite(ART.submitOff);
    this.submitText = label('0 pts', 48, 0xffffff, { letterSpacing: 2, stroke: { color: 0x4b556f, width: 5, join: 'round' } });
    this.submitText.y = -6;
    this.tick = sprite(ART.tick);
    this.tick.y = -8;
    this.tick.visible = false;
    this.submit.addChild(this.submitBack, this.submitText, this.tick);
    pressable(this.submit, () => Game.onSubmit());
    this.c.addChild(this.submit);
    this.enabled = false;
    this.key = '';
  }

  /** 'idle' (grey, 0 pts), 'opponent' (grey, OPPONENT'S TURN) or 'points' (green, the score and a tick). */
  show(mode, points) {
    const key = mode + '|' + (points || 0);
    if (key === this.key) return;
    this.key = key;
    const ready = mode === 'points';
    this.enabled = ready;
    this.submitBack.texture = ready ? ART.submitOn : ART.submitOff;
    // a space before "pts": without it a lone zero reads as the letter O
    this.submitText.text = mode === 'opponent' ? "OPPONENT'S TURN" : (ready ? points : 0) + ' pts';
    this.submitText.style.fontSize = mode === 'opponent' ? 40 : 48;
    this.submitText.style.stroke = { color: ready ? 0x1f6e0a : 0x4b556f, width: 5, join: 'round' };
    fitWidth(this.submitText, ready ? 190 : 256);
    this.tick.visible = ready;
    this.submitText.x = ready ? -26 : 0;
    this.tick.x = this.submitText.x + this.submitText.width / 2 + 30;
    gsap.killTweensOf(this.submit.scale);
    this.submit.scale.set(1);
    if (ready) gsap.to(this.submit.scale, { x: 1.06, y: 1.06, duration: 0.45, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  }

  spotPoint(spot) { return ROOT.toLocal(spot.getGlobalPosition()); }
}

class Footer {
  constructor() {
    this.c = new Container();
    this.icon = sprite(ART.icon);
    this.icon.scale.set(0.72);
    this.icon.x = -282;
    this.brand = label(CFG.brand, 30, 0xffffff, { align: 'left', wordWrap: true, wordWrapWidth: 210, lineHeight: 32,
      stroke: { color: 0x0b2c66, width: 5, join: 'round' } });
    this.brand.anchor.set(0, 0.5);
    this.brand.x = -222;
    this.cta = new Container();
    this.cta.x = 184;
    this.ctaText = label(CFG.ctaLabel, 42, 0xffffff, { letterSpacing: 1, stroke: { color: 0x0f6a1e, width: 6, join: 'round' } });
    this.ctaText.y = -6;
    this.cta.addChild(sprite(ART.cta), this.ctaText);
    fitWidth(this.ctaText, 250);
    this.c.addChild(this.icon, this.brand, this.cta);
    gsap.to(this.cta.scale, { x: 1.07, y: 1.07, duration: 0.6, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    const go = (e) => { e.stopPropagation(); Game.onCta('footer'); };
    [this.cta, this.icon, this.brand].forEach((t) => { t.eventMode = 'static'; t.cursor = 'pointer'; t.on('pointerdown', go); });
  }
}

// ---------------------------------------------------------------- the tutorial hand

class Hand {
  constructor() {
    this.c = new Container();
    this.ripple = sprite(ART.ring);
    this.hand = sprite(ART.hand, 0.435, 0.03);
    this.c.addChild(this.ripple, this.hand);
    this.c.visible = false;
    this.c.eventMode = 'none';
  }

  /** Points at a spot (root coordinates) and keeps tapping it. */
  show(x, y, scale) {
    const first = !this.c.visible;
    this.c.visible = true;
    if (this.loop) this.loop.kill();
    gsap.killTweensOf([this.c, this.hand, this.hand.scale, this.ripple, this.ripple.scale]);
    this.c.scale.set(scale || 1);
    this.c.alpha = 1;
    if (first) {
      this.c.position.set(x + 90, y + 150);
      this.c.alpha = 0;
      gsap.to(this.c, { alpha: 1, duration: 0.2 });
    }
    gsap.to(this.c, { x, y, duration: first ? 0.45 : 0.3, ease: 'power2.out' });
    this.hand.position.set(14, 26);
    this.hand.scale.set(1);
    this.ripple.scale.set(0.2);
    this.ripple.alpha = 0;
    this.loop = gsap.timeline({ repeat: -1, delay: 0.3 })
      .to(this.hand, { x: 2, y: 6, duration: 0.28, ease: 'power2.in' })
      .to(this.hand.scale, { x: 0.9, y: 0.9, duration: 0.1 }, '<0.2')
      .set(this.ripple, { alpha: 0.9 })
      .set(this.ripple.scale, { x: 0.2, y: 0.2 })
      .to(this.ripple.scale, { x: 1.15, y: 1.15, duration: 0.55, ease: 'power2.out' })
      .to(this.ripple, { alpha: 0, duration: 0.55, ease: 'power2.out' }, '<')
      .to(this.hand.scale, { x: 1, y: 1, duration: 0.15 }, '<')
      .to(this.hand, { x: 14, y: 26, duration: 0.35, ease: 'power2.out' }, '<0.1')
      .to({}, { duration: 0.25 });
  }

  hide() {
    if (!this.c.visible) return;
    if (this.loop) this.loop.kill();
    gsap.killTweensOf([this.c, this.hand, this.hand.scale, this.ripple, this.ripple.scale]);
    this.c.visible = false;
  }
}

// ---------------------------------------------------------------- effects

class Effects {
  constructor() {
    this.c = new Container();
    this.c.eventMode = 'none';
  }

  sparkle(x, y, color, count, spread) {
    for (let i = 0; i < count; i++) {
      const s = sprite(i % 3 === 0 ? ART.glow : ART.star);
      s.tint = color;
      s.blendMode = 'add';
      s.position.set(x, y);
      s.scale.set(randRange(0.25, 0.7));
      s.rotation = rand() * 6.28;
      this.c.addChild(s);
      const a = rand() * Math.PI * 2;
      const d = randRange(0.35, 1) * (spread || 120);
      gsap.to(s, { x: x + Math.cos(a) * d, y: y + Math.sin(a) * d - 20, rotation: s.rotation + randRange(-2, 2), duration: randRange(0.45, 0.85), ease: 'power2.out' });
      gsap.to(s.scale, { x: 0, y: 0, duration: randRange(0.5, 0.9), ease: 'power2.in', onComplete: () => discard(s) });
    }
  }

  floatText(text, x, y, size, color, opts) {
    const o = opts || {};
    const t = label(text, size, color, { stroke: { color: o.stroke === undefined ? 0x0b2c66 : o.stroke, width: Math.max(5, size * 0.14), join: 'round' }, letterSpacing: 1 });
    t.position.set(x, y);
    t.scale.set(0.2);
    this.c.addChild(t);
    const hold = o.hold || 1.1;
    gsap.to(t.scale, { x: 1, y: 1, duration: 0.35, ease: 'back.out(2.6)' });
    gsap.to(t, { y: y - (o.rise === undefined ? 70 : o.rise), duration: hold, ease: 'power1.out' });
    gsap.to(t, { alpha: 0, duration: 0.3, delay: hold - 0.3, onComplete: () => discard(t) });
    return t;
  }

  confetti(W, H) {
    const colors = [0xffd34d, 0xff6b8b, 0x5cf2ff, 0x8cf06a, 0xffffff, 0xb692ff];
    for (let i = 0; i < 90; i++) {
      const s = sprite(ART.dot);
      s.tint = pick(colors);
      s.width = randRange(10, 20);
      s.height = randRange(14, 30);
      s.position.set(randRange(0, W), randRange(-H * 0.35, -20));
      s.rotation = rand() * 6.28;
      this.c.addChild(s);
      gsap.to(s, { y: H + 60, x: s.x + randRange(-140, 140), rotation: s.rotation + randRange(-10, 10), duration: randRange(2.2, 4.2), delay: randRange(0, 1.2), ease: 'none', onComplete: () => discard(s) });
      gsap.to(s.scale, { x: s.scale.x * 0.2, duration: randRange(0.25, 0.6), yoyo: true, repeat: -1, ease: 'sine.inOut' });
    }
  }
}

// ---------------------------------------------------------------- the end card

class EndCard {
  constructor() {
    this.c = new Container();
    this.c.visible = false;
    this.dim = new Graphics();
    this.box = new Container();
    this.rays = sprite(ART.glow);
    this.rays.blendMode = 'add';
    this.rays.tint = THEME.accent;
    this.rays.scale.set(7);
    this.rays.alpha = 0.5;
    this.rays.y = -250;
    this.icon = sprite(ART.icon);
    this.icon.scale.set(1.5);
    this.icon.y = -250;
    this.title = label('', 96, 0xffe066, { stroke: { color: 0x7a3b00, width: 12, join: 'round' }, letterSpacing: 2,
      dropShadow: { color: 0x000000, alpha: 0.45, blur: 6, distance: 6, angle: Math.PI / 2 } });
    this.title.y = -60;
    this.scores = label('', 44, 0xffffff, { dropShadow: SHADOW });
    this.scores.y = 36;
    this.sub = label(CFG.endSubtitle, 32, 0xffffff);
    this.sub.y = 100;
    this.cta = new Container();
    this.cta.y = 210;
    this.ctaText = label(CFG.ctaLabel, 60, 0xffffff, { letterSpacing: 2, stroke: { color: 0x0f6a1e, width: 8, join: 'round' } });
    this.ctaText.y = -8;
    this.cta.addChild(sprite(ART.ctaBig), this.ctaText);
    fitWidth(this.ctaText, 370);
    this.brand = label(CFG.brand, 34, 0xffffff, { letterSpacing: 2 });
    this.brand.y = -136;
    this.box.addChild(this.rays, this.icon, this.brand, this.title, this.scores, this.sub, this.cta);
    this.c.addChild(this.dim, this.box);
    this.c.eventMode = 'static';
    this.c.cursor = 'pointer';
    this.c.on('pointerdown', (e) => { e.stopPropagation(); Game.onCta('endcard'); });
  }

  place(W, H) {
    this.dim.clear();
    this.dim.rect(0, 0, W, H).fill({ color: 0x030a1f, alpha: 0.8 });
    this.c.hitArea = new Rectangle(0, 0, W, H);
    const k = Math.min(1, (W - 60) / 640, (H - 40) / 700);
    this.box.scale.set(k);
    this.box.position.set(W / 2, H / 2 + 40 * k);
  }

  show(result, you, bot) {
    this.title.text = CFG.endTitles[result];
    fitWidth(this.title, 620);
    this.scores.text = CFG.playerName + ' ' + you + '   –   ' + bot + ' ' + CFG.opponentName;
    fitWidth(this.scores, 600);
    this.c.visible = true;
    this.c.alpha = 0;
    gsap.to(this.c, { alpha: 1, duration: 0.35 });
    const pop = (target, delay, to) => {
      gsap.fromTo(target.scale, { x: 0, y: 0 }, { x: to, y: to, duration: 0.55, delay, ease: 'back.out(2)' });
    };
    pop(this.icon, 0.1, 1.5);
    pop(this.title, 0.25, this.title.scale.x);
    pop(this.cta, 0.55, 1);
    gsap.fromTo([this.scores, this.sub, this.brand], { alpha: 0 }, { alpha: 1, duration: 0.4, delay: 0.5, stagger: 0.1 });
    gsap.to(this.rays, { rotation: Math.PI * 2, duration: 14, repeat: -1, ease: 'none' });
    gsap.to(this.rays.scale, { x: 8.5, y: 8.5, duration: 1.6, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    gsap.to(this.cta.scale, { x: 1.08, y: 1.08, duration: 0.55, delay: 1.2, yoyo: true, repeat: -1, ease: 'sine.inOut' });
    gsap.to(this.icon, { y: -262, duration: 1.4, yoyo: true, repeat: -1, ease: 'sine.inOut' });
  }
}
