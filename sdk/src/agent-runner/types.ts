export interface AgentInvocation {
  skill: string
  agent: string
  mode: 'autonomous'
  payload: ContextPayload
}

export interface AgentOutput {
  raw: string
  artefacts?: Record<string, string>
}

export type ContextPayload = Record<string, unknown>
