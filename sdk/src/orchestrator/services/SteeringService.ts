import { Phase } from '../types'
import type { OrchestratorState } from '../types'
import type { IFileStateManager } from '../../file-state/FileStateManager'
import { createDefaultSteeringRules, Feature } from '../../file-state/types'
import type { SteeringAction } from '../SteeringAnalyzer'

export class SteeringService {
  private fsm: IFileStateManager
  private state: OrchestratorState

  constructor(fsm: IFileStateManager, state: OrchestratorState) {
    this.fsm = fsm
    this.state = state
  }

  public applySteeringActions(actions: SteeringAction[]): void {
    const config = this.fsm.loadBootstrapConfig()
    if (!config.steeringRules) {
      config.steeringRules = createDefaultSteeringRules()
    }
    if (!config.steeringRules.user) {
      config.steeringRules.user = []
    }
    for (const action of actions) {
      if (action.type === 'add_rule') {
        this._handleAddRule(config, action)
      } else if (action.type === 'rollback') {
        this._handleRollback(config, action)
      } else if (action.type === 'override_score') {
        this._handleOverrideScore(action)
      }
    }
    this.fsm.saveBootstrapConfig(config)
  }

  private _handleAddRule(config: any, action: { type: 'add_rule'; rule: string }): void {
    config.steeringRules.user.push(action.rule)
    this.fsm.appendDecision({
      featureId: null,
      decision: `Steering override: Added development rule: "${action.rule}"`
    })
  }

  private _handleRollback(config: any, action: { type: 'rollback'; targetPhase: string }): void {
    const target = action.targetPhase as Phase
    this.state.currentPhase = target
    config.currentPhase = target
    this.fsm.appendDecision({
      featureId: null,
      decision: `Steering override: State rollback to phase ${target}`
    })
    if (target === Phase.DEVELOPMENT || target === Phase.PLANNING) {
      const features = this.fsm.loadBacklog()
      const active = this.getActiveFeature(features)
      if (active) {
        const tasks = this.fsm.loadDevelopmentState()
        for (const t of tasks) {
          if (t.featureId === active.id) {
            this.fsm.updateTaskStatus(active.id, t.taskId, '-', 'NOT_STARTED')
          }
        }
      }
    }
  }

  private _handleOverrideScore(action: { type: 'override_score'; tl?: number; adv?: number }): void {
    const features = this.fsm.loadBacklog()
    const active = this.getActiveFeature(features)
    if (active) {
      this.fsm.updateFeatureStatus(
        active.id,
        active.status,
        {
          tl: action.tl ?? active.scoreTL ?? 100,
          adv: action.adv ?? active.scoreAdv ?? 100
        }
      )
      this.fsm.appendDecision({
        featureId: active.id,
        decision: `Steering override: Manual QA scores set to (TL: ${action.tl}, ADV: ${action.adv})`
      })
    }
  }

  private getActiveFeature(features: Feature[]): Feature | null {
    // If we have an activeFeatureId, use it
    if (this.state.activeFeatureId) {
      const found = features.find(f => f.id === this.state.activeFeatureId)
      if (found) return found
    }
    // Otherwise pick first NOT_STARTED or IN_PROGRESS
    return features.find(f => f.status === 'NOT_STARTED' || f.status === 'IN_PROGRESS') ?? null
  }
}
