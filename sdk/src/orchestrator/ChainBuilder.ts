import {
  IPhaseHandler,
  BootstrapHandler,
  RefinementHandler,
  PlanningHandler,
  DevelopmentHandler,
  ReviewHandler,
  MemoryHandler,
  TransitionHandler,
  DeployHandler,
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
      .addPhase(new RefinementHandler())
      .addPhase(new PlanningHandler())
      .addPhase(new DevelopmentHandler())
      .addPhase(new ReviewHandler())
      .addPhase(new TransitionHandler())
      .addPhase(new MemoryHandler())
      .addPhase(new DeployHandler())
      .addPhase(new CascadeBlockedHandler())
      .build()
  }
}
