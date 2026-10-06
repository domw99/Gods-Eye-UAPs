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

/** The same address as an embed (?embed=1): the globe and the case file only, for an <iframe>. */
export function embedUrl(href) {
  const u = new URL(href);
  u.searchParams.set('embed', '1');
  return u.href;
}

/** The address with the embed flag taken off: the full app at the same place. */
export function withoutEmbed(href) {
  const u = new URL(href);
  u.searchParams.delete('embed');
  return u.href;
}

const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** The <iframe> a page pastes to show an embed. */
export function embedSnippet(url, title = '') {
  const name = title ? `God's Eye // UAP: ${title}` : "God's Eye // UAP";
  return `<iframe src="${attr(url)}" title="${attr(name)}" width="100%" height="600" style="border:0;border-radius:8px" loading="lazy" allow="fullscreen" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;
}
