import { HttpServer } from './HttpServer'
import type { HttpServerConfig } from './types'

export { HttpServer }
export { HttpServerError } from './types'
export type {
  HttpServerConfig,
  HealthStatusVo,
  OpenApiSpec,
  OrchestrationJob,
  JobStatus,
} from './types'

export type { RunRequestDto, RunRequestDtoExtended } from './dto/RunRequestDto'
export type { RunResponseDto } from './dto/RunResponseDto'
export type { JobStatusDto } from './dto/JobStatusDto'

export async function startHttpServer(options: HttpServerConfig = {}): Promise<HttpServer> {
  const server = new HttpServer(options)
  await server.start()
  return server
}

if (require.main === module) {
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000
  const host = process.env.HOST ?? '0.0.0.0'
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
