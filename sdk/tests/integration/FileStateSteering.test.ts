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
    expect(config.steeringRules).toEqual({
      user: [],
      bootstrap: [],
      phase_a: ['Minimal of 1 and maximal of 10 tasks for each feature in `BACKLOG.md`'],
      phase_b: [
        "If exist, read `docs/specs/${domain}/TL.json` and `docs/specs/${domain}/QA.json` for fixes details"
      ],
      phase_c: [
        "If you are running as `harness-code-reviewer` you MUST write (overwrite) your review json in a file `docs/specs/${domain}/TL.json`",
        "If you are running as `harness-qa` you MUST write (overwrite) your review json in a file `docs/specs/${domain}/QA.json`"
      ],
      phase_e: []
    })
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
    expect(config.steeringRules).toEqual({
      user: ['rule1', 'rule2'],
      bootstrap: [],
      phase_a: ['Minimal of 1 and maximal of 10 tasks for each feature in `BACKLOG.md`'],
      phase_b: [
        "If exist, read `docs/specs/${domain}/TL.json` and `docs/specs/${domain}/QA.json` for fixes details"
      ],
      phase_c: [
        "If you are running as `harness-code-reviewer` you MUST write (overwrite) your review json in a file `docs/specs/${domain}/TL.json`",
        "If you are running as `harness-qa` you MUST write (overwrite) your review json in a file `docs/specs/${domain}/QA.json`"
      ],
      phase_e: []
    })
  })
})
