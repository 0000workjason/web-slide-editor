import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const files = execFileSync('git', ['ls-files', '-z'])
  .toString('utf8')
  .split('\0')
  .filter(Boolean)

const sensitiveNames = [
  /(^|\/)\.env($|\.)/i,
  /(^|\/)(id_rsa|id_ed25519|credentials|\.npmrc|\.netrc)$/i,
  /\.(pem|key|p12|pfx|jks|keystore)$/i,
]

const secretPatterns = [
  ['private key', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/],
  ['AWS access key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['OpenAI API key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/],
  ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ['embedded credentials', /:\/\/[^\s/:]+:[^\s/@]+@/],
  [
    'assigned secret',
    /\b(?:password|passwd|pwd|secret|client[_-]?secret|api[_-]?key|access[_-]?token|auth[_-]?token)\b\s*[:=]\s*["'`]?[A-Za-z0-9_./+=-]{8,}/i,
  ],
]

const findings = []

for (const file of files) {
  if (sensitiveNames.some((pattern) => pattern.test(file))) {
    findings.push(`${file}: sensitive filename`)
  }

  const contents = readFileSync(file)
  if (contents.includes(0)) continue

  const text = contents.toString('utf8')
  for (const [label, pattern] of secretPatterns) {
    if (pattern.test(text)) findings.push(`${file}: possible ${label}`)
  }
}

if (findings.length > 0) {
  console.error('Sensitive-information check failed:')
  for (const finding of findings) console.error(`- ${finding}`)
  process.exit(1)
}

console.log(`Sensitive-information check passed (${files.length} tracked files).`)
