/** Where the project lives, for "suggest a correction" links. */
export const REPO = 'domw99/Gods-Eye-UAPs';
export const REPO_URL = `https://github.com/${REPO}`;

/** Who made it: credited in small print around the app, on share cards and case pages. */
export const AUTHOR = 'domw99';
export const AUTHOR_URL = 'https://github.com/domw99';

export function correctionUrl(caseId, title) {
  const params = new URLSearchParams({ template: 'case-correction.yml', title: `Correction: ${title}`, 'case-id': caseId });
  return `${REPO_URL}/issues/new?${params}`;
}
