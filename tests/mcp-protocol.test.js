import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { handle, callTool } from '../scripts/lib/mcp.mjs';

const ping = (id) => ({ jsonrpc: '2.0', id, method: 'ping' });
const reply = (r) => JSON.parse(r.content[0].text);

describe('JSON-RPC edge cases', () => {
  it('answers an empty batch, and a batch inside a batch, as invalid requests', () => {
    expect(handle([])).toEqual({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid request' } });
    const r = handle([ping(1), []]);
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ id: 1, result: {} });
    expect(r[1].error.code).toBe(-32600);
    expect(handle([{ jsonrpc: '2.0', method: 'notifications/initialized' }])).toBeNull(); // only notifications: nothing to say
  });

  it('does not answer a reply from the client (it sent no request to reply to)', () => {
    expect(handle({ jsonrpc: '2.0', id: 7, result: {} })).toBeNull();
    expect(handle({ jsonrpc: '2.0', id: 'abc', error: { code: -1, message: 'no' } })).toBeNull();
    expect(handle({ jsonrpc: '2.0', id: 7 }).error.code).toBe(-32600); // neither a request nor a reply
  });

  it('accepts only a string or a number as a request id', () => {
    expect(handle(ping('a')).id).toBe('a');
    expect(handle(ping(0)).id).toBe(0);
    for (const id of [null, {}, [], true]) expect(handle(ping(id)).error.code, JSON.stringify(id)).toBe(-32600);
  });

  it('says what is missing when a tool call has no name', () => {
    for (const params of [undefined, null, {}, { name: 5 }]) {
      const r = handle({ jsonrpc: '2.0', id: 1, method: 'tools/call', params });
      expect(r.error.code).toBe(-32602);
      expect(r.error.message).toMatch(/name/);
    }
  });
});

describe('tool arguments', () => {
  it('names an argument it does not know instead of quietly ignoring it', () => {
    const r = callTool('search_cases', { keyword: 'radar' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/Unknown argument "keyword".*query/);
    expect(callTool('describe_dataset', { x: 1 }).content[0].text).toMatch(/takes: no arguments/);
    expect(callTool('search_cases', { constructor: 1 }).isError).toBe(true);
  });

  it('asks for an object, and for the declared types', () => {
    expect(callTool('search_cases', 'radar').content[0].text).toBe('arguments must be an object');
    expect(callTool('search_cases', ['radar']).isError).toBe(true);
    expect(callTool('search_cases', { query: 5 }).content[0].text).toBe('query must be a string');
    expect(callTool('search_cases', { query: { toString: 1 } }).isError).toBe(true); // used to escape as an internal error
    expect(callTool('search_cases', { limit: 'many' }).content[0].text).toBe('limit must be a whole number');
    expect(callTool('search_cases', { from_year: 1950.5 }).isError).toBe(true);
    expect(callTool('cases_near', { lat: true, lon: 1 }).content[0].text).toBe('lat must be a number');
    expect(callTool('cases_near', { lat: [40], lon: [-100] }).isError).toBe(true);
    // "false" is not false: it used to switch every track point on.
    expect(callTool('get_case', { id: 'nimitz-tic-tac-2004', include_tracks: 'false' }).content[0].text).toBe('include_tracks must be true or false');
  });

  it('still reads numbers sent as text, and an unused filter sent empty or null', () => {
    expect(reply(callTool('cases_near', { lat: '33.39', lon: '-104.52', radius_km: '400', limit: '2' })).shown).toBe(2);
    expect(reply(callTool('on_this_day', { month: '11', day: '14' })).total).toBeGreaterThan(0);
    const all = reply(callTool('search_cases', {})).total;
    expect(reply(callTool('search_cases', { status: '', category: null, evidence: '', from_year: '', country: '', shape: '' })).total).toBe(all);
    expect(callTool('search_cases', { status: 'weird' }).isError).toBe(true);
  });
});

describe('the server process under load', () => {
  it('delivers every answer when the client closes its input at once and reads slowly', async () => {
    const asked = 60; // 5 kB each: far more than the pipe holds
    const child = spawn(process.execPath, ['scripts/mcp-server.mjs'], { stdio: ['pipe', 'pipe', 'inherit'] });
    let out = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      out += chunk;
      child.stdout.pause();
      setTimeout(() => child.stdout.resume(), 40);
    });
    const ended = new Promise((resolve) => child.stdout.on('end', resolve));
    const requests = Array.from({ length: asked }, (_, id) => JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: 'get_case', arguments: { id: 'nimitz-tic-tac-2004', include_tracks: true } } }));
    child.stdin.end(`${requests.join('\n')}\n`);
    await ended;
    const lines = out.split('\n').filter(Boolean);
    expect(lines.map((l) => JSON.parse(l).id)).toEqual(Array.from({ length: asked }, (_, i) => i));
  }, 30_000);
});
