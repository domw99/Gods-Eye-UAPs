import { html } from '../util/dom.js';
import { t } from '../i18n/index.js';

/**
 * Where a post can be started with the text and the link already filled in:
 * each opens the site's own "new post" page in a new tab, where the person
 * reads it and posts it themselves.
 */
export function shareTargets({ url, text, title }) {
  const e = encodeURIComponent;
  const both = `${text} ${url}`;
  return [
    { id: 'x', name: 'X', href: `https://twitter.com/intent/tweet?text=${e(text)}&url=${e(url)}` },
    { id: 'reddit', name: 'Reddit', href: `https://www.reddit.com/submit?url=${e(url)}&title=${e(title)}` },
    { id: 'bluesky', name: 'Bluesky', href: `https://bsky.app/intent/compose?text=${e(both)}` },
    { id: 'facebook', name: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${e(url)}` },
    { id: 'whatsapp', name: 'WhatsApp', href: `https://wa.me/?text=${e(both)}` },
    { id: 'telegram', name: 'Telegram', href: `https://t.me/share/url?url=${e(url)}&text=${e(text)}` },
    { id: 'linkedin', name: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${e(url)}` },
    { id: 'email', name: t('Email'), href: `mailto:?subject=${e(title)}&body=${e(`${text}\n\n${url}`)}` },
  ];
}

/** The row of "post it on …" links. */
export const shareRow = (o) =>
  html`<div class="btn-row share-targets">${shareTargets(o).map(
    (s) => html`<a class="chip" data-share-target="${s.id}" href="${s.href}" target="_blank" rel="noopener">${s.name}</a>`,
  )}</div>`;
