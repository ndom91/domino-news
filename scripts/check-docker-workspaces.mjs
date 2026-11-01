import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const workspaces = JSON.parse(
  execFileSync('pnpm', ['-r', 'list', '--depth', '-1', '--json'], { cwd: root, encoding: 'utf8' }),
)
const expected = new Set(
  workspaces
    .map(({ path: directory }) => path.relative(root, directory).split(path.sep).join('/'))
    .filter(Boolean)
    .map((directory) => `${directory}/package.json`),
)
const dockerfile = readFileSync(path.join(root, 'infra/compose/Dockerfile'), 'utf8')
const copied = new Set(
  Array.from(dockerfile.matchAll(/^COPY\s+(\S+\/package\.json)\s+\1\s*$/gm), (match) => match[1]),
)
const missing = [...expected].filter((manifest) => !copied.has(manifest))
const extra = [...copied].filter((manifest) => !expected.has(manifest))
if (missing.length || extra.length) {
  if (missing.length) console.error(`Missing Dockerfile workspace manifests: ${missing.join(', ')}`)
  if (extra.length) console.error(`Unexpected Dockerfile workspace manifests: ${extra.join(', ')}`)
  process.exitCode = 1
} else {
  console.log('Dockerfile workspace manifests match pnpm workspace')
}
