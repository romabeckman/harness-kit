import { createServer, Server, IncomingMessage, ServerResponse } from 'node:http'
import type { Socket } from 'node:net'
import {
  InMemoryJobStore,
  WorkspaceLockManager,
  JobQueue,
  JobRunnerService,
  RouteHandlers,
} from './adapters'
import type { HttpServerConfig } from './domain/types'

export class HttpServer {
  private jobStore: InMemoryJobStore
  private lockManager: WorkspaceLockManager
  private jobQueue: JobQueue
  private jobRunnerService: JobRunnerService
  private routeHandlers: RouteHandlers
  private server: Server
  private port: number
  private host: string
  private openSockets = new Set<Socket>()
  private sigtermListener?: () => void
  private sigintListener?: () => void
  private isListening = false

  constructor(config: HttpServerConfig = {}) {
    this.port = config.port ?? 3000
    this.host = config.host ?? '127.0.0.1'

    this.jobStore = new InMemoryJobStore()
    this.lockManager = new WorkspaceLockManager()
    this.jobQueue = new JobQueue()
    this.jobRunnerService = new JobRunnerService({
      jobStore: this.jobStore,
      lockManager: this.lockManager,
      jobQueue: this.jobQueue,
    })

    const allowedWorkspaces = config.allowedWorkspaces ?? (
      process.env.ALLOWED_WORKSPACES
        ? process.env.ALLOWED_WORKSPACES.split(',').map((p) => p.trim()).filter(Boolean)
        : process.env.GIT_REPOSITORIES
          ? process.env.GIT_REPOSITORIES.split(',').map((p) => p.trim()).filter(Boolean)
          : undefined
    )

    const routeConfig: HttpServerConfig = {
      port: this.port,
      host: this.host,
      allowedWorkspaces,
      auth: config.auth,
    }

    this.routeHandlers = new RouteHandlers(
      this.jobStore,
      this.jobQueue,
      this.lockManager,
      routeConfig
    )

    this.server = createServer((req: IncomingMessage, res: ServerResponse) => {
      this.routeHandlers.handleRequest(req, res)
    })

    this.server.on('connection', (socket: Socket) => {
      this.openSockets.add(socket)
      socket.on('close', () => {
        this.openSockets.delete(socket)
      })
    })
  }

  getJobStore(): InMemoryJobStore {
    return this.jobStore
  }

  getLockManager(): WorkspaceLockManager {
    return this.lockManager
  }

  getJobQueue(): JobQueue {
    return this.jobQueue
  }

  getRunnerService(): JobRunnerService {
    return this.jobRunnerService
  }

  getPort(): number {
    return this.port
  }

  async start(): Promise<void> {
    if (this.isListening) return

    return new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => {
        this.server.removeListener('listening', onListening)
        reject(err)
      }

      const onListening = () => {
        this.server.removeListener('error', onError)
        this.isListening = true
        const addr = this.server.address()
        if (addr && typeof addr === 'object') {
          this.port = addr.port
        }
        this.jobRunnerService.startWorkerLoop()
        this.setupSignalHandlers()
        resolve()
      }

      this.server.once('error', onError)
      this.server.once('listening', onListening)
      this.server.listen(this.port, this.host)
    })
  }

  async stop(): Promise<void> {
    this.removeSignalHandlers()
    this.jobRunnerService.stopWorkerLoop()

    for (const socket of this.openSockets) {
      socket.destroy()
    }
    this.openSockets.clear()

    if (this.isListening || this.server.listening) {
      await new Promise<void>((resolve, reject) => {
        this.server.close((err) => {
          this.isListening = false
          if (err) {
            if ((err as any).code === 'ERR_SERVER_NOT_RUNNING') {
              resolve()
            } else {
              reject(err)
            }
          } else {
            resolve()
          }
        })
      })
    }
  }

  private setupSignalHandlers(): void {
    this.sigtermListener = () => {
      void this.stop()
    }
    this.sigintListener = () => {
      void this.stop()
    }
    process.once('SIGTERM', this.sigtermListener)
    process.once('SIGINT', this.sigintListener)
  }

  private removeSignalHandlers(): void {
    if (this.sigtermListener) {
      process.removeListener('SIGTERM', this.sigtermListener)
      this.sigtermListener = undefined
    }
    if (this.sigintListener) {
      process.removeListener('SIGINT', this.sigintListener)
      this.sigintListener = undefined
    }
  }
}
