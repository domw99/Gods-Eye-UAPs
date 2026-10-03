#!/usr/bin/env node
/**
 * Ask the Internet Archive's Wayback Machine to keep a copy of the main pages
 * (the app, the case index and the open data), so a dated copy of each version
 * stays readable and citable. Best effort: the service is slow and rate
 * limited, and a refusal is logged, not treated as a failure.
 *
 *   node scripts/archive-pages.mjs
 */
const SITE = process.env.SITE_URL || 'https://domw99.github.io/Gods-Eye-UAPs/';
const PAGES = [SITE, `${SITE}case/`, `${SITE}open-data/`];

for (const url of PAGES) {
  try {
    const res = await fetch(`https://web.archive.org/save/${url}`, {
      headers: { 'User-Agent': 'GodsEyeUAP-archiver (+https://github.com/domw99/Gods-Eye-UAPs)' },
      redirect: 'manual',
      signal: AbortSignal.timeout(150_000),
    });
    const where = res.headers.get('content-location') || res.headers.get('location') || '';
    console.log(`Wayback Machine: ${url} → ${res.status}${where ? ` ${where}` : ''}`);
  } catch (e) {
    console.log(`Wayback Machine: ${url} → ${e.name}: ${e.message}`);
  }
  await new Promise((r) => setTimeout(r, 15_000)); // stay well inside the service's rate limit
}
