# Security

## What this is, security-wise

God's Eye // UAP is a **static website**: no server code, no accounts, no database and no API keys. The attack surface is the browser app itself and the third-party services it calls (listed in [DATA_SOURCES.md](DATA_SOURCES.md)). Everything you enter stays in your browser's `localStorage`: your language, starred cases, your own sighting log, panel choices and, if you provide them, a Google Maps key or a Cesium ion token.

## Reporting a vulnerability

Please report privately, so a fix can ship before the details are public: use GitHub's [private vulnerability reporting](https://github.com/domw99/Gods-Eye-UAPs/security/advisories/new). If that form is not available to you, open an issue that says you have a security report **without** the details, and a private channel will be arranged.

Useful reports include a way to run script in the app from data it loads (for example a crafted case, record, link or `#/` route), a way to leak what is in `localStorage`, an open redirect, or a dependency with a known exploitable flaw that the app really uses. Reports that need a modified browser, a malicious extension or physical access to the device are out of scope. So are findings about the third-party services themselves; report those to their owners.

You will get an acknowledgement within a few days. Fixes are released as soon as they are tested, and credit is given unless you prefer not.

## How the app limits harm

- **Untrusted text is escaped.** Anything from a dataset, a link, a search box or an API reaches the page through `html\`\`` / `th()` in `src/util/dom.js`, which escape values; raw HTML is marked explicitly with `raw()` and used only for fixed markup. URLs shown as links go through `safeUrl()` (web addresses only).
- **Links to other sites** open with `rel="noopener"`.
- **Third-party embeds** (DVIDS and Internet Archive players) load only after you click play or open the record.
- **Keys you paste stay on your device.** The in-app MAP panel stores a Google Maps key or Cesium ion token in `localStorage`; nothing is sent anywhere but the provider it is for. A key built into a deployed site is visible to every visitor, so restrict such keys to your domain.
- **The service worker** (`public/sw.js`) only handles this site's own files; other origins are left to the network.
- **Dependencies** are pinned by `package-lock.json`, watched by Dependabot, and scanned by CodeQL. The libraries that ship in the bundle are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Supported versions

Only the latest release, as published at https://domw99.github.io/Gods-Eye-UAPs/, is supported.
