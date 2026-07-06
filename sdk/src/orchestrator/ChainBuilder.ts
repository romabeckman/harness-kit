import {
  IPhaseHandler,
  BootstrapHandler,
  PhaseAHandler,
  PhaseBHandler,
  PhaseCHandler,
  PhaseDHandler,
  PhaseEHandler,
  PhaseFHandler,
  CascadeBlockedHandler,
} from './phases'

export class ChainBuilder {
  private handlersPhaseA: IPhaseHandler[] = []
  private handlersPhaseB: IPhaseHandler[] = []
  private handlersPhaseC: IPhaseHandler[] = []
  private handlersPhaseD: IPhaseHandler[] = []
  private handlersPhaseE: IPhaseHandler[] = []
  private handlersPhaseF: IPhaseHandler[] = []
  private handlersCascadeBlocked: IPhaseHandler[] = []

  addPhaseA(phase: IPhaseHandler): this {
    this.handlersPhaseA.push(phase)
    return this
  }

  addPhaseB(phase: IPhaseHandler): this {
    this.handlersPhaseB.push(phase)
    return this
  }

  addPhaseC(phase: IPhaseHandler): this {
    this.handlersPhaseC.push(phase)
    return this
  }

  addPhaseD(phase: IPhaseHandler): this {
    this.handlersPhaseD.push(phase)
    return this
  }

  addPhaseE(phase: IPhaseHandler): this {
    this.handlersPhaseE.push(phase)
    return this
  }

  addPhaseF(phase: IPhaseHandler): this {
    this.handlersPhaseF.push(phase)
    return this
  }

  addCascadeBlocked(phase: IPhaseHandler): this {
    this.handlersCascadeBlocked.push(phase)
    return this
  }

  build(): IPhaseHandler {
    const bootstrap = new BootstrapHandler()
    let tail: IPhaseHandler = bootstrap
    const ordered = [
      ...this.handlersPhaseA,
      ...this.handlersPhaseB,
      ...this.handlersPhaseC,
      ...this.handlersPhaseD,
      ...this.handlersPhaseE,
      ...this.handlersPhaseF,
      ...this.handlersCascadeBlocked,
    ]
    for (const handler of ordered) {
      tail = tail.setNext(handler)
    }
    return bootstrap
  }

  static buildDefault(): IPhaseHandler {
    return new ChainBuilder()
      .addPhaseA(new PhaseAHandler())
      .addPhaseB(new PhaseBHandler())
      .addPhaseC(new PhaseCHandler())
      .addPhaseD(new PhaseDHandler())
      .addPhaseE(new PhaseEHandler())
      .addPhaseF(new PhaseFHandler())
      .addCascadeBlocked(new CascadeBlockedHandler())
      .build()
  }
}
