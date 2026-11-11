import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { deflateSync, gzipSync } from 'node:zlib'

const file = resolve(process.cwd(), 'src/server/telegram/widget.html')
const buf = readFileSync(file)
const text = buf.toString('utf8')
const raw = buf.length
const zlib = deflateSync(buf, { level: 9 }).length
const gzip = gzipSync(buf, { level: 9 }).length

const problems = []
if (raw > 32_768) problems.push(`raw HTML ${raw} > 32768`)
if (zlib > 4_096) problems.push(`zlib-9 ${zlib} > 4096`)
if (gzip > 4_096) problems.push(`gzip-9 ${gzip} > 4096`)
if (text.includes('\0')) problems.push('HTML contains a NUL character')

const forbidden = [
  [/https?:\/\//i, 'external URL'],
  [/\bfetch\s*\(/, 'fetch()'],
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
  [/\bWebSocket\b/, 'WebSocket'],
  [/\bEventSource\b/, 'EventSource'],
  [/\bimportScripts\b/, 'importScripts'],
  [/@import/i, '@import'],
  [/\burl\s*\(/i, 'CSS url()'],
  [/<(?:input|select|textarea|form|iframe|link|meta)\b/i, 'form/external element'],
]
for (const [pattern, label] of forbidden) {
  if (pattern.test(text)) problems.push(`forbidden: ${label}`)
}

console.log(`widget: ${file}`)
console.log(`raw:   ${raw} / 32768 bytes`)
console.log(`zlib:  ${zlib} / 4096 bytes${zlib > 4_000 ? ' (target 4000)' : ''}`)
console.log(`gzip:  ${gzip} / 4096 bytes`)

if (problems.length) {
  console.error('\nFAIL')
  for (const problem of problems) console.error(`- ${problem}`)
  process.exit(1)
}
console.log('\nOK')
