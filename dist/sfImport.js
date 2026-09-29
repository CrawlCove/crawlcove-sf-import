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
/** RFC 4180 CSV parser: quoted fields, doubled quotes, CRLF or LF, optional BOM. Pure. */
export function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let i = 0;
    let inQuotes = false;
    if (text.charCodeAt(0) === 0xfeff)
        i = 1;
    while (i < text.length) {
        const c = text[i];
        if (inQuotes) {
            if (c === '"') {
                if (text[i + 1] === '"') {
                    field += '"';
                    i += 2;
                    continue;
                }
                inQuotes = false;
                i++;
                continue;
            }
            field += c;
            i++;
            continue;
        }
        if (c === '"') {
            inQuotes = true;
            i++;
            continue;
        }
        if (c === ',') {
            row.push(field);
            field = '';
            i++;
            continue;
        }
        if (c === '\r' || c === '\n') {
            row.push(field);
            field = '';
            rows.push(row);
            row = [];
            if (c === '\r' && text[i + 1] === '\n')
                i++;
            i++;
            continue;
        }
        field += c;
        i++;
    }
    if (field !== '' || row.length > 0) {
        row.push(field);
        rows.push(row);
    }
    return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}
const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
/** Aliases per export field, normalised the same way as headers. First match wins. */
const ALIASES = {
    url: ['address', 'url'],
    finalUrl: ['redirecturi', 'redirecturl'],
    statusCode: ['statuscode'],
    contentType: ['contenttype', 'content'],
    depth: ['crawldepth', 'depth'],
    indexable: ['indexability'],
    title: ['title1', 'title'],
    titleLength: ['title1length', 'titlelength'],
    metaDescription: ['metadescription1', 'metadescription'],
    metaLength: ['metadescription1length', 'metadescriptionlength1', 'metadescriptionlength'],
    canonical: ['canonicallinkelement1', 'canonicallinkelement', 'canonical'],
    htmlLang: ['language', 'htmllang', 'lang'],
    robotsMeta: ['metarobots1', 'metarobots'],
    xRobotsTag: ['xrobotstag1', 'xrobotstag'],
    wordCount: ['wordcount'],
    linksInternal: ['uniqueoutlinks', 'outlinks'],
    linksExternal: ['uniqueexternaloutlinks', 'externaloutlinks'],
    responseTimeMs: ['responsetime'],
    byteSize: ['sizebytes', 'size'],
    contentFingerprint: ['hash']
};
const H1_ALIASES = ['h11', 'h12', 'h1len1', 'h1len2'];
const FETCH_ERROR_STATUSES = ['connection timeout', 'connection refused', 'connection error', 'no response', 'dns lookup failed', 'blocked by robots.txt'];
function toInt(v) {
    if (v === undefined)
        return null;
    const t = v.trim();
    if (t === '')
        return null;
    const n = Number(t.replace(/,/g, ''));
    return Number.isFinite(n) ? Math.round(n) : null;
}
function toStr(v) {
    if (v === undefined)
        return null;
    const t = v.trim();
    return t === '' ? null : t;
}
/** Convert parsed CSV rows (header first) to a Crawl Cove export + mapping report. Pure. */
export function convertRows(rows, options = {}) {
    if (rows.length === 0)
        throw new Error('empty CSV: no header row');
    const header = rows[0].map((h) => h.trim());
    const normHeader = header.map(norm);
    const col = (aliases) => {
        for (const a of aliases) {
            const i = normHeader.indexOf(a);
            if (i !== -1)
                return i;
        }
        return -1;
    };
    const idx = {};
    const mapped = {};
    for (const [field, aliases] of Object.entries(ALIASES)) {
        const i = col(aliases);
        if (i !== -1) {
            idx[field] = i;
            mapped[field] = header[i];
        }
    }
    if (idx.url === undefined)
        throw new Error(`no Address/URL column found; got: ${header.slice(0, 8).join(', ')}${header.length > 8 ? ', …' : ''}. Export the Internal tab (File → Export → Internal → All).`);
    const statusTextIdx = col(['status']);
    const h1Idx = H1_ALIASES.slice(0, 2).map((a) => normHeader.indexOf(a)).filter((i) => i !== -1);
    const h1LenIdx = H1_ALIASES.slice(2).map((a) => normHeader.indexOf(a)).filter((i) => i !== -1);
    if (h1Idx.length > 0)
        mapped.h1Count = h1Idx.map((i) => header[i]).join(' + ');
    const notes = [];
    if (mapped.contentFingerprint) {
        // The Frog's Hash is an MD5 of the response, not Crawl Cove's 64-bit
        // content fingerprint; the two are never comparable, so it is not carried.
        delete idx.contentFingerprint;
        delete mapped.contentFingerprint;
        notes.push('Hash ignored: Screaming Frog hashes the whole response (MD5); Crawl Cove fingerprints visible content (64-bit). Not comparable, left empty.');
    }
    const used = new Set([...Object.values(idx), statusTextIdx, ...h1Idx, ...h1LenIdx].filter((i) => i !== undefined && i !== -1));
    if (h1Idx.length > 0)
        notes.push(`h1Count is counted from the ${h1Idx.length} H1 column(s) the Frog exports, so it is capped at ${h1Idx.length}.`);
    if (mapped.finalUrl)
        notes.push('redirectHops is 1 when Redirect URI is set, else 0: the Internal export records one hop. Use the Frog\'s Redirect Chains report for full chains.');
    if (mapped.linksInternal)
        notes.push(`linksInternal reads ${mapped.linksInternal}; the Frog counts internal outlinks there and external ones separately.`);
    if (!mapped.htmlLang)
        notes.push('htmlLang: no Language column; enable Config → Spider → Extraction → Language, or leave null.');
    const pages = [];
    const skipped = [];
    const get = (row, f) => (idx[f] === undefined ? undefined : row[idx[f]]);
    rows.slice(1).forEach((row, n) => {
        const line = n + 2;
        if (row.length < header.length - 2) {
            skipped.push({ line, reason: `row has ${row.length} field(s), header has ${header.length}` });
            return;
        }
        const url = toStr(get(row, 'url'));
        if (url === null) {
            skipped.push({ line, reason: 'empty Address' });
            return;
        }
        if (!/^https?:\/\//i.test(url)) {
            skipped.push({ line, reason: `non-http address "${url.slice(0, 60)}"` });
            return;
        }
        const statusCode = toInt(get(row, 'statusCode'));
        const statusText = statusTextIdx === -1 ? '' : (row[statusTextIdx] ?? '').trim();
        const redirectTo = toStr(get(row, 'finalUrl'));
        const isRedirect = statusCode !== null && statusCode >= 300 && statusCode < 400;
        const indexRaw = (get(row, 'indexable') ?? '').trim().toLowerCase();
        const robotsMeta = toStr(get(row, 'robotsMeta'));
        const xRobotsTag = toStr(get(row, 'xRobotsTag'));
        const noindex = /\bnoindex\b/i.test(robotsMeta ?? '') || /\bnoindex\b/i.test(xRobotsTag ?? '');
        const indexable = indexRaw !== '' ? indexRaw === 'indexable' : statusCode === 200 && !noindex;
        const fetchError = (statusCode === null || statusCode === 0) && statusText !== '' ? statusText : FETCH_ERROR_STATUSES.includes(statusText.toLowerCase()) ? statusText : null;
        const responseSec = get(row, 'responseTimeMs');
        const responseTimeMs = responseSec === undefined || responseSec.trim() === '' ? null : Number.isFinite(Number(responseSec)) ? Math.round(Number(responseSec) * 1000) : null;
        const title = toStr(get(row, 'title'));
        const metaDescription = toStr(get(row, 'metaDescription'));
        const h1Count = h1Idx.length === 0 ? null : h1Idx.filter((i) => (row[i] ?? '').trim() !== '').length;
        pages.push({
            url,
            finalUrl: isRedirect && redirectTo !== null ? redirectTo : url,
            statusCode: statusCode === 0 ? null : statusCode,
            contentType: toStr(get(row, 'contentType')),
            depth: toInt(get(row, 'depth')),
            indexable,
            title,
            titleLength: title === null ? null : (toInt(get(row, 'titleLength')) ?? title.length),
            metaDescription,
            metaLength: metaDescription === null ? null : (toInt(get(row, 'metaLength')) ?? metaDescription.length),
            canonical: toStr(get(row, 'canonical')),
            htmlLang: toStr(get(row, 'htmlLang')),
            robotsMeta,
            xRobotsTag,
            h1Count,
            wordCount: toInt(get(row, 'wordCount')),
            linksInternal: toInt(get(row, 'linksInternal')),
            linksExternal: toInt(get(row, 'linksExternal')),
            imageCount: null,
            imagesMissingAlt: null,
            responseTimeMs,
            byteSize: toInt(get(row, 'byteSize')),
            rendered: false,
            redirectHops: isRedirect && redirectTo !== null ? 1 : 0,
            fetchError,
            schemaBlocks: 0,
            hreflangCount: 0,
            contentFingerprint: '',
            findingsCount: 0
        });
    });
    const ALL_FIELDS = ['url', 'finalUrl', 'statusCode', 'contentType', 'depth', 'indexable', 'title', 'titleLength', 'metaDescription', 'metaLength', 'canonical', 'htmlLang', 'robotsMeta', 'xRobotsTag', 'h1Count', 'wordCount', 'linksInternal', 'linksExternal', 'imageCount', 'imagesMissingAlt', 'responseTimeMs', 'byteSize', 'rendered', 'redirectHops', 'fetchError', 'schemaBlocks', 'hreflangCount', 'contentFingerprint', 'findingsCount'];
    const derived = ['redirectHops', 'fetchError'];
    const unmapped = ALL_FIELDS.filter((f) => !(f in mapped) && !derived.includes(f));
    notes.push('Always empty/default (no Internal-tab source): imageCount, imagesMissingAlt (Images tab), schemaBlocks (Structured Data tab), hreflangCount (Hreflang tab), rendered (per-crawl setting), findingsCount (Crawl Cove checks have not run).');
    const exportedAt = options.exportedAt ?? new Date().toISOString();
    return {
        export: { schemaVersion: '1.0.0', exportedAt, auditRunId: options.auditRunId ?? 1, runIncomplete: false, pageCount: pages.length, pages },
        mapping: { mapped, unmapped, ignoredColumns: header.filter((_, i) => !used.has(i)), rows: rows.length - 1, skippedRows: skipped.length, skipped, notes }
    };
}
/** Convert CSV text. Pure. */
export function convertCsv(text, options = {}) {
    return convertRows(parseCsv(text), options);
}
/** True when the bytes look like a Java-serialised .seospiderconfig (magic 0xACED). */
export function isJavaSerialised(buf) {
    return buf.length >= 2 && buf[0] === 0xac && buf[1] === 0xed;
}
