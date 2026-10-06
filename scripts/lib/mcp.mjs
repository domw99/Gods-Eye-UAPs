/**
 * The case files as a Model Context Protocol server's tools: search the cases,
 * read one, find the ones near a place, and see what happened on a date. Pure
 * functions over the curated cases, so they are testable; scripts/mcp-server.mjs
 * puts them on stdin and stdout. No network, no dependencies.
 */
import { CASES } from '../../src/data/cases/index.js';
import { STATUS, CATEGORY, EVIDENCE, shapeClasses } from '../../src/data/taxonomy.js';
import { RELEASE, SITE_URL, REPO_URL } from '../../src/config.js';
import { haversineKm } from '../../src/util/geo.js';
import { caseRecord } from './open-data.mjs';

export const PROTOCOLS = ['2025-06-18', '2025-03-26', '2024-11-05'];

export const INSTRUCTIONS = `Documented UFO/UAP encounters, each with its sources and the official or best explanation. A case's "status" (unresolved, disputed, explained, identified) says what its cited evidence supports, not what anyone believes: when you answer from a case, give its status and explanation and link its page. Flight paths are reconstructions and say what they are based on. The data is MIT-licensed; the sources and media it links to keep their own terms (${REPO_URL}/blob/HEAD/DATA_SOURCES.md).`;

const site = process.env.SITE_URL || SITE_URL;
const brief = (c, extra = {}) => ({
  id: c.id,
  title: c.title,
  date: c.date.slice(0, 10),
  place: c.place,
  country: c.country ?? null,
  status: c.status,
  category: c.category,
  evidence: c.evidence ?? [],
  summary: c.summary.length > 280 ? `${c.summary.slice(0, 277).replace(/\s+\S*$/, '')}…` : c.summary,
  page: `${site}case/${c.id}/`,
  ...extra,
});

const lower = (s) => String(s ?? '').toLowerCase();
const haystack = (c) => lower([c.title, c.place, c.country, c.summary, c.explanation, c.shape, c.witnesses, c.category, ...(c.evidence || [])].join(' '));
const num = (v) => (v === undefined || v === null || v === '' ? null : Number(v));
const clampLimit = (v, def = 10) => Math.max(1, Math.min(50, Number.isFinite(Number(v)) && v != null ? Math.floor(Number(v)) : def));

class ArgError extends Error {}

function oneOf(name, value, allowed) {
  if (value == null || value === '') return null; // an unused filter, as clients often send it
  const v = lower(value);
  if (!allowed.includes(v)) throw new ArgError(`${name} must be one of: ${allowed.join(', ')}`);
  return v;
}

export function searchCases(args = {}, cases = CASES) {
  const status = oneOf('status', args.status, Object.keys(STATUS));
  const category = oneOf('category', args.category, Object.keys(CATEGORY));
  const evidence = oneOf('evidence', args.evidence, Object.keys(EVIDENCE));
  const country = args.country ? lower(args.country) : null;
  const from = num(args.from_year);
  const to = num(args.to_year);
  if ((from != null && !Number.isFinite(from)) || (to != null && !Number.isFinite(to))) throw new ArgError('from_year and to_year must be numbers');
  const terms = lower(args.query).split(/\s+/).filter(Boolean);
  const shape = args.shape ? lower(args.shape) : null;
  const found = cases.filter((c) => {
    const year = Number(c.date.slice(0, 4));
    if (status && c.status !== status) return false;
    if (category && c.category !== category) return false;
    if (evidence && !(c.evidence || []).includes(evidence)) return false;
    if (country && (country.length === 2 ? lower(c.cc) !== country : !lower(c.country).includes(country))) return false; // a code, or part of the name ("France / Germany")
    if (from != null && year < from) return false;
    if (to != null && year > to) return false;
    if (shape && !shapeClasses(c.shape).includes(shape) && !lower(c.shape).includes(shape)) return false;
    if (terms.length) {
      const h = haystack(c);
      return terms.every((t) => h.includes(t));
    }
    return true;
  });
  found.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const limit = clampLimit(args.limit);
  return { total: found.length, shown: Math.min(limit, found.length), cases: found.slice(0, limit).map((c) => brief(c)) };
}

export function getCase(args = {}, cases = CASES) {
  const id = String(args.id ?? '').trim();
  if (!id) throw new ArgError('id is required (see search_cases)');
  const c = cases.find((x) => x.id === id);
  if (!c) {
    const close = cases.filter((x) => x.id.includes(id) || lower(x.title).includes(lower(id))).slice(0, 5).map((x) => x.id);
    throw new ArgError(`No case with id "${id}".${close.length ? ` Did you mean: ${close.join(', ')}?` : ''}`);
  }
  const record = caseRecord(c, { site });
  if (!args.include_tracks) record.tracks = record.tracks.map((tr) => ({ id: tr.id, label: tr.label, kind: tr.kind, basis: tr.basis, points: tr.points.length }));
  return record;
}

export function casesNear(args = {}, cases = CASES) {
  const lat = num(args.lat);
  const lon = num(args.lon);
  if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) throw new ArgError('lat (-90 to 90) and lon (-180 to 180) are required');
  const radius = num(args.radius_km) ?? 250;
  if (!Number.isFinite(radius) || radius <= 0) throw new ArgError('radius_km must be a positive number');
  const found = cases
    .filter((c) => c.lat != null && c.precision !== 'region')
    .map((c) => ({ c, km: haversineKm(lat, lon, c.lat, c.lon) }))
    .filter(({ km }) => km <= radius)
    .sort((a, b) => a.km - b.km);
  const limit = clampLimit(args.limit);
  return { total: found.length, shown: Math.min(limit, found.length), cases: found.slice(0, limit).map(({ c, km }) => brief(c, { distance_km: Math.round(km * 10) / 10 })) };
}

export function onThisDayTool(args = {}, cases = CASES, today = new Date()) {
  const month = num(args.month) ?? today.getMonth() + 1;
  const day = num(args.day) ?? today.getDate();
  if (!Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > 31) throw new ArgError('month (1-12) and day (1-31) must be whole numbers');
  const key = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const found = cases.filter((c) => c.date.slice(5, 10) === key).sort((a, b) => a.date.localeCompare(b.date));
  return { month, day, total: found.length, cases: found.map((c) => brief(c)) };
}

export function describeDataset(cases = CASES) {
  const count = (key) => {
    const out = {};
    for (const c of cases) for (const k of [].concat(key(c)).filter(Boolean)) out[k] = (out[k] || 0) + 1;
    return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1]));
  };
  const years = cases.map((c) => Number(c.date.slice(0, 4)));
  return {
    name: "God's Eye // UAP case files",
    version: RELEASE,
    cases: cases.length,
    years: [Math.min(...years), Math.max(...years)],
    statuses: Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [k, v.long])),
    status_counts: count((c) => c.status),
    categories: CATEGORY,
    category_counts: count((c) => c.category),
    evidence_counts: count((c) => c.evidence),
    country_counts: count((c) => c.country),
    with_flight_paths: cases.filter((c) => c.tracks?.length).length,
    links: { site, open_data: `${site}open-data/`, llms: `${site}llms.txt`, repository: REPO_URL },
    license: 'MIT for the case files; the sources and media they link to keep their own terms.',
  };
}

const READ_ONLY = { readOnlyHint: true, idempotentHint: true, openWorldHint: false };

export const TOOLS = [
  {
    name: 'search_cases',
    title: 'Search the case files',
    description: 'Find documented UFO/UAP cases by words and filters. All words must match (title, place, summary, explanation, shape, witnesses). Returns brief records, oldest first; use get_case for the full file.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Words to find, e.g. "radar Navy" or "Rendlesham".' },
        status: { type: 'string', enum: Object.keys(STATUS), description: 'What the evidence supports.' },
        category: { type: 'string', enum: Object.keys(CATEGORY) },
        evidence: { type: 'string', enum: Object.keys(EVIDENCE), description: 'A kind of evidence the case has.' },
        shape: { type: 'string', description: 'disc, cylinder, triangle, sphere, lights or formation.' },
        country: { type: 'string', description: 'Country name or ISO code, e.g. "France" or "FR".' },
        from_year: { type: 'integer' },
        to_year: { type: 'integer' },
        limit: { type: 'integer', minimum: 1, maximum: 50, description: 'Default 10.' },
      },
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    run: searchCases,
  },
  {
    name: 'get_case',
    title: 'Read one case file',
    description: 'The full file for a case: date, place and coordinates, status and explanation, evidence, summary, timeline, flight-path tracks (counted; set include_tracks for every point) and sources.',
    inputSchema: { type: 'object', properties: { id: { type: 'string', description: 'A case id from search_cases, e.g. "nimitz-tic-tac-2004".' }, include_tracks: { type: 'boolean' } }, required: ['id'], additionalProperties: false },
    annotations: READ_ONLY,
    run: getCase,
  },
  {
    name: 'cases_near',
    title: 'Cases near a place',
    description: 'The cases within a distance of a latitude and longitude, nearest first. Cases whose position is only a region are left out.',
    inputSchema: { type: 'object', properties: { lat: { type: 'number' }, lon: { type: 'number' }, radius_km: { type: 'number', description: 'Default 250.' }, limit: { type: 'integer', minimum: 1, maximum: 50 } }, required: ['lat', 'lon'], additionalProperties: false },
    annotations: READ_ONLY,
    run: casesNear,
  },
  {
    name: 'on_this_day',
    title: 'Cases on a date',
    description: 'The cases that happened on a day of the year, in any year (default: today).',
    inputSchema: { type: 'object', properties: { month: { type: 'integer', minimum: 1, maximum: 12 }, day: { type: 'integer', minimum: 1, maximum: 31 } }, additionalProperties: false },
    annotations: { ...READ_ONLY, idempotentHint: false },
    run: (args) => onThisDayTool(args),
  },
  {
    name: 'describe_dataset',
    title: 'About the case files',
    description: 'How many cases there are, the years they cover, the allowed values for the filters with counts, and where the open data lives.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: READ_ONLY,
    run: () => describeDataset(),
  },
];

/** The tools as a client lists them (without the functions). */
export const toolList = () => TOOLS.map(({ run, ...tool }) => tool);

// What each declared type accepts. Numbers sent as text ("50") are read as numbers, as the tools always did.
const number = (v) => (typeof v === 'number' && Number.isFinite(v)) || (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)));
const TYPES = {
  string: [(v) => typeof v === 'string', 'a string'],
  number: [number, 'a number'],
  integer: [(v) => number(v) && Number.isInteger(Number(v)), 'a whole number'],
  boolean: [(v) => typeof v === 'boolean', 'true or false'],
};

/** Hold the arguments to the tool's schema, so a misspelt name or a wrong type is told to the model instead of quietly ignored (a typo would otherwise return every case). */
function checkArguments(schema, args) {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) throw new ArgError('arguments must be an object');
  const props = schema.properties || {};
  const known = Object.keys(props);
  for (const key of Object.keys(args))
    if (!Object.hasOwn(props, key)) throw new ArgError(`Unknown argument "${key}". This tool takes: ${known.length ? known.join(', ') : 'no arguments'}`);
  for (const key of known) {
    const v = args[key];
    const [fits, label] = TYPES[props[key].type] || [() => true, ''];
    if (v != null && !(v === '' && props[key].type !== 'string') && !fits(v)) throw new ArgError(`${key} must be ${label}`);
  }
}

/** Run a tool; a bad argument is a result the model can read and correct, not a protocol error. */
export function callTool(name, args) {
  const tool = TOOLS.find((t) => t.name === name);
  if (!tool) return null;
  try {
    checkArguments(tool.inputSchema, args ?? {});
    return { content: [{ type: 'text', text: JSON.stringify(tool.run(args ?? {}), null, 1) }] };
  } catch (error) {
    if (!(error instanceof ArgError)) throw error;
    return { content: [{ type: 'text', text: error.message }], isError: true };
  }
}

const error = (id, code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

/** One JSON-RPC message in, the response out (null for a notification). */
export function handle(message) {
  if (Array.isArray(message)) {
    // An empty batch, and a batch inside a batch, are invalid requests that still get an answer.
    if (!message.length) return error(null, -32600, 'Invalid request');
    const out = message.map((m) => (Array.isArray(m) ? error(null, -32600, 'Invalid request') : handle(m))).filter(Boolean);
    return out.length ? out : null;
  }
  // A reply to a request of ours (this server sends none) is not a request: say nothing.
  if (message?.jsonrpc === '2.0' && message.method === undefined && message.id !== undefined && ('result' in message || 'error' in message)) return null;
  if (!message || message.jsonrpc !== '2.0' || typeof message.method !== 'string') return error(message?.id ?? null, -32600, 'Invalid request');
  const { id, method, params } = message;
  if (id === undefined) return null; // a notification (notifications/initialized, notifications/cancelled …)
  if (typeof id !== 'string' && typeof id !== 'number') return error(null, -32600, 'Invalid request: id must be a string or a number');
  switch (method) {
    case 'initialize': {
      const wanted = params?.protocolVersion;
      return { jsonrpc: '2.0', id, result: { protocolVersion: PROTOCOLS.includes(wanted) ? wanted : PROTOCOLS[0], capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'gods-eye-uap', title: "God's Eye // UAP", version: RELEASE }, instructions: INSTRUCTIONS } };
    }
    case 'ping':
      return { jsonrpc: '2.0', id, result: {} };
    case 'tools/list':
      return { jsonrpc: '2.0', id, result: { tools: toolList() } };
    case 'tools/call': {
      if (typeof params?.name !== 'string') return error(id, -32602, 'Invalid params: name (the tool to call) is required');
      let result;
      try {
        result = callTool(params?.name, params?.arguments);
      } catch (e) {
        return error(id, -32603, `The tool failed: ${e.message}`);
      }
      return result ? { jsonrpc: '2.0', id, result } : error(id, -32602, `Unknown tool: ${params?.name}`);
    }
    case 'resources/list':
      return { jsonrpc: '2.0', id, result: { resources: [] } };
    case 'prompts/list':
      return { jsonrpc: '2.0', id, result: { prompts: [] } };
    default:
      return error(id, -32601, `Method not found: ${method}`);
  }
}
