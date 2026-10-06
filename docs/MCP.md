# Use the case files from an AI assistant (MCP)

`scripts/mcp-server.mjs` is a [Model Context Protocol](https://modelcontextprotocol.io/) server for the case files. It lets an assistant such as Claude search the cases, read a case's file, find the cases near a place and see what happened on a date, with each case's status, explanation and sources. It runs on your machine, reads the cases in this repository, needs **no network, no API key and no dependencies** (Node 18 or later), and talks over stdin and stdout.

## Add it

Clone the repository (`npm ci` is not needed for the server itself), then point your client at the script.

**Claude Code**

```sh
claude mcp add gods-eye-uap -- node /path/to/Gods-Eye-UAPs/scripts/mcp-server.mjs
```

**Claude Desktop, Cursor and other clients with a JSON config**

```json
{
  "mcpServers": {
    "gods-eye-uap": {
      "command": "node",
      "args": ["/path/to/Gods-Eye-UAPs/scripts/mcp-server.mjs"]
    }
  }
}
```

To try it by hand, run `npm run mcp` and type one JSON message per line, for example:

```json
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}
{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"search_cases","arguments":{"query":"radar navy","status":"unresolved"}}}
```

## Tools

| Tool | What it does |
|---|---|
| `search_cases` | Find cases by words (all must match) and filters: `status`, `category`, `evidence`, `shape`, `country` (name or ISO code), `from_year`, `to_year`, `limit` (default 10, at most 50). Brief records, oldest first, with a total. |
| `get_case` | The full file for one `id`: date, place and coordinates, status and explanation, evidence, summary, timeline, flight-path tracks (counted; `include_tracks` for every point) and sources. |
| `cases_near` | Cases within `radius_km` (default 250) of `lat`, `lon`, nearest first. Cases whose position is only a region are left out. |
| `on_this_day` | Cases that happened on a day of the year, in any year (default: today). |
| `describe_dataset` | How many cases, the years, the allowed filter values with counts, and where the open data is. |

A wrong argument comes back as a message the assistant can read and correct ("status must be one of: unresolved, disputed, …", "Unknown argument "keyword"", "limit must be a whole number"), not as a failure. An argument a tool does not take is an error too, so a misspelt filter never quietly returns every case.

## Reading it honestly

The server's instructions tell the assistant what the data means, and it is worth repeating here. A case's **status** (*unresolved*, *disputed*, *explained*, *identified*) is what its cited evidence supports, not what anyone believes. *Unresolved* means no accepted explanation, not that the cause is unusual. Flight paths are reconstructions and each says what it is based on. When an answer draws on a case, it should give the status and the explanation and link the case's page.

## The same data without the server

- [`open-data/`](https://domw99.github.io/Gods-Eye-UAPs/open-data/): `cases.json`, `cases.csv` and `cases.geojson`.
- [`llms.txt`](https://domw99.github.io/Gods-Eye-UAPs/llms.txt) and [`llms-full.txt`](https://domw99.github.io/Gods-Eye-UAPs/llms-full.txt): the site and every case as plain text for an assistant to read.

The case files are MIT-licensed; the sources and media they link to keep their own terms ([DATA_SOURCES.md](../DATA_SOURCES.md)).
