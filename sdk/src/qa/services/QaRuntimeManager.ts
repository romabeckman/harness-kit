import { createReadStream, existsSync, realpathSync, statSync } from 'node:fs'
import { createServer, type ServerResponse } from 'node:http'
import { extname, isAbsolute, relative, resolve } from 'node:path'
import type { QaAgenticRequest } from '../types'

export interface QaRuntimeHandle {
  target: string
  managed: boolean
  stop(): Promise<void>
}

export interface QaRuntimePreparer {
  prepare(request: QaAgenticRequest, signal?: AbortSignal): Promise<QaRuntimeHandle | undefined>
}

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.wasm': 'application/wasm',
}

export class QaRuntimeManager implements QaRuntimePreparer {
  readonly #workspace: string

  constructor(workspace: string) {
    this.#workspace = resolve(workspace)
  }

  async prepare(request: QaAgenticRequest, signal?: AbortSignal): Promise<QaRuntimeHandle | undefined> {
    if (request.target) return { target: request.target, managed: false, stop: async () => undefined }
    if (!existsSync(resolve(this.#workspace, 'index.html'))) return undefined
    if (signal?.aborted) throw signal.reason ?? new Error('QA runtime preparation aborted')

    const server = createServer((incoming, response) => this.serve(incoming.url ?? '/', incoming.method, response))
    await new Promise<void>((resolveStarted, reject) => {
      server.once('error', reject)
      server.listen(0, '127.0.0.1', () => {
        server.removeListener('error', reject)
        resolveStarted()
      })
    })
    const address = server.address()
    if (!address || typeof address === 'string') {
      await closeServer(server)
      throw new Error('Static QA runtime did not expose a TCP port')
    }
    return {
      target: `http://127.0.0.1:${address.port}`,
      managed: true,
      stop: () => closeServer(server),
    }
  }

  private serve(url: string, method: string | undefined, response: ServerResponse): void {
    try {
      const pathname = decodeURIComponent(new URL(url, 'http://127.0.0.1').pathname)
      if (pathname.split('/').some((segment) => segment.startsWith('.'))) return this.end(response, 404, 'Not found')
      let filePath = resolve(this.#workspace, `.${pathname}`)
      const routed = relative(this.#workspace, filePath)
      if (routed.startsWith('..') || isAbsolute(routed)) return this.end(response, 403, 'Forbidden')
      if (existsSync(filePath) && statSync(filePath).isDirectory()) filePath = resolve(filePath, 'index.html')
      if (!existsSync(filePath) || !statSync(filePath).isFile()) return this.end(response, 404, 'Not found')
      filePath = realpathSync(filePath)
      const physicalRoute = relative(realpathSync(this.#workspace), filePath)
      if (physicalRoute.startsWith('..') || isAbsolute(physicalRoute)) return this.end(response, 404, 'Not found')
      const ext = extname(filePath).toLowerCase()
      const contentType = CONTENT_TYPES[ext]
      if (!contentType) return this.end(response, 403, 'Forbidden')
      response.statusCode = 200
      response.setHeader('content-type', contentType)
      if (method === 'HEAD') {
        response.end()
        return
      }
      createReadStream(filePath).on('error', () => this.end(response, 500, 'Read failed')).pipe(response)
    } catch {
      this.end(response, 400, 'Bad request')
    }
  }

  private end(response: ServerResponse, status: number, message: string): void {
    if (response.headersSent) {
      response.destroy()
      return
    }
    response.statusCode = status
    response.end(message)
  }
}

function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  if (!server.listening) return Promise.resolve()
  return new Promise((resolveClosed, reject) => server.close((error) => error ? reject(error) : resolveClosed()))
}
