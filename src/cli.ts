#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { Command } from 'commander'
import { convertCsv, isJavaSerialised } from './sfImport.js'

const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }

const program = new Command()
program
  .name('sf-import')
  .description('Convert a Screaming Frog Internal export (internal_all.csv) into a Crawl Cove crawl export (JSON), with a mapping report.')
  .version(version)
  .argument('<file>', 'internal_all.csv ("-" for stdin)')
  .option('-o, --out <path>', 'write the JSON export here (default: stdout)')
  .option('--run-id <n>', 'auditRunId to stamp on the export', '1')
  .option('--mapping', 'print only the mapping report (JSON) and no export', false)
  .option('--quiet', 'no mapping summary on stderr', false)
  .action((file: string, opts) => {
    const buf = file === '-' ? readFileSync(0) : readFileSync(file)
    if (isJavaSerialised(buf) || /\.seospiderconfig$/i.test(file)) {
      console.error(`${file} is a Screaming Frog configuration file (Java serialisation, not a text format). This tool converts crawl EXPORTS, not configs; see the README's "Configuration" table for which settings to re-create in Crawl Cove by hand.`)
      process.exitCode = 2
      return
    }
    let result
    try {
      result = convertCsv(buf.toString('utf8'), { auditRunId: Number(opts.runId) || 1 })
    } catch (e) {
      console.error(e instanceof Error ? e.message : String(e))
      process.exitCode = 2
      return
    }
    const m = result.mapping
    if (opts.mapping) {
      process.stdout.write(`${JSON.stringify(m, null, 2)}\n`)
      return
    }
    const json = `${JSON.stringify(result.export, null, 2)}\n`
    if (opts.out) writeFileSync(opts.out, json)
    else process.stdout.write(json)
    if (!opts.quiet) {
      const lines = [
        `${m.rows} row(s) read, ${result.export.pageCount} page(s) written${m.skippedRows ? `, ${m.skippedRows} skipped` : ''}${opts.out ? ` → ${opts.out}` : ''}`,
        `mapped: ${Object.entries(m.mapped).map(([f, c]) => `${f}←${c}`).join(', ')}`,
        `not in this export: ${m.unmapped.join(', ')}`,
        ...m.notes.map((n) => `note: ${n}`),
        ...m.skipped.slice(0, 5).map((s) => `skipped line ${s.line}: ${s.reason}`)
      ]
      console.error(lines.join('\n'))
    }
  })

program.parseAsync(process.argv)
