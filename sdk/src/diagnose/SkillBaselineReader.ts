import { lstatSync, readdirSync, readFileSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, relative } from 'node:path'

export function readCodexSkillBaselines(recordedSkills: readonly string[]): Record<string, string> {
  const skills = new Set<string>()
  for (const recorded of recordedSkills) {
    const match = /^(?:harness-kit:)?([a-z][a-z0-9-]*)$/.exec(recorded)
    if (match) skills.add(match[1])
  }
  if (skills.size === 0) return {}

  const codexHome = process.env.CODEX_HOME?.trim() || join(homedir(), '.codex')
  const cache = join(codexHome, 'plugins', 'cache', 'harness-kit', 'harness-kit')
  let root: string
  try {
    const versions = readdirSync(cache, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && /^\d+\.\d+\.\d+$/.test(entry.name))
      .map(entry => entry.name)
      .sort((a, b) => b.localeCompare(a, 'en', { numeric: true }))
    if (versions.length === 0) return {}
    root = realpathSync(join(cache, versions[0]))
  } catch {
    return {}
  }

  const baselines: Record<string, string> = {}
  for (const skill of skills) {
    try {
      const file = join(root, 'skills', skill, 'SKILL.md')
      if (!lstatSync(file, { throwIfNoEntry: false })?.isFile()) continue
      const target = realpathSync(file)
      if (relative(root, target) !== join('skills', skill, 'SKILL.md')) continue
      const content = readFileSync(target, 'utf8').trim()
      if (content) baselines[`harness-kit:${skill}`] = content
    } catch {
      continue
    }
  }
  return baselines
}
