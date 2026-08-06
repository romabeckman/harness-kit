import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { HttpServerError, OrchestrationJob, HttpServerConfig } from '../../domain/types'
import type { JobStoreRepository } from '../../adapters/outbound/repository/JobStoreRepository'
import type { JobQueue } from '../../adapters/outbound/queue/JobQueue'
import type { RunRequestDtoExtended } from '../../adapters/inbound/http/dto/RunRequestDto'
import type { RunResponseDto } from '../../adapters/inbound/http/dto/RunResponseDto'
import { DtoMappers } from '../../adapters/inbound/http/mappers/DtoMappers'

export class RunOrchestratorJobUseCase {
  constructor(
    private jobStore: JobStoreRepository,
    private jobQueue: JobQueue,
    private config?: HttpServerConfig
  ) {}

  async execute(body: RunRequestDtoExtended): Promise<RunResponseDto> {
    // Validate non-interactive mode rules (throws 400 Bad Request if refine: true or mode: deep_thinking)
    DtoMappers.toOrchestratorConfig(body)

    // Resolve project alias / workspace path
    const workspacePath = DtoMappers.resolveWorkspacePath(body)

    // Validate path traversal & workspace permissions
    this.validatePathTraversal(body.projectPaths, workspacePath)

    const jobId = randomUUID()
    const createdAt = new Date().toISOString()

    const job: OrchestrationJob = {
      jobId,
      status: 'queued',
      workspacePath,
      request: body,
      createdAt,
    }

    await this.jobStore.save(job)
    this.jobQueue.enqueue(job)

    return {
      jobId,
      status: 'queued',
      workspacePath,
      enqueuedAt: createdAt,
      statusUrl: `/orchestrator/status/${jobId}`,
    }
  }

  private validatePathTraversal(projectPaths?: string[], resolvedWorkspacePath?: string): void {
    const allowedWorkspaces = this.config?.allowedWorkspaces

    if (projectPaths && projectPaths.length > 0) {
      for (const p of projectPaths) {
        if (typeof p !== 'string') continue
        if (p.includes('..')) {
          throw new HttpServerError(
            400,
            'PATH_TRAVERSAL_DETECTED',
            `Path traversal detected in projectPath: '${p}'`
          )
        }
      }
    }

    if (allowedWorkspaces && allowedWorkspaces.length > 0 && resolvedWorkspacePath) {
      const isAllowed = allowedWorkspaces.some((allowed) => {
        const resolvedAllowed = resolve(process.cwd(), allowed)
        return (
          resolvedWorkspacePath === resolvedAllowed ||
          resolvedWorkspacePath.startsWith(resolvedAllowed + '/') ||
          resolvedWorkspacePath.startsWith(resolvedAllowed + '\\')
        )
      })

      if (!isAllowed) {
        throw new HttpServerError(
          400,
          'WORKSPACE_NOT_ALLOWED',
          `Workspace path '${resolvedWorkspacePath}' is outside allowed workspaces.`
        )
      }
    }
  }
}
