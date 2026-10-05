// Every sound in the ad is made here with Web Audio: the effects and the music. There are
// no audio files. Nothing plays before the first touch, which browsers and ad networks
// both require.
//
// Everything that is asked to play is also written down with the ad's own time, so the
// same sounds can be rendered afterwards as the soundtrack of a video (see `render`).

const Sfx = (() => {
  let ctx = null;             // the live context, or the offline one while a soundtrack is rendered
  let master = null;          // effects
  let musicBus = null;        // music, quieter
  let noiseBuffer = null;
  let muted = !CFG.sound;
  let base = null;            // while rendering: the moment the sound being replayed starts
  let musicFrom = null;       // the ad's time when the music started
  let musicTimer = null;
  let nextStep = 0;
  let nextTime = 0;
  const log = [];

  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];     // major pentatonic, in semitones
  const note = (semitones, from) => (from || 523.25) * Math.pow(2, semitones / 12);
  const pitch = (midi) => 440 * Math.pow(2, (midi - 69) / 12);
  const adTime = () => (Clock.manual ? Clock.now : (performance.now() - T0) / 1000);

  /** The buses and the noise source, for a live context or an offline one. */
  function graph(context) {
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -8;
    limiter.ratio.value = 6;
    limiter.connect(context.destination);
    const out = context.createGain();
    out.gain.value = 0.9;
    out.connect(limiter);
    const music = context.createGain();
    music.gain.value = 0.0001;
    music.connect(limiter);
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.5), context.sampleRate);
    const data = buffer.getChannelData(0);
    const dice = mulberry32(5);
    for (let i = 0; i < data.length; i++) data[i] = dice() * 2 - 1;
    return { out, music, buffer };
  }

  /**
   * Builds the audio graph, silent and suspended. It is done while the tiles are being
   * dealt: setting it up costs a few tens of milliseconds on a slow phone, and doing it
   * on the first touch made that touch stutter.
   */
  function prepare() {
    if (muted || ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { muted = true; return; }
    try {
      ctx = new AC();
      const g = graph(ctx);
      master = g.out;
      musicBus = g.music;
      noiseBuffer = g.buffer;
      ctx.onstatechange = () => { if (ctx && ctx.state === 'running') startMusic(); };
    } catch (_) {
      ctx = null;
      muted = true;
    }
  }

  /** The first touch lets the sound start. */
  function unlock() {
    if (musicFrom === null) musicFrom = adTime();
    prepare();
    if (!ctx || muted) return;
    if (ctx.state === 'suspended') ctx.resume();
    startMusic();
  }

  const live = () => !!ctx && !muted && ctx.state === 'running';
  const audible = () => base !== null || live();
  const now = () => (base !== null ? base : ctx.currentTime);

  // ---- two voices everything is built from

  function voice(o, t, bus) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + o.d);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(o.v || 0.2, t + (o.attack || 0.008));
    gain.gain.exponentialRampToValueAtTime(0.0001, t + o.d);
    osc.connect(gain).connect(bus || master);
    osc.start(t);
    osc.stop(t + o.d + 0.03);
  }

  function hiss(o, t, bus) {
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    src.buffer = noiseBuffer;
    filter.type = o.type || 'bandpass';
    filter.frequency.setValueAtTime(o.f, t);
    if (o.to) filter.frequency.exponentialRampToValueAtTime(o.to, t + o.d);
    filter.Q.value = o.q || 0.8;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(o.v || 0.15, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + o.d);
    src.connect(filter).connect(gain).connect(bus || master);
    src.start(t);
    src.stop(t + o.d + 0.03);
  }

  const tone = (o) => voice(o, now() + (o.at || 0));
  const noise = (o) => hiss(o, now() + (o.at || 0));

  // A soft bell: a fundamental with a quieter, shorter overtone.
  function bell(f, at, v, d) {
    tone({ f, at, d: d || 0.42, v: v || 0.2, type: 'sine' });
    tone({ f: f * 2.01, at, d: (d || 0.42) * 0.5, v: (v || 0.2) * 0.35, type: 'sine' });
    tone({ f: f * 3.0, at, d: 0.08, v: (v || 0.2) * 0.2, type: 'triangle' });
  }

  // ---- the effects

  const sounds = {
    /** A letter going into the tray; each one a step higher. */
    tap(i) {
      const f = note(SCALE[clamp(i, 0, SCALE.length - 1)]);
      tone({ f, d: 0.2, v: 0.22, type: 'triangle' });
      tone({ f: f * 2, d: 0.09, v: 0.07, type: 'sine' });
      noise({ f: 2600, d: 0.035, v: 0.05, type: 'highpass' });
    },
    untap() { tone({ f: 392, to: 262, d: 0.13, v: 0.14, type: 'triangle' }); },
    locked() {
      tone({ f: 150, d: 0.09, v: 0.16, type: 'square' });
      tone({ f: 118, at: 0.07, d: 0.11, v: 0.14, type: 'square' });
    },
    invalid() {
      tone({ f: 233, to: 147, d: 0.24, v: 0.13, type: 'sawtooth' });
      tone({ f: 220, to: 139, d: 0.24, v: 0.1, type: 'square' });
    },
    ready() { bell(note(12), 0, 0.1, 0.25); },
    /** A word accepted: an arpeggio that climbs further for longer words. */
    word(length) {
      const steps = [0, 4, 7, 12, 16, 19, 24].slice(0, clamp(length - 1, 3, 7));
      steps.forEach((s, i) => bell(note(s), i * 0.065, 0.2));
      noise({ f: 5200, at: steps.length * 0.065, d: 0.3, v: 0.05, type: 'highpass' });
    },
    coin(i) { tone({ f: note(12 + (i % 5) * 2), d: 0.08, v: 0.1, type: 'square' }); },
    botTap(i) { tone({ f: note(SCALE[clamp(i, 0, 9)], 261.63), d: 0.16, v: 0.16, type: 'sine' }); },
    botWord() { [0, 3, 7].forEach((s, i) => bell(note(s, 261.63), i * 0.08, 0.14, 0.3)); },
    deal() { noise({ f: 1800, d: 0.05, v: 0.07, type: 'bandpass', q: 1.5 }); },
    flip() {
      noise({ f: 900, to: 3200, d: 0.12, v: 0.09 });
      tone({ f: 660, to: 990, d: 0.1, v: 0.08, type: 'triangle' });
    },
    turn() { bell(note(7), 0, 0.12, 0.3); bell(note(12), 0.09, 0.12, 0.35); },
    win() {
      [0, 4, 7, 12].forEach((s, i) => bell(note(s), i * 0.11, 0.22, 0.5));
      [12, 16, 19, 24].forEach((s) => bell(note(s), 0.5, 0.14, 1.1));
      noise({ f: 6000, at: 0.5, d: 0.7, v: 0.05, type: 'highpass' });
    },
    lose() { [7, 4, 0].forEach((s, i) => bell(note(s, 392), i * 0.16, 0.18, 0.55)); },
    click() { tone({ f: 880, d: 0.06, v: 0.14, type: 'triangle' }); },
  };

  // ---- the music
  //
  // An eight-bar loop in C, the key the effects are in, so a scored word lands on the tune
  // rather than across it. A kalimba carries a small melody over a marimba figure, with a
  // soft bass on the first and third beats and a shaker; the off-beats are played a little
  // late, which is what makes it amble instead of march.

  const TEMPO = 100;
  const EIGHTH = 60 / TEMPO / 2;
  const LATE = 0.16;                         // of an eighth: the swing
  const MUSIC_LEVEL = 1.5;
  const C = [60, 64, 67];
  const AM = [57, 60, 64];
  const F = [53, 57, 60];
  const G = [55, 59, 62];
  const BARS = [
    { chord: C, bass: 48, lead: [76, 0, 79, 0, 84, 0, 81, 79] },
    { chord: AM, bass: 45, lead: [76, 0, 0, 74, 76, 0, 72, 0] },
    { chord: F, bass: 41, lead: [81, 0, 84, 0, 81, 79, 77, 0] },
    { chord: G, bass: 43, lead: [79, 0, 74, 0, 79, 81, 83, 0] },
    { chord: C, bass: 48, lead: [84, 0, 79, 0, 76, 0, 79, 81] },
    { chord: AM, bass: 45, lead: [81, 0, 76, 0, 72, 0, 76, 0] },
    { chord: F, bass: 41, lead: [77, 0, 81, 0, 84, 0, 81, 77] },
    { chord: G, bass: 43, lead: [79, 0, 83, 0, 86, 0, 0, 0] },
  ];
  const FIGURE = [0, 2, 1, 2, 0, 2, 1, 2];   // which note of the chord the marimba plays on each eighth

  /** A struck bar: a fundamental that rings, and a high partial that is gone almost at once. */
  function struck(f, t, level, ring) {
    voice({ f, d: ring, v: level, type: 'sine', attack: 0.004 }, t, musicBus);
    voice({ f: f * 4, d: 0.07, v: level * 0.22, type: 'sine', attack: 0.002 }, t, musicBus);
  }

  /** Everything that sounds on one eighth note. `index` counts eighths from the start. */
  function playStep(index, time) {
    const bar = BARS[Math.floor(index / 8) % BARS.length];
    const s = index % 8;
    const t = time + (s % 2 ? EIGHTH * LATE : 0);
    if (bar.lead[s]) struck(pitch(bar.lead[s]), t, 0.085, 0.6);
    struck(pitch(bar.chord[FIGURE[s]]), t, s % 2 ? 0.03 : 0.045, 0.3);
    if (s === 0 || s === 4) {
      voice({ f: pitch(bar.bass), d: 0.5, v: 0.11, type: 'triangle', attack: 0.012 }, t, musicBus);
    }
    hiss({ f: 7000, d: 0.045, v: s % 2 ? 0.02 : 0.011, type: 'highpass' }, t, musicBus);
    if (s === 0) {
      // a soft chord under the bar, swelling in and out
      bar.chord.forEach((m) => {
        voice({ f: pitch(m + 12), d: EIGHTH * 8, v: 0.014, type: 'triangle', attack: EIGHTH * 2.5 }, t, musicBus);
      });
    }
  }

  function startMusic() {
    if (!CFG.music || musicTimer || !live()) return;
    nextStep = 0;
    nextTime = ctx.currentTime + 0.12;
    musicBus.gain.setValueAtTime(0.0001, ctx.currentTime);
    musicBus.gain.exponentialRampToValueAtTime(MUSIC_LEVEL, ctx.currentTime + 1.2);
    const pump = () => {
      if (!live()) return;
      while (nextTime < ctx.currentTime + 0.35) {
        playStep(nextStep, nextTime);
        nextStep += 1;
        nextTime += EIGHTH;
      }
    };
    musicTimer = setInterval(pump, 80);
    pump();
  }

  // ---- the same sounds as a file

  /**
   * Renders what has been played so far, music included, as a mono WAV file (base64).
   * The production line uses it for the soundtrack of the video.
   */
  async function render(seconds) {
    const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const rate = 44100;
    const offline = new Offline(1, Math.ceil(rate * seconds), rate);
    const kept = { ctx, master, musicBus, noiseBuffer };
    const g = graph(offline);
    ctx = offline;
    master = g.out;
    musicBus = g.music;
    noiseBuffer = g.buffer;
    try {
      if (CFG.music && musicFrom !== null && musicFrom < seconds) {
        musicBus.gain.setValueAtTime(0.0001, musicFrom);
        musicBus.gain.exponentialRampToValueAtTime(MUSIC_LEVEL, musicFrom + 1.2);
        for (let i = 0, t = musicFrom + 0.12; t < seconds; i++, t += EIGHTH) playStep(i, t);
      }
      log.forEach((entry) => {
        if (entry.t >= seconds) return;
        base = entry.t;
        sounds[entry.name](...entry.args);
      });
    } finally {
      base = null;
      ctx = kept.ctx;
      master = kept.master;
      musicBus = kept.musicBus;
      noiseBuffer = kept.noiseBuffer;
    }
    const samples = (await offline.startRendering()).getChannelData(0);
    const bytes = new Uint8Array(44 + samples.length * 2);
    const view = new DataView(bytes.buffer);
    const text = (at, s) => { for (let i = 0; i < s.length; i++) bytes[at + i] = s.charCodeAt(i); };
    text(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); text(8, 'WAVEfmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true);
    view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, clamp(samples[i], -1, 1) * 32767, true);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(binary);
  }

  const api = {
    prepare,
    unlock,
    render,
    suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); },
    resume() { if (ctx && !muted && ctx.state === 'suspended') ctx.resume(); },
    setMuted(value) { muted = value; if (muted) this.suspend(); else this.resume(); },
  };
  Object.keys(sounds).forEach((name) => {
    api[name] = (...args) => {
      log.push({ name, args, t: adTime() });
      if (audible()) sounds[name](...args);
    };
  });
  return api;
})();
