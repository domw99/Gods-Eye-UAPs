import { SITE_URL } from '../../src/config.js';

/**
 * The public address the build and the scripts write into pages, the sitemap and link previews:
 * SITE_URL from the environment, else the default. Always ends in one slash, because addresses are
 * built as `${site}case/<id>/`; "https://example.org/sub" would otherwise give ".../subcase/<id>/".
 */
export const siteUrl = (value = process.env.SITE_URL) => `${(String(value ?? '').trim() || SITE_URL).replace(/\/+$/, '')}/`;
