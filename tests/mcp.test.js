import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { handle, callTool, toolList, searchCases, getCase, casesNear, onThisDayTool, describeDataset, PROTOCOLS } from '../scripts/lib/mcp.mjs';
import { CASES } from '../src/data/cases/index.js';
import { STATUS } from '../src/data/taxonomy.js';
import { RELEASE } from '../src/config.js';

const ask = (method, params, id = 1) => handle({ jsonrpc: '2.0', id, method, params });
const text = (result) => JSON.parse(result.content[0].text);

describe('the MCP protocol', () => {
  it('starts with initialize: the version the client asked for when it is one we know, else the newest', () => {
    const r = ask('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'x', version: '1' } });
    expect(r.result.protocolVersion).toBe('2024-11-05');
    expect(r.result.serverInfo).toMatchObject({ name: 'gods-eye-uap', version: RELEASE });
    expect(r.result.capabilities).toHaveProperty('tools');
    expect(r.result.instructions).toMatch(/status/);
    expect(ask('initialize', { protocolVersion: '1999-01-01' }).result.protocolVersion).toBe(PROTOCOLS[0]);
  });

  it('answers ping and the lists, and says nothing to a notification', () => {
    expect(ask('ping').result).toEqual({});
    expect(ask('resources/list').result).toEqual({ resources: [] });
    expect(handle({ jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull();
  });

  it('refuses what it does not understand with the standard codes', () => {
    expect(ask('nope').error.code).toBe(-32601);
    expect(ask('tools/call', { name: 'nope' }).error.code).toBe(-32602);
    expect(handle({ id: 5 }).error.code).toBe(-32600);
    expect(handle(null).error.code).toBe(-32600);
  });

  it('answers a batch', () => {
    const r = handle([{ jsonrpc: '2.0', id: 1, method: 'ping' }, { jsonrpc: '2.0', method: 'notifications/initialized' }, { jsonrpc: '2.0', id: 2, method: 'ping' }]);
    expect(r.map((x) => x.id)).toEqual([1, 2]);
  });

  it('lists tools that each have a name, a description and an object schema, and no function', () => {
    const tools = ask('tools/list').result.tools;
    expect(tools.map((t) => t.name)).toEqual(['search_cases', 'get_case', 'cases_near', 'on_this_day', 'describe_dataset']);
    for (const t of tools) {
      expect(t.description.length, t.name).toBeGreaterThan(30);
      expect(t.inputSchema.type, t.name).toBe('object');
      expect(t.run).toBeUndefined();
      expect(t.annotations.readOnlyHint).toBe(true);
    }
    expect(toolList()).toHaveLength(5);
  });
});

describe('searching', () => {
  it('finds cases by words (all of them), oldest first, with a total and a limit', () => {
    const r = searchCases({ query: 'radar navy', limit: 3 });
    expect(r.total).toBeGreaterThan(1);
    expect(r.cases.length).toBeLessThanOrEqual(3);
    const dates = r.cases.map((c) => c.date);
    expect(dates).toEqual([...dates].sort());
    expect(r.cases[0]).toMatchObject({ id: expect.any(String), page: expect.stringMatching(/\/case\/.+\/$/), status: expect.any(String) });
    expect(searchCases({ query: 'zzzqqq' }).total).toBe(0);
  });

  it('filters by status, country (name or code), years and evidence, and combines them', () => {
    const unresolved = searchCases({ status: 'unresolved', limit: 50 });
    expect(unresolved.cases.every((c) => c.status === 'unresolved')).toBe(true);
    expect(unresolved.total).toBe(CASES.filter((c) => c.status === 'unresolved').length);
    expect(searchCases({ country: 'FR' }).total).toBe(searchCases({ country: 'france' }).total);
    expect(searchCases({ country: 'FR' }).total).toBeGreaterThan(1);
    const decade = searchCases({ from_year: 1950, to_year: 1959, limit: 50 });
    expect(decade.cases.every((c) => c.date >= '1950' && c.date < '1960')).toBe(true);
    const both = searchCases({ status: 'unresolved', evidence: 'radar', from_year: 1970, limit: 50 });
    expect(both.cases.every((c) => c.status === 'unresolved' && c.evidence.includes('radar') && c.date >= '1970')).toBe(true);
  });

  it('caps the limit and keeps summaries short', () => {
    expect(searchCases({ limit: 500 }).cases.length).toBeLessThanOrEqual(50);
    expect(searchCases({ limit: 0 }).cases.length).toBe(1);
    expect(searchCases({ limit: 50 }).cases.every((c) => c.summary.length <= 281)).toBe(true);
  });

  it('turns a wrong value into a message the caller can act on, not a crash', () => {
    const r = callTool('search_cases', { status: 'weird' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/status must be one of: .*unresolved/);
    expect(callTool('search_cases', { from_year: 'abc' }).isError).toBe(true);
  });
});

describe('reading a case', () => {
  it('returns the full record with its sources and a count of track points', () => {
    const c = getCase({ id: 'nimitz-tic-tac-2004' });
    expect(c.title).toMatch(/Nimitz/);
    expect(c.status).toBe('unresolved');
    expect(c.sources.length).toBeGreaterThan(0);
    expect(c.tracks[0].points).toEqual(expect.any(Number));
    expect(c.page).toMatch(/case\/nimitz-tic-tac-2004\/$/);
    expect(getCase({ id: 'nimitz-tic-tac-2004', include_tracks: true }).tracks[0].points[0]).toHaveProperty('latitude');
  });

  it('suggests ids for a near miss and says when there is no id', () => {
    const r = callTool('get_case', { id: 'nimitz' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/Did you mean: .*nimitz-tic-tac-2004/);
    expect(callTool('get_case', {}).isError).toBe(true);
  });
});

describe('near a place and on a date', () => {
  it('lists the cases near a point, nearest first, with the distance', () => {
    const r = casesNear({ lat: 33.3943, lon: -104.523, radius_km: 400 });
    expect(r.total).toBeGreaterThan(0);
    const km = r.cases.map((c) => c.distance_km);
    expect(km).toEqual([...km].sort((a, b) => a - b));
    expect(km.at(-1)).toBeLessThanOrEqual(400);
    expect(callTool('cases_near', { lat: 95, lon: 0 }).isError).toBe(true);
    expect(callTool('cases_near', { lat: 1 }).isError).toBe(true);
    expect(callTool('cases_near', { lat: 1, lon: 1, radius_km: -5 }).isError).toBe(true);
  });

  it('finds the cases of a day of the year, in any year', () => {
    const r = onThisDayTool({ month: 11, day: 14 });
    expect(r.cases.map((c) => c.id)).toContain('nimitz-tic-tac-2004');
    expect(r.cases.every((c) => c.date.slice(5) === '11-14')).toBe(true);
    expect(onThisDayTool({}, CASES, new Date(2026, 10, 14)).total).toBe(r.total);
    expect(callTool('on_this_day', { month: 13, day: 1 }).isError).toBe(true);
  });

  it('describes the dataset, with the values the filters accept', () => {
    const d = describeDataset();
    expect(d.cases).toBe(CASES.length);
    expect(Object.keys(d.statuses)).toEqual(Object.keys(STATUS));
    expect(d.version).toBe(RELEASE);
    expect(d.links.open_data).toMatch(/open-data\/$/);
    expect(Object.values(d.status_counts).reduce((a, b) => a + b, 0)).toBe(CASES.length);
  });
});

describe('the server process', () => {
  it('talks over stdio, one JSON message per line, and exits when its input closes', async () => {
    const child = spawn(process.execPath, ['scripts/mcp-server.mjs'], { stdio: ['pipe', 'pipe', 'inherit'] });
    const lines = [];
    let buffer = '';
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      const parts = buffer.split('\n');
      buffer = parts.pop();
      lines.push(...parts.filter(Boolean).map((l) => JSON.parse(l)));
    });
    const closed = new Promise((resolve) => child.on('close', resolve));
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } })}\n`);
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
    child.stdin.write('this is not json\n');
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'describe_dataset', arguments: {} } })}\n`);
    child.stdin.end();
    expect(await closed).toBe(0);
    expect(lines.map((l) => l.id)).toEqual([1, null, 2]);
    expect(lines[1].error.code).toBe(-32700);
    expect(text(lines[2].result).cases).toBe(CASES.length);
  }, 20_000);
});
