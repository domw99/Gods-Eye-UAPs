/**
 * The link to share for what is on screen. A case has its own page
 * (case/<id>/, made at build time) whose link preview shows that case; the
 * page sends people on to the case on the globe. Anything else shares the
 * app link as it is. `base` is the app's path ('/Gods-Eye-UAPs/'); pass
 * null where the case pages don't exist (the dev server).
 */
export function shareableUrl(href, base) {
  const u = new URL(href);
  const m = /^#\/case\/([\w-]+)$/.exec(u.hash);
  if (!m || !base) return u.href;
  return new URL(`${base}case/${m[1]}/`, u.origin).href;
}

/** The share link for the running app. */
export const shareLink = (href = location.href) => shareableUrl(href, import.meta.env.DEV ? null : import.meta.env.BASE_URL);
