// Every picture in the ad is painted here at load time with Canvas 2D and handed to
// Pixi as a texture: no image files, nothing to license, and each theme is one object.

const ART_SCALE = 2;                 // texture pixels per design unit
const FONT = 'Fredoka, "Arial Rounded MT Bold", "Trebuchet MS", Arial, sans-serif';

const TILE_W = 112;
const TILE_FACE_H = 112;
const TILE_DEPTH = 14;
const TILE_H = TILE_FACE_H + TILE_DEPTH;
const TILE_PAD = 4;
const TILE_R = 22;

const THEMES = {
  beach: {
    sky: ['#1670d6', '#3a9bf0', '#7cc9fb', '#d2f0ff'],
    sea: ['#1163c2', '#1e9ade', '#6fe3d3'], sand: ['#fff3cf', '#f7e1a6', '#ebcb86'],
    palm: ['#0f6b33', '#3cb650'], cloud: '#ffffff',
    glow: '#fff6d2', strip: 0x0b2c66, panel: 0x0a2a5e, accent: 0xffd84d,
  },
  sunset: {
    sky: ['#2b1760', '#7b2f8f', '#e3577d', '#ffc27a'],
    sea: ['#4a2a7c', '#a44d93', '#ffb199'], sand: ['#f6cfa6', '#e6ab84', '#cf8b6c'],
    palm: ['#1d0f3a', '#3a1d5c'], cloud: '#ffd3c6',
    glow: '#ffe1a6', strip: 0x2a1250, panel: 0x2a1250, accent: 0xffe066,
  },
  lagoon: {
    sky: ['#0c6c78', '#1c9aa2', '#63d0bf', '#dbf7e6'],
    sea: ['#0f7f8e', '#22b6b0', '#9ff0d8'], sand: ['#f8eec8', '#ecdba8', '#dcc58e'],
    palm: ['#0c5a3c', '#2fae6a'], cloud: '#ffffff',
    glow: '#ffffff', strip: 0x063842, panel: 0x063842, accent: 0xffd84d,
  },
};

// A variant names a theme, or gives its own colours on top of one:
//   "theme": { "base": "beach", "sky": ["#101b4d", "#27408b", "#5a7fd6", "#c9d8ff"], "accent": "#ffd84d" }
const THEME = (() => {
  const wanted = CFG.theme;
  if (wanted && typeof wanted === 'object') return Object.assign({}, THEMES[wanted.base] || THEMES.beach, wanted);
  return THEMES[wanted] || THEMES.beach;
})();

function paint(w, h, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * ART_SCALE);
  canvas.height = Math.round(h * ART_SCALE);
  const g = canvas.getContext('2d');
  g.scale(ART_SCALE, ART_SCALE);
  draw(g, w, h);
  const source = new PIXI.CanvasSource({ resource: canvas, resolution: ART_SCALE });
  return new Texture({ source });
}

function roundRect(g, x, y, w, h, r) {
  const k = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + k, y);
  g.arcTo(x + w, y, x + w, y + h, k);
  g.arcTo(x + w, y + h, x, y + h, k);
  g.arcTo(x, y + h, x, y, k);
  g.arcTo(x, y, x + w, y, k);
  g.closePath();
}

function vGradient(g, y0, y1, stops) {
  const grad = g.createLinearGradient(0, y0, 0, y1);
  stops.forEach((c, i) => grad.addColorStop(stops.length === 1 ? 0 : i / (stops.length - 1), c));
  return grad;
}

// ---------------------------------------------------------------- tiles

/** A tile body: a face on top of the sliver of thickness you see below it. */
function tileBody(g, face, edge, outline) {
  roundRect(g, 0, TILE_DEPTH, TILE_W, TILE_FACE_H, TILE_R);
  g.fillStyle = vGradient(g, TILE_FACE_H - 10, TILE_H, edge);
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = outline;
  g.stroke();
  roundRect(g, 0, 0, TILE_W, TILE_FACE_H, TILE_R);
  g.fillStyle = vGradient(g, 0, TILE_FACE_H, face);
  g.fill();
  g.stroke();
}

function paintTile() {
  const p = TILE_PAD;
  return paint(TILE_W + p * 2, TILE_H + p * 2, (g) => {
    g.translate(p, p);
    tileBody(g, ['#ffffff', '#e4ecf9'], ['#aebfdb', '#8498bd'], 'rgba(30,55,105,0.5)');
    g.save();
    roundRect(g, 0, 0, TILE_W, TILE_FACE_H, TILE_R);
    g.clip();
    // a bevel: light along the top, a cool shade along the bottom
    const shade = g.createLinearGradient(0, TILE_FACE_H - 26, 0, TILE_FACE_H);
    shade.addColorStop(0, 'rgba(70,100,160,0)');
    shade.addColorStop(1, 'rgba(70,100,160,0.20)');
    g.fillStyle = shade;
    g.fillRect(0, TILE_FACE_H - 26, TILE_W, 26);
    g.restore();
    roundRect(g, 5, 5, TILE_W - 10, TILE_FACE_H - 10, TILE_R - 5);
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.stroke();
  });
}

function paintTileBack(withEmblem) {
  const p = TILE_PAD;
  return paint(TILE_W + p * 2, TILE_H + p * 2, (g) => {
    g.translate(p, p);
    tileBody(g, ['#4c9cf6', '#1f66d3'], ['#1c56ab', '#123f86'], 'rgba(6,26,74,0.65)');
    g.save();
    roundRect(g, 0, 0, TILE_W, TILE_FACE_H, TILE_R);
    g.clip();
    const shine = g.createLinearGradient(0, 0, 0, 40);
    shine.addColorStop(0, 'rgba(255,255,255,0.30)');
    shine.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = shine;
    g.fillRect(0, 0, TILE_W, 40);
    g.restore();
    roundRect(g, 5, 5, TILE_W - 10, TILE_FACE_H - 10, TILE_R - 5);
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(160,205,255,0.55)';
    g.stroke();
    if (!withEmblem) return;
    // the emblem: a rounded diamond inside a rounded diamond
    g.save();
    g.translate(TILE_W / 2, TILE_FACE_H / 2);
    g.rotate(Math.PI / 4);
    roundRect(g, -29, -29, 58, 58, 13);
    g.fillStyle = '#1a58bf';
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = '#8fc6ff';
    g.stroke();
    roundRect(g, -13, -13, 26, 26, 7);
    g.fillStyle = '#5eaaf7';
    g.fill();
    g.restore();
  });
}

function paintTileShadow() {
  const m = 30;
  return paint(TILE_W + m * 2, TILE_H + m * 2, (g) => {
    g.shadowColor = 'rgba(3,18,52,0.5)';
    g.shadowBlur = 16;
    g.shadowOffsetY = 7;
    g.fillStyle = 'rgba(3,18,52,0.5)';
    roundRect(g, m + 5, m + 8, TILE_W - 10, TILE_H - 12, TILE_R);
    g.fill();
  });
}

function paintTileMask() {
  const p = TILE_PAD;
  return paint(TILE_W + p * 2, TILE_H + p * 2, (g) => {
    g.translate(p, p);
    g.fillStyle = '#fff';
    roundRect(g, 0, 0, TILE_W, TILE_FACE_H, TILE_R);
    g.fill();
  });
}

function paintTileRing() {
  const m = 14;
  return paint(TILE_W + m * 2, TILE_H + m * 2, (g) => {
    g.shadowColor = 'rgba(255,255,255,0.9)';
    g.shadowBlur = 10;
    g.strokeStyle = '#fff';
    g.lineWidth = 7;
    roundRect(g, m - 3, m - 3, TILE_W + 6, TILE_H + 6, TILE_R + 4);
    g.stroke();
  });
}

function paintSlot() {
  return paint(72, 72, (g) => {
    roundRect(g, 1, 1, 70, 70, 15);
    g.fillStyle = 'rgba(6,26,70,0.42)';
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = 'rgba(255,255,255,0.20)';
    g.stroke();
  });
}

// ---------------------------------------------------------------- effects

function paintGlow(size) {
  return paint(size, size, (g) => {
    const r = size / 2;
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  });
}

function paintStar() {
  return paint(48, 48, (g) => {
    g.translate(24, 24);
    g.fillStyle = '#fff';
    g.beginPath();
    for (let i = 0; i < 8; i++) {
      const r = i % 2 === 0 ? 22 : 6;
      const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  });
}

function paintRing() {
  return paint(128, 128, (g) => {
    g.strokeStyle = '#fff';
    g.lineWidth = 8;
    g.beginPath();
    g.arc(64, 64, 56, 0, Math.PI * 2);
    g.stroke();
  });
}

function paintDot() {
  return paint(16, 16, (g) => { g.fillStyle = '#fff'; g.fillRect(0, 0, 16, 16); });
}

// ---------------------------------------------------------------- scenery

/** A colour (number or "#rrggbb") as a CSS colour with that much alpha. */
function shade(color, alpha) {
  const n = typeof color === 'number' ? color : parseInt(color.slice(1), 16);
  return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + alpha + ')';
}

function paintCloud() {
  return paint(360, 150, (g) => {
    g.fillStyle = 'rgba(255,255,255,0.95)';
    g.filter = 'blur(5px)';
    [[90, 96, 52], [150, 70, 62], [215, 84, 56], [270, 100, 40], [180, 104, 60]].forEach(([x, y, r]) => {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    });
    g.fillRect(70, 96, 220, 34);
  });
}

/**
 * The backdrop, painted to the size of the screen: sky, clouds piled on the horizon, a far
 * shore, sea running from deep to shallow, a curving beach, and palm fronds reaching in
 * from the top left. Everything is drawn from the theme's colours, so a new look is a new
 * palette and nothing else.
 */
function paintScene(W, H) {
  const q = 0.6;                         // a soft picture: a little over half size is plenty
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(W * q);
  canvas.height = Math.ceil(H * q);
  const g = canvas.getContext('2d');
  g.scale(q, q);
  const rnd = mulberry32(11);            // its own dice: the picture must not disturb the game's
  const horizon = H * 0.52;
  const shore = (u) => H * (0.635 + 0.075 * u + 0.012 * Math.sin(u * 5.2 + 0.6));

  // sky and sun
  g.fillStyle = vGradient(g, 0, horizon, THEME.sky);
  g.fillRect(0, 0, W, horizon + 2);
  const reach = Math.max(W, H) * 0.55;
  const sun = g.createRadialGradient(W * 0.8, H * 0.1, 0, W * 0.8, H * 0.1, reach);
  sun.addColorStop(0, shade(THEME.glow, 0.32));
  sun.addColorStop(1, shade(THEME.glow, 0));
  g.fillStyle = sun;
  g.fillRect(0, 0, W, horizon);

  // clouds: the sea is painted over their feet, which gives them a flat base on the horizon
  const cloud = (cx, cy, size, strength) => {
    g.save();
    g.filter = 'blur(' + Math.max(2, size * 0.012) + 'px)';
    [[0, 0, 0.26], [-0.24, 0.06, 0.19], [0.23, 0.05, 0.2], [-0.45, 0.12, 0.13], [0.44, 0.12, 0.14],
      [0.02, -0.13, 0.17], [-0.14, -0.07, 0.16], [0.16, -0.06, 0.15]].forEach(([dx, dy, r]) => {
      const fill = g.createLinearGradient(0, cy + (dy - r) * size, 0, cy + (dy + r) * size);
      fill.addColorStop(0, shade(THEME.cloud, strength));
      fill.addColorStop(1, shade(THEME.cloud, strength * 0.7));
      g.fillStyle = fill;
      g.beginPath();
      g.arc(cx + dx * size, cy + dy * size, r * size, 0, Math.PI * 2);
      g.fill();
    });
    g.restore();
  };
  cloud(W * 0.8, horizon - H * 0.03, W * 0.66, 0.97);
  cloud(W * 0.2, horizon - H * 0.012, W * 0.44, 0.9);
  cloud(W * 0.52, horizon - H * 0.15, W * 0.3, 0.6);

  // a far shore
  g.fillStyle = shade(THEME.palm[0], 0.9);
  g.beginPath();
  g.moveTo(0, horizon + 2);
  g.quadraticCurveTo(W * 0.2, horizon - H * 0.06, W * 0.48, horizon + 2);
  g.closePath();
  g.fill();
  g.fillStyle = shade(THEME.palm[1], 0.55);
  g.beginPath();
  g.moveTo(0, horizon - H * 0.012);
  g.quadraticCurveTo(W * 0.18, horizon - H * 0.058, W * 0.4, horizon - H * 0.004);
  g.quadraticCurveTo(W * 0.18, horizon - H * 0.03, 0, horizon + 2);
  g.closePath();
  g.fill();

  // sea, with glints
  g.fillStyle = vGradient(g, horizon, shore(1) + 10, THEME.sea);
  g.fillRect(0, horizon, W, H - horizon);
  g.lineCap = 'round';
  for (let i = 0; i < 50; i++) {
    const depth = rnd();
    const y = horizon + 6 + depth * (shore(0.4) - horizon - 30);
    g.strokeStyle = 'rgba(255,255,255,' + (0.12 + 0.2 * rnd()) + ')';
    g.lineWidth = 1.5 + 2.5 * depth;
    const x = rnd() * W;
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + 16 + (30 + 90 * depth) * rnd(), y);
    g.stroke();
  }

  // the beach: shallows, a line of foam, wet sand, dry sand
  const below = (offset) => {
    g.beginPath();
    g.moveTo(0, H);
    for (let i = 0; i <= 48; i++) g.lineTo((i / 48) * W, shore(i / 48) + offset);
    g.lineTo(W, H);
    g.closePath();
  };
  g.save();
  g.filter = 'blur(3px)';
  g.strokeStyle = 'rgba(255,255,255,0.5)';
  g.lineWidth = 5;
  g.beginPath();
  for (let i = 0; i <= 48; i++) g.lineTo((i / 48) * W, shore(i / 48) - 40 + 6 * Math.sin(i * 0.9));
  g.stroke();
  g.restore();
  below(-18); g.fillStyle = 'rgba(255,255,255,0.3)'; g.fill();
  below(-6); g.fillStyle = 'rgba(255,255,255,0.96)'; g.fill();
  below(5); g.fillStyle = shade(THEME.sand[2], 1); g.fill();
  below(24);
  g.fillStyle = vGradient(g, shore(0), H, [shade(THEME.sand[0], 1), shade(THEME.sand[1], 1), shade(THEME.sand[2], 1)]);
  g.fill();
  g.save();
  g.filter = 'blur(10px)';
  [[0.80, 0.014, 1.1, 2.2], [0.91, 0.012, 1.7, 4.1]].forEach(([base, amp, freq, phase]) => {
    g.fillStyle = shade(THEME.sand[2], 0.4);
    g.beginPath();
    g.moveTo(0, H);
    for (let i = 0; i <= 40; i++) {
      const u = i / 40;
      g.lineTo(u * W, H * (base + amp * Math.sin(u * 6.283 * freq * (W / 720) + phase)));
    }
    g.lineTo(W, H);
    g.closePath();
    g.fill();
  });
  g.restore();

  // Palm fronds from the top left corner. Each is one leaf-shaped blade either side of a
  // curved rib, its outer edge cut into points, the way a frond reads from a distance.
  const frond = (ox, oy, angle, length, droop) => {
    const ex = ox + Math.cos(angle) * length;
    const ey = oy + Math.sin(angle) * length + droop * length;
    const cx = ox + Math.cos(angle) * length * 0.5;
    const cy = oy + Math.sin(angle) * length * 0.5 - length * 0.16;
    const rib = [];
    const steps = 22;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = (1 - t) * (1 - t) * ox + 2 * (1 - t) * t * cx + t * t * ex;
      const y = (1 - t) * (1 - t) * oy + 2 * (1 - t) * t * cy + t * t * ey;
      const dx = 2 * (1 - t) * (cx - ox) + 2 * t * (ex - cx);
      const dy = 2 * (1 - t) * (cy - oy) + 2 * t * (ey - cy);
      const d = Math.hypot(dx, dy) || 1;
      rib.push({ x, y, tx: dx / d, ty: dy / d, t });
    }
    for (let side = -1; side <= 1; side += 2) {
      g.beginPath();
      g.moveTo(rib[0].x, rib[0].y);
      rib.forEach((p) => g.lineTo(p.x, p.y));
      for (let i = steps; i >= 0; i--) {
        const p = rib[i];
        const broad = length * 0.2 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.06 + p.t * 0.94)), 0.7);
        const reach = broad * (i % 2 ? 1 : 0.5);                 // every other point is a notch
        const sweep = broad * 0.7;                               // leaflets lean towards the tip
        g.lineTo(p.x + side * -p.ty * reach + p.tx * sweep, p.y + side * p.tx * reach + p.ty * sweep + reach * 0.25);
      }
      g.closePath();
      g.fillStyle = shade(side < 0 ? THEME.palm[1] : THEME.palm[0], 1);
      g.fill();
    }
    g.strokeStyle = shade(THEME.palm[0], 1);
    g.lineWidth = Math.max(2, length * 0.014);
    g.beginPath();
    g.moveTo(ox, oy);
    g.quadraticCurveTo(cx, cy, ex, ey);
    g.stroke();
  };
  const size = Math.min(W, H * 0.6) * 0.62;
  g.save();
  g.shadowColor = 'rgba(0,30,60,0.25)';
  g.shadowBlur = 14;
  g.shadowOffsetY = 8;
  [[1.25, 0.62, 0.2], [0.85, 0.86, 0.26], [0.45, 1.0, 0.2], [0.05, 0.98, 0.1], [-0.4, 0.8, 0.0]]
    .forEach(([angle, long, droop]) => frond(-W * 0.06, H * 0.13, angle, size * long, droop));
  g.restore();

  return new Texture({ source: new PIXI.CanvasSource({ resource: canvas, resolution: q }) });
}

// ---------------------------------------------------------------- interface

function paintButton(w, h, face, edge, outline) {
  const depth = 10;
  return paint(w + 8, h + depth + 8, (g) => {
    g.translate(4, 4);
    const r = h / 2;
    roundRect(g, 0, depth, w, h, r);
    g.fillStyle = edge;
    g.fill();
    g.lineWidth = 2.5;
    g.strokeStyle = outline;
    g.stroke();
    roundRect(g, 0, 0, w, h, r);
    g.fillStyle = vGradient(g, 0, h, face);
    g.fill();
    g.stroke();
    g.save();
    roundRect(g, 0, 0, w, h, r);
    g.clip();
    g.fillStyle = 'rgba(255,255,255,0.28)';
    roundRect(g, 10, 5, w - 20, h * 0.42, h * 0.3);
    g.fill();
    g.restore();
  });
}

/** One half of the score bar. */
function paintCard(w, h, stops, flip) {
  return paint(w + 8, h + 12, (g) => {
    g.translate(4, 4);
    g.shadowColor = 'rgba(3,18,52,0.45)';
    g.shadowBlur = 8;
    g.shadowOffsetY = 4;
    roundRect(g, 0, 0, w, h, 26);
    const grad = g.createLinearGradient(flip ? w : 0, 0, flip ? 0 : w, 0);
    stops.forEach((c, i) => grad.addColorStop(i / (stops.length - 1), c));
    g.fillStyle = grad;
    g.fill();
    g.shadowColor = 'transparent';
    g.save();
    roundRect(g, 0, 0, w, h, 26);
    g.clip();
    g.fillStyle = 'rgba(255,255,255,0.16)';
    g.fillRect(0, 0, w, h * 0.45);
    g.restore();
    roundRect(g, 1.5, 1.5, w - 3, h - 3, 25);
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(255,255,255,0.55)';
    g.stroke();
  });
}

/** A small portrait in a rounded frame: skin, hair and shirt are all that differ. */
function paintPortrait(o) {
  return paint(100, 100, (g) => {
    g.translate(4, 4);
    roundRect(g, 0, 0, 92, 92, 22);
    g.fillStyle = vGradient(g, 0, 92, o.back);
    g.fill();
    g.save();
    roundRect(g, 0, 0, 92, 92, 22);
    g.clip();
    // hair behind the head
    g.fillStyle = o.hair;
    if (o.long) {
      roundRect(g, 14, 16, 64, 84, 30); g.fill();
    } else {
      [[24, 30, 15], [36, 20, 16], [52, 18, 16], [66, 28, 15], [72, 42, 12], [19, 44, 12]].forEach(([x, y, r]) => {
        g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
      });
    }
    // shoulders and neck
    g.fillStyle = o.shirt;
    g.beginPath(); g.ellipse(46, 100, 40, 24, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = o.skinShade;
    g.fillRect(38, 62, 16, 18);
    // head
    g.fillStyle = o.skin;
    g.beginPath(); g.ellipse(46, 46, 22, 25, 0, 0, Math.PI * 2); g.fill();
    // fringe
    g.fillStyle = o.hair;
    g.beginPath();
    if (o.long) {
      g.moveTo(22, 46); g.quadraticCurveTo(24, 16, 50, 20); g.quadraticCurveTo(74, 20, 70, 48);
      g.quadraticCurveTo(64, 30, 46, 30); g.quadraticCurveTo(30, 32, 22, 46);
    } else {
      g.moveTo(24, 38); g.quadraticCurveTo(30, 18, 46, 20); g.quadraticCurveTo(64, 18, 68, 38);
      g.quadraticCurveTo(56, 28, 46, 30); g.quadraticCurveTo(34, 28, 24, 38);
    }
    g.fill();
    // face
    g.fillStyle = 'rgba(255,90,90,0.28)';
    g.beginPath(); g.arc(33, 56, 5.5, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(59, 56, 5.5, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2a1a12';
    g.beginPath(); g.ellipse(37, 47, 3.2, 4.2, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(55, 47, 3.2, 4.2, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(38, 45.5, 1.2, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(56, 45.5, 1.2, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#2a1a12';
    g.lineWidth = 2.6;
    g.lineCap = 'round';
    g.beginPath(); g.arc(46, 54, 9, Math.PI * 0.18, Math.PI * 0.82); g.stroke();
    g.restore();
    roundRect(g, 0, 0, 92, 92, 22);
    g.lineWidth = 5;
    g.strokeStyle = o.frame;
    g.stroke();
  });
}

function paintAppIcon() {
  return paint(132, 132, (g) => {
    g.translate(2, 2);
    roundRect(g, 0, 0, 128, 128, 30);
    g.fillStyle = vGradient(g, 0, 128, ['#4aa6ff', '#1d5fd0']);
    g.fill();
    g.save();
    roundRect(g, 0, 0, 128, 128, 30);
    g.clip();
    g.fillStyle = 'rgba(255,255,255,0.16)';
    g.beginPath(); g.ellipse(64, -6, 96, 56, 0, 0, Math.PI * 2); g.fill();
    const miniTile = (x, y, rot, letter, size) => {
      g.save();
      g.translate(x, y);
      g.rotate(rot);
      const w = size;
      const h = size;
      g.shadowColor = 'rgba(0,20,60,0.45)';
      g.shadowBlur = 8;
      g.shadowOffsetY = 4;
      roundRect(g, -w / 2, -h / 2 + size * 0.13, w, h, size * 0.2);
      g.fillStyle = '#8fa3c8';
      g.fill();
      g.shadowColor = 'transparent';
      roundRect(g, -w / 2, -h / 2, w, h, size * 0.2);
      g.fillStyle = vGradient(g, -h / 2, h / 2, ['#ffffff', '#e4ecf9']);
      g.fill();
      g.fillStyle = '#16264a';
      g.font = '700 ' + Math.round(size * 0.72) + 'px ' + FONT;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText(letter, 0, size * 0.04);
      g.restore();
    };
    miniTile(38, 80, -0.22, 'W', 46);
    miniTile(90, 82, 0.2, 'T', 46);
    miniTile(64, 50, -0.03, 'D', 54);
    g.restore();
    roundRect(g, 0, 0, 128, 128, 30);
    g.lineWidth = 4;
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.stroke();
  });
}

// A pointing hand, anchored at the fingertip. Drawn as outlined shapes first and filled
// shapes on top, so the outline runs around the whole hand rather than each part.
function paintHand() {
  return paint(190, 200, (g) => {
    g.translate(48, 14);
    g.rotate(-0.28);
    const parts = (fill, grow) => {
      g.fillStyle = fill;
      const rr = (x, y, w, h, r) => { roundRect(g, x - grow, y - grow, w + grow * 2, h + grow * 2, r + grow); g.fill(); };
      rr(22, 0, 28, 84, 14);         // index finger
      rr(48, 46, 26, 54, 13);        // middle knuckle
      rr(72, 54, 25, 50, 12);        // ring knuckle
      rr(95, 64, 22, 44, 11);        // little knuckle
      rr(22, 62, 95, 78, 30);        // palm
      g.save();
      g.translate(20, 96);
      g.rotate(-0.75);
      rr(-12, -34, 26, 58, 13);      // thumb
      g.restore();
    };
    g.save();
    g.shadowColor = 'rgba(0,10,40,0.45)';
    g.shadowBlur = 12;
    g.shadowOffsetY = 8;
    parts('#22304f', 5);
    g.restore();
    parts('#ffffff', 0);
    g.strokeStyle = 'rgba(34,48,79,0.28)';
    g.lineWidth = 3;
    g.lineCap = 'round';
    [[50, 72], [73, 76], [96, 82]].forEach(([x, y]) => {
      g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 20); g.stroke();
    });
  });
}

function paintTick() {
  return paint(56, 56, (g) => {
    g.lineCap = 'round';
    g.lineJoin = 'round';
    const path = () => { g.beginPath(); g.moveTo(10, 30); g.lineTo(23, 43); g.lineTo(46, 13); g.stroke(); };
    g.strokeStyle = '#1f6e0a';
    g.lineWidth = 15;
    path();
    g.strokeStyle = '#ffffff';
    g.lineWidth = 9;
    path();
  });
}

let ART = null;

function buildArt() {
  ART = {
    tile: paintTile(),
    tileBack: paintTileBack(true),
    tileBlue: paintTileBack(false),
    tileShadow: paintTileShadow(),
    tileMask: paintTileMask(),
    tileRing: paintTileRing(),
    slot: paintSlot(),
    glow: paintGlow(128),
    star: paintStar(),
    ring: paintRing(),
    dot: paintDot(),
    cloud: paintCloud(),
    cardYou: paintCard(306, 92, ['#3f93f2', '#1b57bd'], false),
    cardFoe: paintCard(306, 92, ['#ff7f99', '#d6345f'], true),
    submitOn: paintButton(300, 84, ['#a6f04a', '#55c41a'], '#2f8a0c', 'rgba(20,80,5,0.65)'),
    tick: paintTick(),
    submitOff: paintButton(300, 84, ['#b4bfd4', '#8792ab'], '#5f6883', 'rgba(30,40,70,0.55)'),
    cta: paintButton(288, 92, ['#8cf06a', '#2fbf3a'], '#17862a', 'rgba(10,80,20,0.65)'),
    ctaBig: paintButton(420, 120, ['#8cf06a', '#2fbf3a'], '#17862a', 'rgba(10,80,20,0.65)'),
    you: paintPortrait({ back: ['#ffe28a', '#ffb547'], skin: '#b97a4c', skinShade: '#a0653b', hair: '#2b1a12', shirt: '#2f86e6', frame: '#ffd84d', long: false }),
    foe: paintPortrait({ back: ['#d6f0ff', '#9fd4ff'], skin: '#f7cfa8', skinShade: '#e8b98f', hair: '#f2c14e', shirt: '#ff6f8f', frame: '#ffffff', long: true }),
    icon: paintAppIcon(),
    hand: paintHand(),
  };
}

function label(text, size, fill, extra) {
  const style = Object.assign({
    fontFamily: FONT, fontWeight: '700', fontSize: size, fill, align: 'center', padding: 10,
  }, extra || {});
  const t = new Text({ text, style });
  t.anchor.set(0.5);
  t.resolution = 2;
  return t;
}

const SHADOW = { color: 0x031234, alpha: 0.45, blur: 4, distance: 3, angle: Math.PI / 2 };

function sprite(texture, ax, ay) {
  const s = new Sprite(texture);
  s.anchor.set(ax === undefined ? 0.5 : ax, ay === undefined ? 0.5 : ay);
  return s;
}
