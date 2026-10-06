#!/usr/bin/env node
/**
 * A Model Context Protocol server for the case files, over stdio (one JSON
 * message per line). No dependencies and no network: it reads the cases in
 * this repository.
 *
 *   node scripts/mcp-server.mjs
 *
 * Add it to an MCP client, for example Claude Code:
 *   claude mcp add gods-eye-uap -- node /path/to/Gods-Eye-UAPs/scripts/mcp-server.mjs
 * or a client's JSON config (see docs/MCP.md).
 */
import { createInterface } from 'node:readline';
import { handle } from './lib/mcp.mjs';

const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);

const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
rl.on('line', (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
  }
  let response;
  try {
    response = handle(message);
  } catch (e) {
    response = { jsonrpc: '2.0', id: message?.id ?? null, error: { code: -32603, message: `Internal error: ${e.message}` } };
  }
  if (response) send(response);
});
// Input ended: exit once every answer has been written. A pipe holds about 64 kB, so a client that sends its
// requests and closes stdin would otherwise lose whatever the reader had not yet taken when we exited.
rl.on('close', () => process.stdout.write('', () => process.exit(0)));
