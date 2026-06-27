import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { join } from 'node:path'
import { writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { FileStateManager } from '../../src/file-state/FileStateManager'

describe('FileStateSteering', () => {
  const tmpDir = join(__dirname, 'tmp-steering-test')

  beforeEach(() => {
    mkdirSync(tmpDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true })
  })

  it('defaults steeringRules to empty array if missing from config json', () => {
    const fsm = new FileStateManager({ workingDir: tmpDir, productDir: tmpDir })
    
    // Write bootstrap config without steeringRules key
    const configPath = join(tmpDir, 'BOOTSTRAP-CONFIG.json')
    writeFileSync(configPath, JSON.stringify({
      scoreThresholds: {
        theGrumpyTechLead: { threshold: 80 },
        adversarialQA: { threshold: 80 }
      },
      completionCriteria: { maxReworks: 3 },
      currentPhase: 'BOOTSTRAP',
      cycleCounter: { completedCycles: 0 }
    }))

    const config = fsm.loadBootstrapConfig()
    expect(config.steeringRules).toBeDefined()
    expect(config.steeringRules).toEqual([])
  })

  it('loads existing steeringRules from config json successfully', () => {
    const fsm = new FileStateManager({ workingDir: tmpDir, productDir: tmpDir })
    
    const configPath = join(tmpDir, 'BOOTSTRAP-CONFIG.json')
    writeFileSync(configPath, JSON.stringify({
      scoreThresholds: {
        theGrumpyTechLead: { threshold: 80 },
        adversarialQA: { threshold: 80 }
      },
      completionCriteria: { maxReworks: 3 },
      currentPhase: 'BOOTSTRAP',
      cycleCounter: { completedCycles: 0 },
      steeringRules: ['rule1', 'rule2']
    }))

    const config = fsm.loadBootstrapConfig()
    expect(config.steeringRules).toEqual(['rule1', 'rule2'])
  })
})
