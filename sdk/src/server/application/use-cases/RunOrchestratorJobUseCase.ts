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
    // Validate non-interactive mode rules & project requirement (throws 400 Bad Request if invalid)
    const orchestratorConfig = DtoMappers.toOrchestratorConfig(body)

    // Resolve project workspace paths
    const workspacePaths = orchestratorConfig.projectPaths
    const workspacePath = workspacePaths[0]

    // Validate path traversal & workspace permissions
    this.validatePathTraversal(body.project, workspacePaths)

    // Check idempotencyKey uniqueness
    if (body.idempotencyKey) {
      const existingJob = await this.jobStore.findByIdempotencyKey(body.idempotencyKey)
      if (existingJob) {
        throw new HttpServerError(
          409,
          'DUPLICATE_IDEMPOTENCY_KEY',
          `Duplicate idempotencyKey '${body.idempotencyKey}'. Job already exists with ID: ${existingJob.jobId}`
        )
      }
    }

    const jobId = randomUUID()
    const createdAt = new Date().toISOString()

    const job: OrchestrationJob = {
      jobId,
      idempotencyKey: body.idempotencyKey,
      status: 'queued',
      workspacePath,
      request: { ...body, action: 'reset' },
      createdAt,
    }

    await this.jobStore.save(job)
    this.jobQueue.enqueue(job)

    return {
      jobId,
      status: 'queued',
      enqueuedAt: createdAt,
      statusUrl: `/orchestrator/status/${jobId}`,
    }
  }

  private validatePathTraversal(
    projects?: string | string[],
    resolvedWorkspacePaths?: string[]
  ): void {
    const projectList = typeof projects === 'string'
      ? [projects]
      : (Array.isArray(projects) ? projects : [])

    for (const p of projectList) {
      if (typeof p === 'string' && p.includes('..')) {
        throw new HttpServerError(
          400,
          'PATH_TRAVERSAL_DETECTED',
          `Path traversal detected in project parameter: '${p}'`
        )
      }
    }

    if (resolvedWorkspacePaths && resolvedWorkspacePaths.length > 0) {
      for (const wp of resolvedWorkspacePaths) {
        if (wp.includes('..')) {
          throw new HttpServerError(
            400,
            'PATH_TRAVERSAL_DETECTED',
            `Path traversal detected in resolved workspace path: '${wp}'`
          )
        }
      }
    }

    const allowedWorkspaces = this.config?.allowedWorkspaces

    if (allowedWorkspaces && allowedWorkspaces.length > 0 && resolvedWorkspacePaths) {
      for (const resolvedWorkspacePath of resolvedWorkspacePaths) {
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
}
