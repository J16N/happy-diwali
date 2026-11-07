// "Install as an app". Chrome, Edge and Samsung Internet offer a real install
// prompt (beforeinstallprompt). iPhone and iPad have no prompt: there the
// menu item shows how to use Safari's "Add to Home Screen".

let deferred = null;

export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches ||
  matchMedia('(display-mode: fullscreen)').matches ||
  navigator.standalone === true;

export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

/** Calls onChange whenever installing becomes possible or is done. */
export function watchInstall(onChange) {
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // we offer it from our own menu instead of the browser's mini bar
    deferred = e;
    onChange();
  });
  addEventListener('appinstalled', () => {
    deferred = null;
    onChange();
  });
}

/** 'prompt' (browser install dialog), 'ios' (show instructions) or '' (not possible / already installed). */
export function installMode() {
  if (isStandalone()) return '';
  if (deferred) return 'prompt';
  if (isIOS()) return 'ios';
  return '';
}

/** Shows the browser's install dialog. -> true if the visitor installed. */
export async function promptInstall() {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  e.prompt();
  const choice = await e.userChoice.catch(() => null);
  return choice?.outcome === 'accepted';
}
