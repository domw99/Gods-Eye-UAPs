/** Where the project lives, for "suggest a correction" links. */
export const REPO = 'domw99/Gods-Eye-UAPs';
export const REPO_URL = `https://github.com/${REPO}`;

export function correctionUrl(caseId, title) {
  const params = new URLSearchParams({ template: 'case-correction.yml', title: `Correction: ${title}`, 'case-id': caseId });
  return `${REPO_URL}/issues/new?${params}`;
}
