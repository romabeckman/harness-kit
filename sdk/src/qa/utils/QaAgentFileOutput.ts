import { mkdirSync, readFileSync, unlinkSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

export interface QaAgentFileOutput {
  readonly path: string
  readonly promptPath: string
}

export function createQaAgentFileOutput(workspace: string, phase: string): QaAgentFileOutput {
  const path = join(workspace, 'docs', 'qa', `.agentic-${phase}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`)
  return { path, promptPath: relative(workspace, path).replaceAll('\\', '/') }
}

export function prepareQaAgentFileOutput(output: QaAgentFileOutput): void {
  mkdirSync(dirname(output.path), { recursive: true })
  removeQaAgentFileOutput(output)
}

export function readQaAgentFileOutput(output: QaAgentFileOutput, fallback: string): string {
  try {
    const content = readFileSync(output.path, 'utf8').trim()
    if (content.length > 0) return content
  } catch { }
  return fallback
}

export function removeQaAgentFileOutput(output: QaAgentFileOutput): void {
  try { unlinkSync(output.path) } catch { }
}

export function buildQaAgentFileOutputInstructions(output: QaAgentFileOutput, label: string): string[] {
  return [
    `<qa_output_file>${output.promptPath}</qa_output_file>`,
    `Generate ${label} directly in this file using file tools.`,
    'Write exactly one valid JSON object to the file.',
    'Create or overwrite the file. Do not return the JSON in your response. Return only a short confirmation after the file is written.',
  ]
}
