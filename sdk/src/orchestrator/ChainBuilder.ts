import {
  IPhaseHandler,
  BootstrapHandler,
  PhaseAHandler,
  PhaseBHandler,
  PhaseCHandler,
  PhaseDHandler,
  PhaseEHandler,
  PhaseFHandler,
  PhaseGHandler,
  CascadeBlockedHandler,
} from './phases'

export class ChainBuilder {
  private handlersPhases: IPhaseHandler[] = []

  addPhase(phase: IPhaseHandler): this {
    this.handlersPhases.push(phase)
    return this
  }

  build(): IPhaseHandler {
    const bootstrap = new BootstrapHandler()
    let tail: IPhaseHandler = bootstrap
    const ordered = this.handlersPhases
    for (const handler of ordered) {
      tail = tail.setNext(handler)
    }
    return bootstrap
  }

  static buildDefault(): IPhaseHandler {
    return new ChainBuilder()
      .addPhase(new PhaseAHandler())
      .addPhase(new PhaseBHandler())
      .addPhase(new PhaseCHandler())
      .addPhase(new PhaseDHandler())
      .addPhase(new PhaseEHandler())
      .addPhase(new PhaseFHandler())
      .addPhase(new PhaseGHandler())
      .addPhase(new CascadeBlockedHandler())
      .build()
  }
}
