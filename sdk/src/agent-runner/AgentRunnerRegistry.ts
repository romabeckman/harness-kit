import type { IAgentRunner } from './IAgentRunner'

export interface RunnerRegistration {
  readonly type: string
  readonly constructor: new (config: any) => IAgentRunner
  readonly validateConfig?: (config: any) => void
}

export class AgentRunnerRegistry {
  private static readonly registrations = new Map<string, RunnerRegistration>()

  static register(registration: RunnerRegistration): void {
    if (this.registrations.has(registration.type)) {
      throw new Error(`Runner type "${registration.type}" is already registered.`)
    }
    this.registrations.set(registration.type, registration)
  }

  static get(type: string): RunnerRegistration | undefined {
    return this.registrations.get(type)
  }

  static has(type: string): boolean {
    return this.registrations.has(type)
  }

  static clear(): void {
    this.registrations.clear()
  }
}
