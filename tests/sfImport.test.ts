import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'
import { convertCsv, isJavaSerialised, parseCsv } from '../src/sfImport.js'

const fixture = readFileSync(new URL('./fixtures/internal_all.csv', import.meta.url), 'utf8')
const schema = JSON.parse(readFileSync(new URL('./fixtures/crawl-export.schema.json', import.meta.url), 'utf8'))

describe('parseCsv', () => {
  it('handles a BOM, quoted commas, doubled quotes, embedded newlines and CRLF', () => {
    const rows = parseCsv('﻿a,b\r\n"x, y","say ""hi""\nthere"\r\n1,2\n')
    expect(rows).toEqual([['a', 'b'], ['x, y', 'say "hi"\nthere'], ['1', '2']])
  })
})

describe('convertCsv', () => {
  const { export: out, mapping } = convertCsv(fixture, { auditRunId: 7, exportedAt: '2026-09-29T14:10:00.000Z' })

  it('produces an export that validates against crawlcove-export-spec 1.0.0', () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true })
    addFormats(ajv)
    const validate = ajv.compile(schema)
    const ok = validate(out)
    expect(validate.errors ?? []).toEqual([])
    expect(ok).toBe(true)
    expect(out).toMatchObject({ schemaVersion: '1.0.0', auditRunId: 7, pageCount: 7, runIncomplete: false })
  })

  it('maps the Frog columns to the export fields and reports the rest', () => {
    expect(mapping.mapped).toMatchObject({ url: 'Address', statusCode: 'Status Code', contentType: 'Content Type', depth: 'Crawl Depth', indexable: 'Indexability', title: 'Title 1', titleLength: 'Title 1 Length', metaDescription: 'Meta Description 1', metaLength: 'Meta Description 1 Length', canonical: 'Canonical Link Element 1', htmlLang: 'Language', robotsMeta: 'Meta Robots 1', xRobotsTag: 'X-Robots-Tag 1', wordCount: 'Word Count', linksInternal: 'Unique Outlinks', linksExternal: 'Unique External Outlinks', responseTimeMs: 'Response Time', byteSize: 'Size (bytes)', finalUrl: 'Redirect URL', h1Count: 'H1-1 + H1-2' })
    expect(mapping.mapped).not.toHaveProperty('contentFingerprint')
    expect(mapping.unmapped).toEqual(['imageCount', 'imagesMissingAlt', 'rendered', 'schemaBlocks', 'hreflangCount', 'contentFingerprint', 'findingsCount'])
    expect(mapping.ignoredColumns).toContain('Title 1 Pixel Width')
    expect(mapping.ignoredColumns).toContain('Hash')
    expect(mapping.rows).toBe(8)
    expect(mapping.skipped).toEqual([{ line: 9, reason: 'non-http address "mailto:hello@acmebakery.example"' }])
  })

  it('converts a normal page', () => {
    expect(out.pages[0]).toEqual({
      url: 'https://acmebakery.example/', finalUrl: 'https://acmebakery.example/', statusCode: 200, contentType: 'text/html; charset=UTF-8', depth: 0, indexable: true,
      title: 'Acme Bakery — Fresh Bread Daily in Bristol', titleLength: 42, metaDescription: 'Acme Bakery bakes fresh sourdough, pastries and cakes daily in Bristol.', metaLength: 71,
      canonical: 'https://acmebakery.example/', htmlLang: 'en', robotsMeta: 'index,follow', xRobotsTag: null, h1Count: 1, wordCount: 480, linksInternal: 17, linksExternal: 2,
      imageCount: null, imagesMissingAlt: null, responseTimeMs: 212, byteSize: 24310, rendered: false, redirectHops: 0, fetchError: null, schemaBlocks: 0, hreflangCount: 0, contentFingerprint: '', findingsCount: 0
    })
    expect(out.pages[1].h1Count).toBe(2)
  })

  it('derives finalUrl and redirectHops from a redirect row, indexability from the Frog, and fetchError from a timeout', () => {
    const redirect = out.pages.find((p) => p.url.endsWith('/old-menu'))!
    expect(redirect).toMatchObject({ statusCode: 301, finalUrl: 'https://acmebakery.example/menu', redirectHops: 1, indexable: false, title: null, titleLength: null })
    const secret = out.pages.find((p) => p.url.endsWith('/secret'))!
    expect(secret).toMatchObject({ indexable: false, robotsMeta: 'noindex,nofollow', xRobotsTag: 'noindex' })
    const slow = out.pages.find((p) => p.url.endsWith('/slow'))!
    expect(slow).toMatchObject({ statusCode: null, fetchError: 'Connection Timeout', responseTimeMs: null, contentType: null })
    const gone = out.pages.find((p) => p.url.endsWith('/gone'))!
    expect(gone).toMatchObject({ statusCode: 404, indexable: false, fetchError: null })
  })

  it('keeps quoted titles with commas and newlines intact', () => {
    const q = out.pages.find((p) => p.url.endsWith('/quoted'))!
    expect(q.title).toBe('Title with "quotes", a comma\nand a newline')
  })

  it('tolerates older header spellings and derives indexability when the column is absent', () => {
    const r = convertCsv('Address,Content,Status Code,Status,Title 1,Meta Robots 1,h1 – 1,Size,Response Time\nhttps://a.test/,text/html,200,OK,Hi,noindex,Head,100,0.5\nhttps://a.test/b,text/html,200,OK,B,,,200,1\n')
    expect(r.mapping.mapped).toMatchObject({ contentType: 'Content', byteSize: 'Size', h1Count: 'h1 – 1' })
    expect(r.export.pages[0]).toMatchObject({ indexable: false, titleLength: 2, h1Count: 1, responseTimeMs: 500 })
    expect(r.export.pages[1]).toMatchObject({ indexable: true, h1Count: 0 })
  })

  it('refuses a file with no Address column', () => {
    expect(() => convertCsv('Source,Destination\na,b\n')).toThrow(/no Address\/URL column/)
    expect(() => convertCsv('')).toThrow(/empty CSV/)
  })

  it('recognises a Java-serialised .seospiderconfig by its magic bytes', () => {
    expect(isJavaSerialised(new Uint8Array([0xac, 0xed, 0x00, 0x05]))).toBe(true)
    expect(isJavaSerialised(Buffer.from('Address,Status'))).toBe(false)
  })
})
