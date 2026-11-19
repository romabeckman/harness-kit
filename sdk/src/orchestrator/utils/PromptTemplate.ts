import { readFileSync } from 'node:fs'
import { join } from 'node:path'

type PromptValue = string | number | boolean | null | undefined | readonly string[]

export function renderPrompt(id: string, template: string, values: Record<string, PromptValue>): string {
  const value = (name: string): PromptValue => {
    if (!Object.prototype.hasOwnProperty.call(values, name)) {
      throw new Error(`Prompt template ${id} is missing value ${name}`)
    }
    return values[name]
  }

  return template.split('\n').flatMap(line => {
    const spread = /^\{\{\*([a-zA-Z][a-zA-Z0-9_]*)\}\}$/.exec(line)
    if (spread) {
      const lines = value(spread[1])
      if (!Array.isArray(lines)) throw new Error(`Prompt template ${id} requires an array for ${spread[1]}`)
      return lines
    }
    return line.replace(/\{\{([a-zA-Z][a-zA-Z0-9_]*)\}\}/g, (_, name: string) => {
      const replacement = value(name)
      return replacement == null ? '' : String(replacement)
    })
  }).join('\n')
}

export function loadPrompt(id: string, values: Record<string, PromptValue>): string {
  const template = readFileSync(join(__dirname, '..', 'prompts', `${id}.md`), 'utf8').replace(/\r\n/g, '\n')
  // A final newline terminates the Markdown file; additional newlines belong to the prompt.
  return renderPrompt(id, template.endsWith('\n') ? template.slice(0, -1) : template, values)
}
