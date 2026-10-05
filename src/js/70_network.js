// The only part that knows about ad networks: how to open the store, when the ad may
// start, and when it must go quiet. Each SDK is detected at run time, so one build runs
// in a plain browser and inside the networks that inject their own API.

const Net = (() => {
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let paused = false;
  let toastTimer = 0;

  function storeUrl() {
    const urls = CFG.storeUrl || {};
    return (isIOS ? urls.ios : urls.android) || urls.android || urls.ios || '';
  }

  function toast(message) {
    let el = document.getElementById('playable-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'playable-toast';
      el.style.cssText = 'position:fixed;left:50%;bottom:12%;transform:translateX(-50%);padding:10px 18px;'
        + 'border-radius:999px;background:rgba(6,22,51,.92);color:#fff;font:600 14px/1.2 system-ui,sans-serif;'
        + 'pointer-events:none;transition:opacity .25s;z-index:10;white-space:nowrap';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.style.opacity = '0'; }, 1800);
  }

  function openStore() {
    const url = storeUrl();
    try {
      if (window.FbPlayableAd && window.FbPlayableAd.onCTAClick) { window.FbPlayableAd.onCTAClick(); return; }      // Meta
      if (window.ExitApi && window.ExitApi.exit) { window.ExitApi.exit(); return; }                                // Google
      if (window.playableSDK && window.playableSDK.openAppStore) { window.playableSDK.openAppStore(); return; }    // TikTok, Pangle
      if (window.dapi && window.dapi.openStoreUrl) { window.dapi.openStoreUrl(); return; }                         // ironSource (DAPI)
      if (typeof window.install === 'function') { window.install(); return; }                                      // Mintegral
      if (CFG.network === 'vungle') { window.parent.postMessage('download', '*'); return; }                        // Liftoff / Vungle
      if (window.mraid && window.mraid.open) { window.mraid.open(url); return; }                                   // AppLovin, Unity, MRAID in general
    } catch (_) { /* fall through to the plain link */ }
    if (CFG.network === 'preview' || !url) { toast('Store page opens here (preview build)'); return; }
    window.open(url, '_blank');
  }

  function setPaused(value) {
    if (value === paused) return;
    paused = value;
    gsap.globalTimeline.paused(value);
    if (APP) { if (value) APP.ticker.stop(); else APP.ticker.start(); }
    if (value) Sfx.suspend(); else Sfx.resume();
  }

  /** Calls `start` once the ad is actually on screen. */
  function ready(start) {
    let started = false;
    const go = () => { if (!started) { started = true; start(); } };
    document.addEventListener('visibilitychange', () => setPaused(document.hidden));

    const mraid = window.mraid;
    const dapi = window.dapi;
    if (mraid && mraid.addEventListener) {
      const onReady = () => {
        mraid.addEventListener('viewableChange', (viewable) => { if (viewable) go(); setPaused(!viewable); });
        if (mraid.isViewable && mraid.isViewable()) go();
        try { mraid.addEventListener('audioVolumeChange', (volume) => Sfx.setMuted(!volume)); } catch (_) { /* MRAID 2 */ }
      };
      if (mraid.getState && mraid.getState() === 'loading') mraid.addEventListener('ready', onReady);
      else onReady();
      setTimeout(go, 3000);                 // never leave a blank ad if the event is lost
    } else if (dapi && dapi.addEventListener) {
      const onReady = () => {
        dapi.addEventListener('viewableChange', (e) => { if (e.isViewable) go(); setPaused(!e.isViewable); });
        dapi.addEventListener('audioVolumeChange', (volume) => Sfx.setMuted(!volume));
        if (dapi.isViewable()) go();
      };
      if (dapi.isReady()) onReady(); else dapi.addEventListener('ready', onReady);
      setTimeout(go, 3000);
    } else {
      go();
    }

    // Mintegral drives the creative through these globals.
    if (typeof window.gameStart !== 'function') window.gameStart = () => setPaused(false);
    if (typeof window.gameClose !== 'function') window.gameClose = () => setPaused(true);
    try { if (typeof window.gameReady === 'function') window.gameReady(); } catch (_) { /* optional */ }
  }

  function gameEnd() {
    try {
      if (typeof window.gameEnd === 'function') window.gameEnd();                                  // Mintegral
      if (CFG.network === 'vungle') window.parent.postMessage('complete', '*');                    // Liftoff / Vungle
    } catch (_) { /* optional */ }
  }

  return { openStore, ready, gameEnd, setPaused };
})();
