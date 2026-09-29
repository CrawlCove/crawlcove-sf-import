# crawlcove-sf-import

Convert a Screaming Frog SEO Spider crawl export into the [Crawl Cove crawl export format](https://github.com/CrawlCove/crawlcove-export-spec), from the command line, with a report of exactly which columns carried over and which did not. The output validates against `crawlcove-export-spec` 1.0.0, so a Frog crawl can be loaded into [crawlcove-mcp](https://github.com/CrawlCove/crawlcove-mcp)'s `load_export` for an AI assistant to query, diffed against a Crawl Cove crawl of the same site, or fed to anything else built on the spec.

Moving from Screaming Frog? [crawlcove.com/screaming-frog-alternative](https://crawlcove.com/screaming-frog-alternative?utm_source=github&utm_medium=crawlcove-sf-import) compares the two.

## Install

```sh
# one-off, nothing installed (Node 18+):
npx github:CrawlCove/crawlcove-sf-import internal_all.csv -o crawl.json

# global command, from the release tarball:
npm install -g https://github.com/CrawlCove/crawlcove-sf-import/archive/refs/tags/v1.0.0.tar.gz
sf-import --version
```

(The tarball form is deliberate: a global `github:` install on npm 10 leaves a dangling symlink. The npm package is coming.)

## Usage

In Screaming Frog: crawl the site, then **File → Export → Internal → All** (or the Export button on the Internal tab with the *All* filter). That writes `internal_all.csv`. Then:

```sh
sf-import <file> [options]

  -o, --out <path>     write the JSON export here (default: stdout)
  --run-id <n>         auditRunId to stamp on the export (default 1)
  --mapping            print only the mapping report (JSON), no export
  --quiet              no mapping summary on stderr
```

The mapping summary goes to stderr so the JSON on stdout stays clean:

```
$ sf-import internal_all.csv -o crawl.json
1,204 row(s) read, 1,198 page(s) written, 6 skipped → crawl.json
mapped: url←Address, finalUrl←Redirect URL, statusCode←Status Code, contentType←Content Type, depth←Crawl Depth, indexable←Indexability, title←Title 1, ... h1Count←H1-1 + H1-2
not in this export: imageCount, imagesMissingAlt, rendered, schemaBlocks, hreflangCount, contentFingerprint, findingsCount
note: Hash ignored: Screaming Frog hashes the whole response (MD5); Crawl Cove fingerprints visible content (64-bit). Not comparable, left empty.
skipped line 40: non-http address "mailto:hello@example.com"
```

Exit codes: `0` converted, `2` the file could not be read as an Internal export (no Address column, or it is a `.seospiderconfig`).

Column names are matched after normalising, so the export from any recent Frog version works: `Content` or `Content Type`, `H1-1` or `h1 – 1`, `Size` or `Size (bytes)`, `Redirect URI` or `Redirect URL`. If the Frog was run with a column disabled, the field is left null and listed under "not in this export".

## What carries over

| Crawl Cove field | Screaming Frog column | Notes |
|---|---|---|
| `url` | Address | Rows whose address is not http(s) (mailto:, tel:) are skipped and listed. |
| `finalUrl` | Redirect URL / URI | Only on 3xx rows; otherwise the address itself. |
| `statusCode` | Status Code | A Frog `0` (no response) becomes null. |
| `fetchError` | Status | Set when the Frog reports Connection Timeout, Connection Refused, DNS lookup failed, No Response or Blocked by robots.txt. |
| `contentType` | Content Type / Content | |
| `depth` | Crawl Depth | |
| `indexable` | Indexability | `Indexable` → true. If the column is missing, derived from status 200 + no `noindex` in Meta Robots / X-Robots-Tag, the same rule Crawl Cove uses. |
| `title`, `titleLength` | Title 1, Title 1 Length | Length falls back to the string's own length. |
| `metaDescription`, `metaLength` | Meta Description 1, Meta Description 1 Length | |
| `canonical` | Canonical Link Element 1 | |
| `htmlLang` | Language | Enable *Config → Spider → Extraction → Language* in the Frog or this is null. |
| `robotsMeta`, `xRobotsTag` | Meta Robots 1, X-Robots-Tag 1 | Raw values. |
| `h1Count` | H1-1, H1-2 | The Frog exports at most two, so this is capped at 2. |
| `wordCount` | Word Count | |
| `linksInternal` | Unique Outlinks | The Frog's Outlinks columns count internal links only. |
| `linksExternal` | Unique External Outlinks | |
| `responseTimeMs` | Response Time | Seconds → milliseconds. |
| `byteSize` | Size (bytes) | |
| `redirectHops` | Redirect URL | 1 when set, else 0. The Internal export records one hop; use the Frog's *Redirect Chains* report for full chains. |

## What does not carry over, and why

| Crawl Cove field | Why | Where the Frog keeps it |
|---|---|---|
| `imageCount`, `imagesMissingAlt` | Not in the Internal tab. | Images tab / Bulk Export → Images. |
| `schemaBlocks` | Not in the Internal tab. | Structured Data tab (needs JSON-LD extraction enabled). |
| `hreflangCount` | Not in the Internal tab. | Hreflang tab. |
| `contentFingerprint` | The Frog's Hash is an MD5 of the whole response; Crawl Cove's is a 64-bit fingerprint of visible content. Never comparable, so it is left empty rather than misleading. | Hash column (used by the Frog's own duplicate detection). |
| `rendered` | Whether JavaScript rendering was on is a crawl setting, not a column. Always false here. | Config → Spider → Rendering. |
| `findingsCount` | Crawl Cove's checks have not run on this data. Always 0. | Load the export into Crawl Cove or crawlcove-mcp to get findings. |

## Configuration files (`.seospiderconfig`)

A Frog configuration file is Java serialisation, not a text format, and this tool will not convert it (it recognises one and exits 2). The settings that matter map to Crawl Cove like this; re-create them by hand:

| Screaming Frog setting | Crawl Cove |
|---|---|
| Config → Spider → Limits → Limit Crawl Total | Settings → Crawl Defaults → Max pages |
| Config → Spider → Limits → Limit Crawl Depth | Settings → Crawl Defaults → Max depth |
| Config → Include / Exclude (regex) | New Crawl → Include / Exclude patterns |
| Config → User-Agent | Settings → Crawl Defaults → User-agent (default `CrawlCove-Crawler`) |
| Config → Speed (threads, URLs/s) | Settings → Crawl Defaults → Concurrency / delay |
| Config → Spider → Rendering → JavaScript | New Crawl → Render sample % |
| Config → Robots.txt → Ignore | Not configurable: Crawl Cove always honours robots.txt |
| Config → Authentication (basic / form) | New Crawl → Staging login (basic auth or form login) |

## Works with CrawlCove

This converts a Frog export. [Crawl Cove](https://crawlcove.com/?utm_source=github&utm_medium=crawlcove-sf-import), the desktop SEO crawler for Windows and Mac, produces this format natively, runs its checks on every page, ranks fixes by impact, and keeps history over time.

This repo has its own page on crawlcove.com: [Crawl Cove Screaming Frog importer](https://crawlcove.com/open-source/crawlcove-sf-import?utm_source=github&utm_medium=crawlcove-sf-import).

## Related tools

- [crawlcove-js](https://github.com/CrawlCove/crawlcove-js) — `crawlcove-export`, a typed JavaScript/TypeScript library to load, query and convert Crawl Cove exports.
- [crawlcove-sheets](https://github.com/CrawlCove/crawlcove-sheets) — Google Sheets add-on that turns a Crawl Cove export into an audit workbook (issues by type, pages by status, title/meta flags).
- [crawlcove-export-spec](https://github.com/CrawlCove/crawlcove-export-spec) — the JSON Schema this tool's output validates against.
- [crawlcove-mcp](https://github.com/CrawlCove/crawlcove-mcp) — load the converted export into Claude, Cursor and other AI assistants.
- [crawlcove-cli](https://github.com/CrawlCove/crawlcove-cli) — headless whole-site crawl with redirect-chain, broken-link, title and noindex checks.
- [crawlcove-action](https://github.com/CrawlCove/crawlcove-action) — the same checks as a GitHub Action on every PR.
- [crawlcove-schema-validator](https://github.com/CrawlCove/crawlcove-schema-validator) — validate a page's JSON-LD against Google's required and recommended rich-result properties.
- [crawlcove-hreflang-checker](https://github.com/CrawlCove/crawlcove-hreflang-checker) — check a page's or a sitemap's hreflang tags: codes, self-reference, x-default and return tags.
- [crawlcove-sitemap-validator](https://github.com/CrawlCove/crawlcove-sitemap-validator) — validate an XML sitemap or sitemap index against the protocol and search-engine limits.
- [crawlcove-robots-txt-tester](https://github.com/CrawlCove/crawlcove-robots-txt-tester) — lint a robots.txt and test which URLs each crawler may fetch.
- [crawlcove-redirect-chain-checker](https://github.com/CrawlCove/crawlcove-redirect-chain-checker) — follow every hop of a URL's redirects; flags chains, loops, HTTPS downgrades and meta refreshes.

## License

MIT — see [LICENSE](LICENSE).
