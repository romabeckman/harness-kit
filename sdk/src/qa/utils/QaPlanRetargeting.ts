import type { QaPlan } from '../types'

/** Copies a plan onto a new runtime target while preserving URLs outside its previous origin. */
export function retargetQaPlan(plan: QaPlan, target: string): QaPlan {
  return {
    ...plan,
    target,
    scenarios: plan.scenarios.map((scenario) => ({
      ...scenario,
      actions: scenario.actions?.map((action) => action.type === 'navigate' && action.value
        ? { ...action, value: retargetSameOriginUrl(action.value, plan.target, target) }
        : action),
      assertions: scenario.assertions?.map((assertion) => assertion.type === 'url' && assertion.value
        ? { ...assertion, value: retargetSameOriginUrl(assertion.value, plan.target, target) }
        : assertion),
    })),
  }
}

function retargetSameOriginUrl(value: string, previousTarget: string, target: string): string {
  try {
    const previous = new URL(previousTarget)
    const requested = new URL(value, previous)
    if (requested.origin !== previous.origin) return value
    const next = new URL(target)
    if (requested.pathname === '/' && !requested.search && !requested.hash) return target
    return new URL(`${requested.pathname}${requested.search}${requested.hash}`, next).toString()
  } catch {
    return value
  }
}
