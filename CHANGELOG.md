# Changelog

## 1.0.0 — 2026-09-29

Initial release.

- `sf-import <internal_all.csv>`: converts a Screaming Frog Internal export
  to a Crawl Cove crawl export (crawlcove-export-spec 1.0.0, validated in
  the test suite with the spec's own schema).
- Header matching by normalised alias, so old and new Frog column spellings
  both work; every mapped, unmapped and ignored column is reported
  (`--mapping` for the JSON form).
- Derives `finalUrl`/`redirectHops` from Redirect URL, `fetchError` from the
  Frog's Status text, `indexable` from Indexability (or from status + robots
  when the column is absent), `responseTimeMs` from seconds.
- Recognises a Java-serialised `.seospiderconfig` and refuses it with a
  pointer to the README's configuration mapping table.
