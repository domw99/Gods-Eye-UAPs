/** Where the project lives, for "suggest a correction" links. */
export const REPO = 'domw99/Gods-Eye-UAPs';
export const REPO_URL = `https://github.com/${REPO}`;

/** The release this build belongs to (the "what's new" note, the open data). */
export const RELEASE = '1.8';

/** The public address, for links and link previews outside the app. */
export const SITE_URL = 'https://domw99.github.io/Gods-Eye-UAPs/';

/** Who made it: credited in small print around the app, on share cards and case pages. */
export const AUTHOR = 'domw99';
export const AUTHOR_URL = 'https://github.com/domw99';

export function correctionUrl(caseId, title) {
  const params = new URLSearchParams({ template: 'case-correction.yml', title: `Correction: ${title}`, 'case-id': caseId });
  return `${REPO_URL}/issues/new?${params}`;
}
