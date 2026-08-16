#!/usr/bin/env node
import { cmdRun } from './services/run-service'
import { printVersion } from './utils/cli-utils'
import { cmdReport } from './services/report-service'
import { HELP, COMMAND_HELP } from './utils/constants'
import { DebugContext } from './DebugContext'

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const cmd = args[0]
  const cwd = process.cwd()

  if (!cmd || cmd === '--help' || cmd === '-h' || cmd === 'help') {
    const target = args[1]
    if (target && COMMAND_HELP[target]) {
      console.log(COMMAND_HELP[target])
    } else {
      console.log(HELP)
    }
    return
  }

  if (args.includes('--help') || args.includes('-h')) {
    if (COMMAND_HELP[cmd]) {
      console.log(COMMAND_HELP[cmd])
      return
    }
  }

  if (cmd === '--version' || cmd === '-v' || cmd === 'version') {
    printVersion()
    return
  }

  if (cmd === 'run') {
    const runArgs = args.slice(1)
    await cmdRun(cwd, runArgs)
    return
  }

  if (cmd === 'init') {
    const { cmdInit } = await import('./services/init-service.js')
    const initArgs = args.slice(1)
    await cmdInit(cwd, initArgs)
    return
  }

  if (cmd === 'report') {
    cmdReport(cwd)
    return
  }

  if (cmd === 'settings') {
    const { cmdSettings } = await import('./services/settings-service.js')
    const settingsArgs = args.slice(1)
    await cmdSettings(cwd, settingsArgs)
    return
  }

  if (cmd === 'diagnose') {
    const { cmdDiagnose } = await import('./services/diagnose-service.js')
    const diagnoseArgs = args.slice(1)
    await cmdDiagnose(cwd, diagnoseArgs)
    return
  }

  if (cmd === 'candidate') {
    const { cmdCandidate } = await import('./services/candidate-service.js')
    const candidateArgs = args.slice(1)
    await cmdCandidate(cwd, candidateArgs)
    return
  }

  console.error(`Unknown command: ${cmd}\nRun "hrns help" for usage.`)
  process.exit(1)
}

main().catch((err) => {
  if ((err as NodeJS.ErrnoException).name === 'ExitPromptError') {
    console.log('\nAborted.')
    process.exit(0)
  }
  if (DebugContext.enabled) {
    console.error('\n[DEBUG] Unhandled error:')
    console.error(err)
  } else {
    console.error(err instanceof Error ? err.message : err)
  }
  process.exit(1)
})
