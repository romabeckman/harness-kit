import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { FileStateManager } from '../../file-state/FileStateManager'
import { createDefaultSteeringRules } from '../../file-state/types'
import { AnsiHelpers } from '../../ui/AnsiHelpers'
import { StartupBanner } from '../../ui/StartupBanner'
import { DEFAULT_LINE_LENGTH } from '../utils/constants'

export async function cmdInit(cwd: string, args: string[]): Promise<void> {
  const { input, confirm } = await import('@inquirer/prompts')
  console.log('\n' + StartupBanner.render(process.stdout.columns || DEFAULT_LINE_LENGTH) + '\n')

  const productDir = join(cwd, 'docs', 'product')
  const hasExistingProduct = existsSync(productDir)

  if (hasExistingProduct) {
    const overwrite = await confirm({
      message: 'The docs/product directory already exists. Are you sure you want to re-initialize and potentially overwrite files?',
      default: false
    })
    if (!overwrite) {
      console.log('Aborted initialization.')
      return
    }

    const { rmSync } = await import("node:fs");
    rmSync(productDir, { recursive: true, force: true });
    console.log(`${AnsiHelpers.green('✓')} Removed existing product directory.\n`)
  }

  console.log(AnsiHelpers.blue('►') + ' Initializing Harness Kit workspace...\n')

  const fsm = new FileStateManager({ productDir, workingDir: cwd })

  // 1. Create base docs
  fsm.ensureProductFiles()
  console.log(`${AnsiHelpers.green('✓')} Created essential tracking files in docs/product/\n`)

  // 2. Interactive wizard for Steering Rules
  console.log('── Steering Rules Configuration ──────────────────────────')
  console.log('You can provide optional steering rules for each phase.')
  console.log('Press ENTER to skip and use defaults.\n')

  const defaultRules = createDefaultSteeringRules()

  const phases = [
    { key: 'user', name: 'Global (user)', desc: 'Rules applied across all phases' },
    { key: 'bootstrap', name: 'Bootstrap', desc: 'Project initialization & backlog generation' },
    { key: 'planning', name: 'Planning', desc: 'Tactical design & Test scenarios' },
    { key: 'implementation', name: 'Implementation', desc: 'TDD loops (RED, GREEN, REFACTOR)' },
    { key: 'review', name: 'Review', desc: 'Tech Lead & QA code reviews' },
    { key: 'memory', name: 'Memory', desc: 'Documentation & Memory updates' }
  ] as const

  const customRules: Record<string, string[]> = {}

  for (const p of phases) {
    const rule = await input({
      message: `[${p.name}] ${p.desc}:\n  >`
    })

    if (rule.trim()) {
      customRules[p.key] = [rule.trim()]
    }
  }

  // 3. Save merged config
  const currentConfig = fsm.loadBootstrapConfig()

  const mergedSteeringRules = {
    user: [...(defaultRules.user || []), ...(customRules.user || [])],
    bootstrap: [...(defaultRules.bootstrap || []), ...(customRules.bootstrap || [])],
    planning: [...(defaultRules.planning || []), ...(customRules.planning || [])],
    implementation: [...(defaultRules.implementation || []), ...(customRules.implementation || [])],
    review: [...(defaultRules.review || []), ...(customRules.review || [])],
    memory: [...(defaultRules.memory || []), ...(customRules.memory || [])]
  }

  currentConfig.steeringRules = mergedSteeringRules
  fsm.saveBootstrapConfig(currentConfig)

  console.log(`\n${AnsiHelpers.green('✓')} Steering rules configured and saved to BOOTSTRAP-CONFIG.json\n`)
  console.log('────────────────────────────────────────────────────────\n')

  const settingsPath = join(cwd, '.harness-kit', 'settings.json')
  if (!existsSync(settingsPath)) {
    const createSettings = await confirm({
      message: 'A local settings.json file was not found. Do you want to create one now?',
      default: false
    })

    if (createSettings) {
      const { HarnessSettings } = await import('../../settings/HarnessSettings.js')
      const createdPath = HarnessSettings.createLocalSettings(cwd)
      console.log(`${AnsiHelpers.green('✓')} Local settings.json created at ${createdPath}\n`)
    }
  }

  // 4. Launch prompt
  const launch = await confirm({
    message: 'Initialization complete! Do you want to run `hrns run` now?',
    default: true
  })

  if (launch) {
    // Dynamically import to avoid circular dependencies and only load when needed
    const { cmdRun } = await import('./run-service.js')
    const runArgs = [...args.filter(arg => arg !== '--resume'), '--reset']
    await cmdRun(cwd, runArgs, true)
  } else {
    console.log(`\nAll set! Run ${AnsiHelpers.cyan('hrns run')} when you're ready to start.`)
  }
}
