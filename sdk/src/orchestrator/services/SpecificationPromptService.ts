import { join } from 'node:path'
import type { IAgentRunner } from '../../agent-runner/IAgentRunner'
import type { DomainSpecs } from '../../context-assembler/types'
import { inlineOrReference } from '../utils/PromptHelpers'

export class SpecificationPromptService {
  renderSpecificationSections(specsDir: string, specs?: DomainSpecs, runner?: IAgentRunner) {
    return {
      problemSpaceSection: inlineOrReference('problem_space', specs?.problemSpace, join(specsDir, '001-problem-space.md'), 'markdown', 'never', runner),
      contextMapSection: inlineOrReference('context_map', specs?.contextMap, join(specsDir, '002-context-map.md'), 'markdown', 'never', runner),
      tacticalDesignSection: inlineOrReference('tactical_design', specs?.tacticalDesign, join(specsDir, '003-*-tactical-design.md'), 'markdown', 'always', runner),
      testScenariosSection: inlineOrReference('test_scenarios', specs?.testScenarios, join(specsDir, '004-*-test-scenarios.md'), 'markdown', 'always', runner),
    }
  }
}
