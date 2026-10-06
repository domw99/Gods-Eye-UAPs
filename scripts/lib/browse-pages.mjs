/**
 * Browse pages: the case files grouped by country, decade, status, kind of
 * encounter, evidence and shape, one static page per group (browse/country/fr/,
 * browse/status/unresolved/ …) and a page that lists the groups (browse/).
 * They give search engines pages for what people look for ("UFO cases from
 * France", "unresolved UFO cases", "radar UFO cases") and give readers a way
 * to browse without the globe. A group needs at least two cases; a single case
 * is just its own page.
 */
import { STATUS, CATEGORY, EVIDENCE, SHAPES, shapeClasses } from '../../src/data/taxonomy.js';
import { esc, pageShell } from './page-shell.mjs';
import { caseDate } from './case-pages.mjs';

export const MIN_CASES = 2;

/** What a category is called in the plural, in a title. */
export const CATEGORY_PLURAL = {
  'military-encounter': 'Military encounters',
  aviation: 'Aviation encounters',
  'radar-visual': 'Radar-visual cases',
  'mass-sighting': 'Mass sightings',
  'photo-video': 'Photo and video cases',
  'landing-trace': 'Landing and trace cases',
  'close-encounter': 'Close encounters',
  'recurring-lights': 'Recurring lights',
  'object-event': 'Tracked object events',
  historical: 'Historical accounts',
};

/** "UFO and UAP cases with …" */
export const EVIDENCE_PHRASE = {
  video: 'video footage',
  film: 'motion-picture film',
  photo: 'photographs',
  radar: 'radar tracking',
  'sensor-data': 'infrared or other sensor data',
  'official-document': 'official government documents',
  'military-witness': 'military witnesses',
  'pilot-witness': 'pilot and aircrew witnesses',
  'police-witness': 'police witnesses',
  'multiple-witnesses': 'many independent witnesses',
  'physical-trace': 'physical traces',
  medical: 'documented physiological effects',
  audio: 'audio recordings or radio transcripts',
  'em-effects': 'reported electromagnetic effects',
};

/** "UFO and UAP cases: …" */
export const SHAPE_PHRASE = {
  disc: 'discs and saucers',
  cylinder: 'cylinders and cigar shapes',
  triangle: 'triangles and V shapes',
  sphere: 'spheres and orbs',
  lights: 'lights and fireballs',
  formation: 'formations and rows of lights',
};

const REGIONS = new Intl.DisplayNames(['en'], { type: 'region' });
/** The English name of a country from its ISO code, or '' when it is not one (the cases use XX for "several"). */
export function countryName(cc) {
  try {
    const name = REGIONS.of(String(cc).toUpperCase());
    return name && name !== String(cc).toUpperCase() ? name : '';
  } catch {
    return '';
  }
}

const decadeKey = (iso) => {
  const year = Number(String(iso).slice(0, 4));
  return year < 1900 ? 'before-1900' : `${Math.floor(year / 10) * 10}s`;
};

const years = (cases) => cases.map((c) => Number(c.date.slice(0, 4)));
const range = (cases) => {
  const y = years(cases);
  return Math.min(...y) === Math.max(...y) ? `${y[0]}` : `${Math.min(...y)} to ${Math.max(...y)}`;
};
const sentence = (n, what) => `${n} well-documented ${what}`;

/** How a group's cases split by status, as text ("5 unresolved, 4 explained"). */
export function statusMix(cases) {
  const counts = {};
  for (const c of cases) counts[c.status] = (counts[c.status] || 0) + 1;
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${n} ${(STATUS[k]?.label || k).toLowerCase()}`)
    .join(', ');
}

/** Every group worth a page: { kind, slug, name, h1, noun, cases }, largest first within each kind. */
export function browseGroups(cases, { min = MIN_CASES } = {}) {
  const groups = [];
  const add = (kind, slug, name, h1, noun, list) => {
    if (list.length >= min) groups.push({ kind, slug, name, h1, noun, cases: [...list].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)) });
  };
  const by = (key) => {
    const map = new Map();
    for (const c of cases) for (const k of [].concat(key(c)).filter(Boolean)) (map.get(k) || map.set(k, []).get(k)).push(c);
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length || String(a[0]).localeCompare(String(b[0])));
  };
  for (const [cc, list] of by((c) => c.cc?.toLowerCase())) {
    const name = countryName(cc);
    if (name) add('country', cc, name, `UFO and UAP cases from ${name}`, `UFO/UAP encounters from ${name}`, list);
  }
  for (const [d, list] of by((c) => decadeKey(c.date))) {
    const when = d === 'before-1900' ? 'before 1900' : `of the ${d}`;
    add('decade', d, d === 'before-1900' ? 'Before 1900' : d, `UFO and UAP cases ${when}`, `UFO/UAP encounters ${when}`, list);
  }
  for (const [s, list] of by((c) => c.status)) {
    const label = STATUS[s]?.label ? STATUS[s].label[0] + STATUS[s].label.slice(1).toLowerCase() : s;
    add('status', s, label, `${label} UFO and UAP cases`, `${label.toLowerCase()} UFO/UAP encounters (${(STATUS[s]?.long || '').replace(/\.$/, '').toLowerCase()})`, list);
  }
  for (const [k, list] of by((c) => c.category)) {
    const plural = CATEGORY_PLURAL[k] || CATEGORY[k] || k;
    add('category', k, plural, `UFO and UAP cases: ${plural.toLowerCase()}`, `UFO/UAP encounters of the kind “${(CATEGORY[k] || k).toLowerCase()}”`, list);
  }
  for (const [k, list] of by((c) => c.evidence)) {
    const phrase = EVIDENCE_PHRASE[k] || EVIDENCE[k]?.long?.toLowerCase() || k;
    add('evidence', k, phrase[0].toUpperCase() + phrase.slice(1), `UFO and UAP cases with ${phrase}`, `UFO/UAP encounters backed by ${phrase}`, list);
  }
  for (const [k, list] of by((c) => shapeClasses(c.shape))) {
    const phrase = SHAPE_PHRASE[k] || SHAPES[k]?.label?.toLowerCase() || k;
    add('shape', k, phrase[0].toUpperCase() + phrase.slice(1), `UFO and UAP cases: ${phrase}`, `UFO/UAP encounters describing ${phrase}`, list);
  }
  return groups;
}

export const KINDS = [
  { kind: 'country', title: 'By country', blurb: 'Where the case happened (the country of record).' },
  { kind: 'decade', title: 'By decade', blurb: 'When it happened.' },
  { kind: 'status', title: 'By status', blurb: 'What the evidence supports: unresolved, disputed, explained or identified.' },
  { kind: 'category', title: 'By kind of encounter', blurb: 'Military, aviation, radar-visual, close encounters and more.' },
  { kind: 'evidence', title: 'By evidence', blurb: 'Radar, video, photographs, official documents, witnesses and physical traces.' },
  { kind: 'shape', title: 'By shape', blurb: 'What the witnesses say it looked like.' },
];

export const groupPath = (g) => `browse/${g.kind}/${g.slug}/`;

/** The groups a case belongs to that have a page, for the links at the foot of its own page. */
export function groupsOf(c, groups) {
  const keys = new Set([
    `country:${c.cc?.toLowerCase()}`,
    `decade:${decadeKey(c.date)}`,
    `status:${c.status}`,
    `category:${c.category}`,
    ...(c.evidence || []).map((e) => `evidence:${e}`),
    ...shapeClasses(c.shape).map((s) => `shape:${s}`),
  ]);
  return groups.filter((g) => keys.has(`${g.kind}:${g.slug}`));
}

const caseRow = (c) => {
  const status = STATUS[c.status] || { label: String(c.status || '').toUpperCase(), color: '#00d4ff' };
  return `<li><a href="../../../case/${esc(c.id)}/">${esc(c.title)}</a> <span class="meta">${esc(caseDate(c.date))} · ${esc(c.place)}</span> <span class="status" style="color:${status.color}">${esc(status.label)}</span></li>`;
};

/** The page for one group. */
export function groupPage(g, { site, groups }) {
  const url = `${site}${groupPath(g)}`;
  const n = g.cases.length;
  const mix = statusMix(g.cases);
  const description = `${sentence(n, g.noun)}, ${range(g.cases)}: ${mix}. Each case has its sources, timeline and the official or best explanation.`;
  const siblings = groups.filter((x) => x.kind === g.kind && x.slug !== g.slug);
  const kind = KINDS.find((k) => k.kind === g.kind);
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${url}#page`,
        name: g.h1,
        description,
        url,
        isPartOf: { '@type': 'WebSite', name: "God's Eye // UAP", url: site },
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: n,
          itemListElement: g.cases.map((c, i) => ({ '@type': 'ListItem', position: i + 1, url: `${site}case/${c.id}/`, name: c.title })),
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: "God's Eye // UAP", item: site },
          { '@type': 'ListItem', position: 2, name: 'Browse', item: `${site}browse/` },
          { '@type': 'ListItem', position: 3, name: g.h1, item: url },
        ],
      },
    ],
  };
  const body = `<nav class="crumbs"><a class="brand" href="../../../">GOD'S EYE // UAP</a> › <a href="../../">Browse</a> › ${esc(kind.title.toLowerCase())}</nav>
<h1>${esc(g.h1)}</h1>
<p>${esc(description)}</p>
<a class="open" href="../../../">Open the 3D globe →</a><a class="open" href="../../../case/">All case files</a>
<h2>${n} cases</h2>
<ul>
${g.cases.map(caseRow).join('\n')}
</ul>
${siblings.length ? `<h2>${esc(kind.title)}</h2>\n<ul class="chips">\n${siblings.map((x) => `<li><a href="../${esc(x.slug)}/">${esc(x.name)} <small>${x.cases.length}</small></a></li>`).join('\n')}\n</ul>` : ''}`;
  return pageShell({ site, root: '../../../', url, title: `${g.h1} (${n}) · God's Eye // UAP`, description, ld, body });
}

/** browse/: every group, by kind. */
export function browseIndex(cases, { site, groups }) {
  const url = `${site}browse/`;
  const description = `Browse ${cases.length} well-documented UFO/UAP encounters by country, decade, status, kind of encounter, evidence and shape.`;
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: "Browse the case files · God's Eye // UAP",
    description,
    url,
    isPartOf: { '@type': 'WebSite', name: "God's Eye // UAP", url: site },
    hasPart: groups.map((g) => ({ '@type': 'CollectionPage', name: g.h1, url: `${site}${groupPath(g)}` })),
  };
  const sections = KINDS.map((k) => {
    const list = groups.filter((g) => g.kind === k.kind);
    if (!list.length) return '';
    const ordered = k.kind === 'decade' ? [...list].sort((a, b) => a.cases[0].date.localeCompare(b.cases[0].date)) : list;
    return `<h2>${esc(k.title)}</h2>\n<p class="meta">${esc(k.blurb)}</p>\n<ul class="chips">\n${ordered.map((g) => `<li><a href="${esc(g.kind)}/${esc(g.slug)}/">${esc(g.name)} <small>${g.cases.length}</small></a></li>`).join('\n')}\n</ul>`;
  }).join('\n');
  const body = `<nav class="crumbs"><a class="brand" href="../">GOD'S EYE // UAP</a> › browse</nav>
<h1>Browse the case files</h1>
<p>${esc(description)} A group needs at least ${MIN_CASES} cases to have its own page; every case is also in the <a href="../case/">full list</a>.</p>
<a class="open" href="../">Open the 3D globe →</a><a class="open" href="../open-data/">Download the data</a>
${sections}`;
  return pageShell({ site, root: '../', url, title: `Browse ${cases.length} UFO/UAP case files · God's Eye // UAP`, description, ld, body });
}
