#!/usr/bin/env node
/**
 * Write CHANGELOG.md from the release notes in .github/release-notes/, newest
 * first. The notes are the source: edit them (and re-run this) rather than the
 * changelog. Each release is dated by the commit that added its notes.
 *
 *   npm run build:changelog
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './lib/is-main.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const NOTES = '.github/release-notes';
const REPO = 'https://github.com/domw99/Gods-Eye-UAPs';

const version = (file) => file.replace(/^v|\.md$/g, '');
const parts = (v) => v.split('.').map(Number);
/** Newest version first. */
export const byVersionDesc = (a, b) => {
  const [x, y] = [parts(a), parts(b)];
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (y[i] || 0) - (x[i] || 0);
  return 0;
};

/** What a release note says, without the lines meant for the release page (the app link, the maker's credit). */
export function noteBody(text) {
  return text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => !/^### ▶ \[Open the live app\]/.test(l) && !/^<sub>made by/.test(l))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const localDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * The date of the commit that added a note. A note that is not committed yet is the release being made
 * (the release steps run this before the commit), so it is dated today rather than "undated" for good.
 * Empty when git cannot say.
 */
export function addedOn(file, today = new Date()) {
  try {
    const out = execFileSync('git', ['log', '--diff-filter=A', '--follow', '--format=%ad', '--date=short', '--', `${NOTES}/${file}`], { cwd: ROOT, encoding: 'utf8' }).trim().split('\n');
    return out.at(-1) || localDate(today);
  } catch {
    return '';
  }
}

export function buildChangelog(dates = {}) {
  const files = readdirSync(path.join(ROOT, NOTES)).filter((f) => /^v\d+(\.\d+)*\.md$/.test(f)).sort((a, b) => byVersionDesc(version(a), version(b)));
  const lines = [
    '# Changelog',
    '',
    "What changed in each release of God's Eye // UAP, newest first. This file is generated from [`.github/release-notes/`](.github/release-notes) by `npm run build:changelog`; the same notes are the text of each [GitHub release](" + REPO + '/releases).',
    '',
  ];
  for (const f of files) {
    const v = version(f);
    const date = dates[f] ?? addedOn(f);
    lines.push(`## [${v}] — ${date || 'undated'}`, '', `[Release page](${REPO}/releases/tag/v${v})`, '', noteBody(readFileSync(path.join(ROOT, NOTES, f), 'utf8')), '');
  }
  return `${lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()}\n`;
}

if (isMain(import.meta.url)) {
  const out = buildChangelog();
  writeFileSync(path.join(ROOT, 'CHANGELOG.md'), out);
  console.log(`CHANGELOG.md: ${out.split('\n').length} lines`);
}
