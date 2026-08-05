import { validateScope, resolveDirs, validateDirs } from '../utils/cli-utils'
import { DEFAULT_SCORE, DEFAULT_REWORKS } from '../utils/constants'

export interface ResetOptions {
  scope: string
  projectPaths: string[]
  score: number
  reworks: number
  steeringMessage: string
}

export async function resetOptions(cwd: string): Promise<ResetOptions> {
  const { input, select, editor, number } = await import('@inquirer/prompts')
  let scope = ''
  let projectPaths: string[] = []
  let score = DEFAULT_SCORE
  let reworks = DEFAULT_REWORKS
  let steeringMessage = ''

  const inputMethod = await select({
    message: 'How would you like to provide the project scope?',
    choices: [
      { name: 'type   — enter a short description', value: 'type' },
      { name: 'editor — open editor for a longer PRD', value: 'editor' },
    ],
  })

  scope = inputMethod === 'type'
    ? await input({
      message: 'Project scope:',
      validate: validateScope,
    })
    : await editor({
      message: 'Paste or write your PRD (save and close to continue):',
      validate: validateScope,
    })

  const pathsInput = await input({
    message: 'Project paths (comma-separated):',
    default: cwd,
    validate: validateDirs,
  })

  projectPaths = resolveDirs(pathsInput)

  steeringMessage = await input({
    message: 'Are there any additional rules for the process (optional)?',
    default: '',
  })

  score = await number({
    message: 'Inform acceptable score for accepting tasks (0.1 - 1)',
    default: score,
    step: 0.01,
    min: 0.1,
    max: 1,
    validate(value) {
      if (!value) return true
      if (!Number.isFinite(value)) return false
      if (value < 0.1 || value > 1) return false
      return true
    },
  }) || score

  reworks = await number({
    message: 'Inform max number of reworks before triggering a cascade fail (1-10)',
    default: reworks,
    step: 1,
    min: 1,
    max: 10,
    validate(value) {
      if (!value) return true
      if (!Number.isFinite(value)) return false
      if (value < 1 || value > 10) return false
      return true
    }
  }) || reworks

  return {
    scope,
    projectPaths,
    score,
    reworks,
    steeringMessage,
  }
}
