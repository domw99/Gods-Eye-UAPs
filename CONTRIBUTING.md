# Contributing

Thank you for helping. The most useful contributions are corrections and new cases **with sources**; code changes are welcome too. For the full developer guide (commands, conventions, releases) read [AGENTS.md](AGENTS.md).

## Corrections and new cases, without code

In the app, every case has **Suggest a correction**, and the footer of the case list has **Suggest a case**. They open pre-filled [issue forms](https://github.com/domw99/Gods-Eye-UAPs/issues/new/choose). A good report links the source that disagrees with the file (a document, a newspaper of the time, an official release), not only a recollection.

## Adding a case

A case needs evidence beyond a single anecdote: radar, video or photographs, official documents, physical traces, or many independent witnesses. Every case is written in the same shape; copy a recent one from `src/data/cases/more-encounters.js`.

1. Add it to a file in `src/data/cases/` (they are merged and sorted by date in `index.js`).
2. Fill in what the sources support and no more:
   - `id` (lower-case, with the year), `title`, `date` (ISO with the local UTC offset; add `timeApprox: true` when the time is a guess), `place`, `country`, `cc`, `lat`, `lon`, `precision` (`site`, `city`, `area` or `region`).
   - `category`, `evidence` (a list), `shape`, `witnesses`, `duration`.
   - `status`, and an `explanation` for anything that is not `unresolved`: `explained` (an accepted cause), `disputed` (a proposed cause that is not settled), `unresolved` (no accepted explanation), `hoax`.
   - `summary` (what happened, in plain prose), `timeline`, `sources` (at least one `official`, `primary` or `reference` link).
   - Optional: `tracks` (a reconstructed flight path; each says its `basis`, and `approximate` is honest when it is drawn from descriptions), `observers`, `media` (Commons files, DVIDS ids, Internet Archive items) and `wiki`.
3. Run `npm run verify:media && npm test`. The tests check coordinates, dates, the taxonomy, plausible altitudes and track times.
4. Open a pull request. The share card is drawn on GitHub after merge (**Share cards** workflow).

Say what is **documented**, what is **only claimed**, and what the **best explanation** is. Do not present a claim as a fact, and do not drop a debunking because the case is more fun without it.

## Code changes

```sh
npm ci
npm run dev        # http://localhost:5173
npm test           # before every commit
npm run build && npm run e2e   # when you changed what the browser shows
```

- Keep changes small and focused; explain why in the pull request.
- Interface text goes through `t()` and needs all 15 languages. If you cannot translate, say so in the pull request and it will be done; do not leave a key in only some files, because the tests fail on that.
- Add a test with the change. Logic goes in a module `tests/` can import; behaviour in a browser goes in `e2e/`.
- No new network services without a line in [DATA_SOURCES.md](DATA_SOURCES.md), and nothing that needs a key.

## Translations

Corrections from native speakers are very welcome: edit the entry in `src/i18n/locales/<code>.js` (the key is the English text; keep the `{placeholders}`). Open a pull request, or an issue if you would rather not use git.

## Conduct and security

Please follow the [code of conduct](CODE_OF_CONDUCT.md). Report a vulnerability privately as described in [SECURITY.md](SECURITY.md), not in a public issue.
