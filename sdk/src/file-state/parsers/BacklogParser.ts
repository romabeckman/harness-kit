import type { Feature, FeatureLayer, FeatureStatus } from '../types'

function parseCell(cell: string): string {
  return normalizeId(cell)
}

function normalizeId(cell: string): string {
  return cell.trim().replace(/\*\*/g, '').replace(/`/g, '')
}

function parseNumber(cell: string): number {
  return parseInt(cell.trim(), 10)
}

function parseScore(cell: string): number | null {
  const v = cell.trim()
  if (v === '-' || v === '' || v.toLowerCase() === 'null') return null
  const n = parseFloat(v)
  return isNaN(n) ? null : n
}

function parseDependencies(cell: string): string[] {
  const v = cell.trim()
  if (v === '-' || v === '') return []
  return v.split(',').map(s => s.trim()).filter(Boolean)
}

function isFeatureStatus(s: string): s is FeatureStatus {
  return ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED', 'FAILED'].includes(s)
}

function parseLayer(cell: string): FeatureLayer | null {
  const v = normalizeId(cell).toLowerCase()

  if (v === 'backend' || v === 'developer-backend') return 'backend'
  if (v === 'frontend' || v === 'developer-frontend') return 'frontend'
  if (v === 'qa' || v === 'developer-qa') return 'qa'
  if (v === 'devops' || v === 'developer-devops') return 'devops'
  return null
}

/**
 * Parses a BACKLOG.md markdown table into Feature[].
 * Columns: ID | Title | Domain | Agent | Priority | Dependencies | Reworks | Score (TL) | Score (Adv) | Status
 */
export class BacklogParser {
  static parse(markdown: string): Feature[] {
    const lines = markdown.split('\n').map(l => l.trim())
    const dataLines = lines.filter(l => {
      if (!l.startsWith('|')) return false
      if (l.replace(/\|/g, '').replace(/-/g, '').replace(/:/g, '').trim() === '') return false
      const cells = l.split('|').filter((_, i) => i > 0 && i < l.split('|').length - 1)
      if (cells.length < 2) return false
      // skip header and separator
      const first = cells[0].trim().replace(/:/g, '')
      if (first === 'ID' || first === '---') return false
      return true
    })

    const features: Feature[] = []
    for (const line of dataLines) {
      try {
        const cells = line.split('|').slice(1, -1)
        if (cells.length < 10) continue
        const id = normalizeId(cells[0])
        if (!id || id === '---') continue
        const status = parseCell(cells[9])
        features.push({
          id,
          title: parseCell(cells[1]),
          domain: parseCell(cells[2]),
          layer: parseLayer(cells[3]),
          priority: parseNumber(cells[4]),
          dependencies: parseDependencies(cells[5]),
          reworks: parseNumber(cells[6]) || 0,
          scoreTL: parseScore(cells[7]),
          scoreAdv: parseScore(cells[8]),
          status: isFeatureStatus(status) ? status : 'NOT_STARTED',
        })
      } catch {
        // malformed row — skip gracefully
      }
    }
    return features
  }
}
