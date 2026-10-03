/**
 * The link to share for what is on screen. A case has its own page
 * (case/<id>/, made at build time) whose link preview shows that case; the
 * #globe at the end tells the page to send people straight on to the case on
 * the globe (the same page reached from a search result stays put, so search
 * engines index it). Anything else shares the app link as it is. `base` is
 * the app's path ('/Gods-Eye-UAPs/'); pass null where the case pages don't
 * exist (the dev server).
 */
export function shareableUrl(href, base) {
  const u = new URL(href);
  const m = /^#\/case\/([\w-]+)$/.exec(u.hash);
  if (!m || !base) return u.href;
  return new URL(`${base}case/${m[1]}/#globe`, u.origin).href;
}

/** The share link for the running app. */
export const shareLink = (href = location.href) => shareableUrl(href, import.meta.env.DEV ? null : import.meta.env.BASE_URL);

/** Decode one part of a #/… link. A stray % in a typed or cut-off link would otherwise throw. */
export function decodeHashPart(part) {
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}
