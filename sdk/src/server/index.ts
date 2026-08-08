import { HttpServer } from './HttpServer'
import type { HttpServerConfig } from './domain/types'

export { HttpServer }
export * from './domain/types'

export type { RunRequestDto, RunRequestDtoExtended } from './adapters/inbound/http/dto/RunRequestDto'
export type { RunResponseDto } from './adapters/inbound/http/dto/RunResponseDto'
export type { JobStatusDto } from './adapters/inbound/http/dto/JobStatusDto'

export * from './application/ports/inbound'
export * from './application/ports/outbound'
export * from './application/use-cases'
export * from './adapters/outbound/auth'
export * from './adapters'

export async function startHttpServer(options: HttpServerConfig = {}): Promise<HttpServer> {
  const server = new HttpServer(options)
  await server.start()
  return server
}

if (require.main === module) {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000
  const host = process.env.HOST ?? '127.0.0.1'
  const server = new HttpServer({ port, host })
  server
    .start()
    .then(() => {
      console.log(`[HRNS] Server started on http://${host}:${server.getPort()}`)
    })
    .catch((err) => {
      console.error('[HRNS] Failed to start server:', err)
      process.exit(1)
    })
}
