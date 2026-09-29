/**
 * Screaming Frog → Crawl Cove export converter — pure, no network.
 *
 * Reads the CSV Screaming Frog writes for its Internal tab (File → Export →
 * Internal → All, usually `internal_all.csv`, or Bulk Export → Internal) and
 * emits a Crawl Cove crawl export (crawlcove-export-spec v1.0.0), so a Frog
 * crawl can be loaded into crawlcove-mcp's `load_export`, diffed against a
 * Crawl Cove crawl, or fed to anything else built on the spec.
 *
 * Column names are matched by ALIAS after normalising (lower-case, letters and
 * digits only), because the Frog's headers vary by version ("Content" vs
 * "Content Type", "H1-1" vs "h1 – 1", "Size (bytes)" vs "Size"). Every mapping
 * decision is reported, and every field that has no Frog source is left null
 * or at its documented default rather than guessed. The `.seospiderconfig`
 * file is Java serialisation, not a text format, and is NOT converted — see
 * the README's mapping table for what to set by hand.
 */
export interface ExportPage {
    url: string;
    finalUrl: string | null;
    statusCode: number | null;
    contentType: string | null;
    depth: number | null;
    indexable: boolean;
    title: string | null;
    titleLength: number | null;
    metaDescription: string | null;
    metaLength: number | null;
    canonical: string | null;
    htmlLang: string | null;
    robotsMeta: string | null;
    xRobotsTag: string | null;
    h1Count: number | null;
    wordCount: number | null;
    linksInternal: number | null;
    linksExternal: number | null;
    imageCount: number | null;
    imagesMissingAlt: number | null;
    responseTimeMs: number | null;
    byteSize: number | null;
    rendered: boolean;
    redirectHops: number;
    fetchError: string | null;
    schemaBlocks: number;
    hreflangCount: number;
    contentFingerprint: string;
    findingsCount: number;
}
export interface CrawlExport {
    schemaVersion: '1.0.0';
    exportedAt: string;
    auditRunId: number;
    runIncomplete: boolean;
    pageCount: number;
    pages: ExportPage[];
}
export type Field = keyof ExportPage;
export interface MappingReport {
    /** Export field → the Frog column it was read from. */
    mapped: Partial<Record<Field, string>>;
    /** Export fields with no Frog source in this file (left null / default). */
    unmapped: Field[];
    /** Frog columns this converter does not use. */
    ignoredColumns: string[];
    rows: number;
    skippedRows: number;
    /** Rows dropped and why (bad row length, empty address, non-http scheme). */
    skipped: Array<{
        line: number;
        reason: string;
    }>;
    notes: string[];
}
export interface ConvertResult {
    export: CrawlExport;
    mapping: MappingReport;
}
/** RFC 4180 CSV parser: quoted fields, doubled quotes, CRLF or LF, optional BOM. Pure. */
export declare function parseCsv(text: string): string[][];
/** Convert parsed CSV rows (header first) to a Crawl Cove export + mapping report. Pure. */
export declare function convertRows(rows: string[][], options?: {
    auditRunId?: number;
    exportedAt?: string;
}): ConvertResult;
/** Convert CSV text. Pure. */
export declare function convertCsv(text: string, options?: {
    auditRunId?: number;
    exportedAt?: string;
}): ConvertResult;
/** True when the bytes look like a Java-serialised .seospiderconfig (magic 0xACED). */
export declare function isJavaSerialised(buf: Uint8Array): boolean;
