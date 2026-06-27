#!/usr/bin/env node
import { input, select, editor } from '@inquirer/prompts'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { HarnessOrchestrator } from '../orchestrator/HarnessOrchestrator'
import { AgentRunnerFactory } from '../agent-runner/AgentRunnerFactory'
import { StartupBanner } from '../ui/StartupBanner'
import { AnsiHelpers } from '../ui/AnsiHelpers'

const HELP = `
@romabeckman/hk — harness-kit autonomous orchestrator

USAGE
  hk <command>

COMMANDS
  run       Start or resume an orchestration session (interactive)
  report    Print token usage report for the current session
  help      Show this help message

OPTIONS
  --help, -h    Show this help message
  --version, -v Show version

EXAMPLES
  hk run
  hk report
  npx @romabeckman/hk run

DOCS
  https://github.com/romabeckman/harness-kit
`

function printVersion(): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const pkg = require('../../package.json') as { version: string }
  console.log(`@romabeckman/hk v${pkg.version}`)
}

interface RunOptions {
  agentType?: string
  model?: string
}

async function cmdRun(cwd: string, options: RunOptions = {}): Promise<void> {
  const productDir = join(cwd, 'docs', 'product')
  const backlogPath = join(productDir, 'BACKLOG.md')
  const hasExistingSession = existsSync(backlogPath)

  console.log('\n' + StartupBanner.render(process.stdout.columns || 80) + '\n')

  const action = hasExistingSession
    ? await select({
        message: 'What would you like to do?',
        choices: [
          { name: 'resume — continue from last session', value: 'resume' },
          { name: 'reset  — discard current session and start a new cycle', value: 'reset' },
        ],
      })
    : 'reset'

  let steeringMessage = ''
  if (action === 'resume') {
    steeringMessage = await input({
      message: 'Steering rules or state overrides (optional):',
      default: '',
    })
  }

  let scope = ''
  if (action === 'reset') {
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
          validate: (v) => v.trim().length > 0 || 'Scope cannot be empty.',
        })
      : await editor({
          message: 'Paste or write your PRD (save and close to continue):',
          validate: (v) => v.trim().length > 0 || 'Scope cannot be empty.',
        })
  }

  const pathsInput = await input({
    message: 'Project paths (comma-separated):',
    default: cwd,
    validate: (v) => v.trim().length > 0 || 'At least one path is required.',
  })

  const projectPaths = pathsInput.split(',').map((p) => resolve(p.trim())).filter(Boolean)

  console.log('\n── Starting orchestration ──────────────────────────────')
  if (action === 'reset') {
    console.log(`  scope:  ${scope.slice(0, 80)}${scope.length > 80 ? '…' : ''}`)
  } else {
    console.log('  resuming from existing session')
  }
  console.log(`  paths:  ${projectPaths.join(', ')}`)
  console.log('────────────────────────────────────────────────────────\n')

  if (action === 'reset' && existsSync(productDir)) {
    const { rmSync } = await import('node:fs')
    rmSync(productDir, { recursive: true, force: true })
  }

  const agentRunner = options.agentType
    ? AgentRunnerFactory.create({ type: options.agentType, model: options.model })
    : undefined

  const orchestrator = new HarnessOrchestrator({
    scope: scope || '(resume)',
    projectPaths,
    productDir,
    agentRunner,
  })

  if (action === 'resume') {
    const state = orchestrator.getState()
    const phaseDesc = orchestrator.getPhaseDescription(state.currentPhase)
    console.log(`\n${AnsiHelpers.blue('►')} ${AnsiHelpers.dim('Current State:')} ${AnsiHelpers.cyan(phaseDesc)}`)
    if (state.activeFeatureId) {
      console.log(`  ${AnsiHelpers.dim('Active Feature:')} ${state.activeFeatureId}`)
    }
  }

  if (action === 'resume' && steeringMessage.trim()) {
    console.log('\nAnalyzing steering message...')
    const { SteeringAnalyzer } = require('../orchestrator/SteeringAnalyzer') as typeof import('../orchestrator/SteeringAnalyzer')
    // Use explicit agentRunner or fall back to a default runner for steering analysis
    const steeringRunner = agentRunner ?? AgentRunnerFactory.create({ type: 'claude-code' })
    const actions = await SteeringAnalyzer.analyze(steeringMessage, steeringRunner)
    if (actions.length > 0) {
      console.log(`${AnsiHelpers.green('✓')} Applying ${actions.length} steering action(s)...`)
      orchestrator.applySteeringActions(actions)
      console.log()
    } else {
      console.log('No actionable steering instructions detected.\n')
    }
  }

  await orchestrator.run()
  console.log('\n✓ All features completed.')
  orchestrator.tokenReport()
}

function cmdReport(cwd: string): void {
  const { TokenLedger } = require('../telemetry/TokenLedger') as typeof import('../telemetry/TokenLedger')
  const ledger = new TokenLedger(join(cwd, 'docs', 'product', 'tokens.jsonl'))
  ledger.printReport()
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const cmd = args[0]
  const cwd = process.cwd()

  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    console.log(HELP)
    return
  }

  if (cmd === '--version' || cmd === '-v' || cmd === 'version') {
    printVersion()
    return
  }

  if (cmd === 'run') {
    const runArgs = args.slice(1)
    const options: RunOptions = {}

    for (let i = 0; i < runArgs.length; i++) {
      const arg = runArgs[i]
      if (arg === '--copilot') {
        options.agentType = 'copilot'
      } else if (arg === '--gemini') {
        options.agentType = 'gemini'
      } else if (arg === '--agent' || arg === '-a') {
        options.agentType = runArgs[++i]
      } else if (arg === '--model' || arg === '-m') {
        options.model = runArgs[++i]
      }
    }

    await cmdRun(cwd, options)
    return
  }

  if (cmd === 'report') {
    cmdReport(cwd)
    return
  }

  console.error(`Unknown command: ${cmd}\nRun "hk help" for usage.`)
  process.exit(1)
}

main().catch((err) => {
  if ((err as NodeJS.ErrnoException).name === 'ExitPromptError') {
    console.log('\nAborted.')
    process.exit(0)
  }
  console.error(err)
  process.exit(1)
})
