/**
 * "Save to the home screen". Chrome, Edge and most Android browsers can
 * install the app with one tap (the beforeinstallprompt event); iPhones and
 * iPads need the Share menu, and some browsers only have a menu entry, so
 * those get step-by-step help instead. The button is hidden once the app is
 * installed or open as an installed app, and on a desktop browser that can't
 * install it.
 */
export function detectPlatform(nav = globalThis.navigator ?? {}, win = globalThis) {
  const ua = nav.userAgent || '';
  const touch = (nav.maxTouchPoints || 0) > 1;
  const ios = /iPhone|iPad|iPod/.test(ua) || (nav.platform === 'MacIntel' && touch); // iPadOS says it is a Mac
  const android = /Android/.test(ua);
  const coarse = win.matchMedia?.('(pointer: coarse)').matches ?? false;
  const standalone = Boolean(win.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true);
  let browser = 'other';
  if (/CriOS|Chrome\//.test(ua) && !/Edg|OPR|SamsungBrowser/.test(ua)) browser = 'chrome';
  if (/FxiOS|Firefox/.test(ua)) browser = 'firefox';
  if (/SamsungBrowser/.test(ua)) browser = 'samsung';
  if (/Edg/.test(ua)) browser = 'edge';
  if (ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)) browser = 'safari';
  return { ios, android, coarse, standalone, browser, phone: ios || android || coarse };
}

/** The steps that save the app on this device, most specific first. */
export function installSteps({ ios, android, browser }) {
  if (ios)
    return browser === 'safari'
      ? ['Tap the Share button (the square with an arrow) in the bottom bar.', 'Scroll down and tap “Add to Home Screen”.', 'Tap “Add”. God’s Eye opens from your home screen like an app.']
      : ['Tap the Share button (the square with an arrow) in the browser’s bar.', 'Scroll down and tap “Add to Home Screen”. If you don’t see it, open this page in Safari first.', 'Tap “Add”. God’s Eye opens from your home screen like an app.'];
  if (android)
    return browser === 'firefox'
      ? ['Tap the ⋮ menu.', 'Tap “Install”.', 'Confirm. God’s Eye opens from your home screen like an app.']
      : ['Tap the ⋮ menu (top right).', 'Tap “Install app” or “Add to Home screen”.', 'Confirm. God’s Eye opens from your home screen like an app.'];
  return ['Open the browser’s menu, or look for an install icon in the address bar.', 'Choose “Install God’s Eye” (or “Add to Home screen”).', 'Confirm. It opens in its own window like an app.'];
}

/** Wire the button. `onHelp(platform)` opens the step-by-step help. Returns { refresh }. */
export function createInstall({ button, onHelp, onInstalled = () => {} }) {
  const platform = detectPlatform();
  let deferred = null;

  function refresh() {
    const fresh = detectPlatform();
    // Phones always get the button (with help when there is no one-tap prompt);
    // other devices only when the browser offers to install it.
    button.hidden = fresh.standalone || !(deferred || fresh.phone);
    document.body.classList.toggle('can-install', !button.hidden);
  }

  globalThis.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    refresh();
  });
  globalThis.addEventListener('appinstalled', () => {
    deferred = null;
    refresh();
    onInstalled();
  });
  globalThis.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', refresh);
  button.addEventListener('click', async () => {
    if (!deferred) return onHelp(detectPlatform());
    const prompt = deferred;
    deferred = null; // a prompt can be used once
    prompt.prompt();
    const { outcome } = await prompt.userChoice.catch(() => ({ outcome: 'dismissed' }));
    if (outcome !== 'accepted') onHelp(detectPlatform());
    refresh();
  });
  refresh();
  return { refresh, platform };
}
