import { homedir } from 'os'
import { join, dirname } from 'path'
import { existsSync, writeFileSync, mkdirSync, readFileSync } from 'fs'
import type { HarnessSettingsMap, PhaseSettings } from './SettingsSchema'
import { DEFAULT_SETTINGS } from './DefaultSettings'

export class HarnessSettings {
  private constructor(private readonly settings: HarnessSettingsMap) { }

  static getGlobalSettingsPath(): string {
    if (process.env.HARNESS_SETTINGS_PATH) {
      return process.env.HARNESS_SETTINGS_PATH
    }

    if (process.env.XDG_CONFIG_HOME) {
      return join(process.env.XDG_CONFIG_HOME, 'harness-kit', 'settings.json')
    }

    return join(homedir(), '.config', 'harness-kit', 'settings.json')
  }

  static load(projectPath?: string): HarnessSettings {
    const globalPath = this.getGlobalSettingsPath()

    // Auto-create global settings if not existing
    if (!existsSync(globalPath)) {
      try {
        mkdirSync(dirname(globalPath), { recursive: true })
        writeFileSync(globalPath, JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf-8')
      } catch (err: any) {
        // If another process/test created it concurrently, ignore the error
        if (!existsSync(globalPath)) {
          throw new Error(`Não foi possível criar o arquivo de configurações em ${globalPath}. Crie-o manualmente. Erro: ${err.message || err}`)
        }
      }
    }

    let mergedSettings: HarnessSettingsMap = { ...DEFAULT_SETTINGS }

    // Read global settings
    if (existsSync(globalPath)) {
      try {
        const globalContent = readFileSync(globalPath, 'utf-8')
        const globalData = JSON.parse(globalContent) as HarnessSettingsMap
        mergedSettings = this.mergeMaps(mergedSettings, globalData)
      } catch (err) {
        console.warn(`Warning: Failed to parse global settings at ${globalPath}`, err)
      }
    }

    // Read project settings if path provided
    if (projectPath) {
      const projectPathFile = join(projectPath, '.harness-kit', 'settings.json')
      if (existsSync(projectPathFile)) {
        try {
          const projectContent = readFileSync(projectPathFile, 'utf-8')
          const projectData = JSON.parse(projectContent) as HarnessSettingsMap
          mergedSettings = this.mergeMaps(mergedSettings, projectData)
        } catch (err) {
          console.warn(`Warning: Failed to parse project settings at ${projectPathFile}`, err)
        }
      }
    }

    return new HarnessSettings(mergedSettings)
  }

  hasSettings(runnerType: string): boolean {
    return this.settings[runnerType] !== undefined
  }

  resolve(runnerType: string, phaseKey: string): PhaseSettings {
    const runner = this.settings[runnerType]
    if (!runner || !runner.phases) return {}
    return runner.phases[phaseKey] ?? {}
  }

  getTimeoutMs(runnerType: string, phaseKey?: string): number | undefined {
    const runner = this.settings[runnerType]
    if (!runner) return undefined

    if (phaseKey && runner.phases && runner.phases[phaseKey]) {
      const phaseTimeout = runner.phases[phaseKey].timeoutMs
      if (phaseTimeout !== undefined) {
        return phaseTimeout
      }
    }

    return runner.timeoutMs
  }

  private static mergeMaps(base: HarnessSettingsMap, override: HarnessSettingsMap): HarnessSettingsMap {
    const result: HarnessSettingsMap = {}

    // Get all unique runner keys
    const runners = new Set([...Object.keys(base), ...Object.keys(override)])

    for (const runner of runners) {
      const baseRunner = base[runner] ?? {}
      const overrideRunner = override[runner] ?? {}

      const basePhases = baseRunner.phases ?? {}
      const overridePhases = overrideRunner.phases ?? {}

      const mergedPhases: Record<string, PhaseSettings> = {}
      const phases = new Set([...Object.keys(basePhases), ...Object.keys(overridePhases)])

      for (const phase of phases) {
        mergedPhases[phase] = {
          ...(basePhases[phase] ?? {}),
          ...(overridePhases[phase] ?? {})
        }
      }

      result[runner] = {
        timeoutMs: overrideRunner.timeoutMs !== undefined ? overrideRunner.timeoutMs : baseRunner.timeoutMs,
        phases: mergedPhases
      }
    }

    return result
  }
}
