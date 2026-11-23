import { lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { basename, join, relative } from 'node:path'

interface SkillReference {
  source: 'workspace' | 'codex-cache'
  path: string
  version?: string
  sha256: string
  content: string
}

export function readActiveSkillReferences(recordedSkills: readonly string[], workspace: string): Record<string, SkillReference> {
  const skills = new Set<string>()
  for (const recorded of recordedSkills) {
    const match = /^(?:harness-kit:)?([a-z][a-z0-9-]*)$/.exec(recorded)
    if (match) skills.add(match[1])
  }
  if (skills.size === 0) return {}

  const codexHome = process.env.CODEX_HOME?.trim() || join(homedir(), '.codex')
  const cache = join(codexHome, 'plugins', 'cache', 'harness-kit', 'harness-kit')
  let cachedRoot: string | undefined
  try {
    const versions = readdirSync(cache, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && /^\d+\.\d+\.\d+$/.test(entry.name))
      .map(entry => entry.name)
      .sort((a, b) => b.localeCompare(a, 'en', { numeric: true }))
    if (versions.length > 0) cachedRoot = realpathSync(join(cache, versions[0]))
  } catch {
    // The workspace may provide the skill without a Codex cache.
  }

  const references: Record<string, SkillReference> = {}
  const workspaceRoot = realpathSync(workspace)
  for (const skill of skills) {
    for (const root of [workspaceRoot, cachedRoot]) {
      if (!root) continue
      try {
        const path = join('skills', skill, 'SKILL.md')
        const file = join(root, path)
        if (!lstatSync(file, { throwIfNoEntry: false })?.isFile()) continue
        if (relative(root, realpathSync(file)) !== path) continue
        const bytes = readFileSync(file)
        if (!bytes.toString('utf8').trim()) continue
        const fromCache = root !== workspaceRoot
        references[`harness-kit:${skill}`] = {
          source: fromCache ? 'codex-cache' : 'workspace',
          path: file,
          ...(fromCache ? { version: basename(root) } : {}),
          sha256: createHash('sha256').update(bytes).digest('hex'),
          content: bytes.toString('utf8'),
        }
        break
      } catch {
        // An unavailable reference must stay unknown.
      }
    }
  }
  return references
}
