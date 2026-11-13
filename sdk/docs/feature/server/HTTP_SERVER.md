---
doc_type: feature
domain: server
stack: [TypeScript, Node.js, Docker]
node_id: "feature:http_server"
tags: [server, http, api, docker, openapi]
edges:
  - relation: implements
    target: "adr:architecture"
  - relation: tested_by
    target: "adr:tests"
  - relation: depends_on
    target: "feature:sdk_core"
updated: 2026-09-30
---
```graph
{"node_id":"feature:http_server","domain":"server","implements":["adr:architecture"],"tested_by":["adr:tests"],"depends_on":["feature:sdk_core"],"entrypoints":["src/server/index.ts","src/server/HttpServer.ts"],"registration_files":["src/server/adapters/index.ts","src/server/application/use-cases/index.ts","src/server/adapters/outbound/auth/AuthStrategyFactory.ts"],"reference_files":["src/server/adapters/inbound/http/routes/RouteHandlers.ts"],"code_files":["src/server/types.ts","src/server/domain/types.ts","src/server/application/ports/inbound/IRunOrchestratorJobUseCase.ts","src/server/application/ports/inbound/IGetJobStatusUseCase.ts","src/server/application/ports/inbound/IResumeOrchestratorJobUseCase.ts","src/server/application/ports/inbound/ICleanJobsAndWorktreesUseCase.ts","src/server/application/ports/inbound/IGetHealthStatusUseCase.ts","src/server/application/ports/inbound/IGetSettingsUseCase.ts","src/server/application/ports/inbound/IUpdateSettingsUseCase.ts","src/server/application/use-cases/RunOrchestratorJobUseCase.ts","src/server/application/use-cases/GetJobStatusUseCase.ts","src/server/application/use-cases/ResumeOrchestratorJobUseCase.ts","src/server/application/use-cases/CleanJobsAndWorktreesUseCase.ts","src/server/application/use-cases/GetHealthStatusUseCase.ts","src/server/application/use-cases/GetOpenApiDocsUseCase.ts","src/server/application/use-cases/GetSettingsUseCase.ts","src/server/application/use-cases/UpdateSettingsUseCase.ts","src/server/application/use-cases/SyncWorkspaceRepositoryUseCase.ts","src/server/adapters/outbound/auth/NoAuthStrategy.ts","src/server/adapters/outbound/auth/BasicAuthStrategy.ts","src/server/adapters/outbound/auth/BearerAuthStrategy.ts","src/server/adapters/outbound/auth/JwtAuthStrategy.ts","src/server/adapters/outbound/auth/HmacAuthStrategy.ts","src/server/application/ports/inbound/IGetReportsSummaryUseCase.ts","src/server/application/ports/inbound/IGetTokensTelemetryUseCase.ts","src/server/application/ports/inbound/index.ts","src/server/application/ports/outbound/index.ts","src/server/application/use-cases/GetReportsSummaryUseCase.ts","src/server/application/use-cases/GetTokensTelemetryUseCase.ts","src/server/adapters/inbound/http/docs/OpenApiSpecGenerator.ts","src/server/adapters/inbound/http/mappers/DtoMappers.ts","src/server/adapters/inbound/http/dto/JobStatusDto.ts","src/server/adapters/inbound/http/dto/ReportsSummaryDto.ts","src/server/adapters/inbound/http/dto/RunRequestDto.ts","src/server/adapters/inbound/http/dto/RunResponseDto.ts","src/server/adapters/inbound/http/dto/TokensTelemetryDto.ts","src/server/adapters/outbound/auth/index.ts","src/server/adapters/outbound/auth/types.ts","src/server/adapters/outbound/mutex/LockRepository.ts","src/server/adapters/outbound/mutex/WorkspaceLockManager.ts","src/server/adapters/outbound/queue/JobQueue.ts","src/server/adapters/outbound/repository/InMemoryJobStore.ts","src/server/adapters/outbound/repository/JobStoreRepository.ts","src/server/adapters/outbound/services/JobRunnerService.ts","src/server/adapters/outbound/services/AsyncWorkerPool.ts","docker/entrypoint.sh","Dockerfile","docker-compose.yml"],"test_files":["src/server/__tests__/types.test.ts","src/server/__tests__/HttpServer.test.ts","src/server/__tests__/DockerBuild.test.ts","src/server/adapters/outbound/services/__tests__/AsyncWorkerPool.test.ts","src/server/adapters/outbound/auth/__tests__/AuthStrategies.test.ts","src/server/application/use-cases/__tests__/GetJobStatusUseCase.test.ts","src/server/application/use-cases/__tests__/GetHealthStatusUseCase.test.ts","src/server/application/use-cases/__tests__/ResumeOrchestratorJobUseCase.test.ts","src/server/application/use-cases/__tests__/CleanJobsAndWorktreesUseCase.test.ts","src/server/application/use-cases/__tests__/RunOrchestratorJobUseCase.test.ts","src/server/application/use-cases/__tests__/GetReportsSummaryUseCase.test.ts","src/server/application/use-cases/__tests__/GetTokensTelemetryUseCase.test.ts","src/server/application/use-cases/__tests__/SettingsUseCases.test.ts","src/server/application/use-cases/__tests__/SyncWorkspaceRepositoryUseCase.test.ts","src/server/adapters/inbound/http/mappers/__tests__/DtoMappers.test.ts","src/server/adapters/inbound/http/docs/__tests__/OpenApiSpecGenerator.test.ts","src/server/adapters/inbound/http/routes/__tests__/RouteHandlers.test.ts","src/server/adapters/outbound/mutex/__tests__/WorkspaceLockManager.test.ts","src/server/adapters/outbound/repository/__tests__/InMemoryJobStore.test.ts","src/server/adapters/outbound/queue/__tests__/JobQueue.test.ts","src/server/adapters/outbound/services/__tests__/JobRunnerService.test.ts","tests/e2e/scenarios/07-http-server-daemon.test.ts"],"knowledge":{"schema_version":1,"entities":[{"id":"capability:http-job-api","type":"capability","label":"HTTP orchestration job API","definition":"Expose asynchronous orchestration job operations through HTTP routes backed by application use cases.","aliases":[]},{"id":"rule:http-request-protection","type":"rule","label":"HTTP request protection","definition":"Apply request rate limiting and authentication/authorization checks to protected orchestration operations.","aliases":[]},{"id":"rule:http-fast-mode","type":"rule","label":"HTTP fast mode","definition":"Fix HTTP jobs to fast mode; reject refinement and phase overrides.","aliases":[]}],"claims":[{"id":"claim:http-route-security","subject":"capability:http-job-api","relation":"constrained_by","object":"rule:http-request-protection","statement":"RouteHandlers applies per-client rate limiting before dispatch and authenticates and authorizes project access before the run endpoint invokes its use case.","kind":"observation","status":"supported","evidence":[{"kind":"code","source":"src/server/adapters/inbound/http/routes/RouteHandlers.ts","locator":"handleRequest, checkRateLimit, /orchestrator/run, authenticateAndAuthorize","snapshot":null}],"derived_from":[],"gap":null},{"id":"claim:http-fast-mode","subject":"capability:http-job-api","relation":"constrained_by","object":"rule:http-fast-mode","statement":"toOrchestratorConfig accepts omitted mode or fast only; rejects refine, enableRefinement, skipValidation and skipMemory; returns LOW complexity, refinement off, validation and memory on.","kind":"observation","status":"supported","evidence":[{"kind":"code","source":"src/server/adapters/inbound/http/mappers/DtoMappers.ts","locator":"toOrchestratorConfig: guards and returned fast configuration","snapshot":null}],"derived_from":[],"gap":null}]}}
```

# HTTP SERVER AND DOCKER ADAPTER
Expose jobs through a non-interactive HTTP daemon.

## OVERVIEW
Use `HttpServer` as an inbound adapter over application use cases. Resolve project workspaces and queue jobs.

## FOLDER STRUCTURE
<folder_structure>

```text
src/server/
├── domain/                  # Value types and errors
├── application/             # Ports and use cases
├── adapters/inbound/http/   # Routes, DTOs, mappers, and OpenAPI
├── adapters/outbound/       # Auth, locks, queue, jobs, and workers
└── HttpServer.ts            # Lifecycle and composition
```

</folder_structure>

## API ENDPOINTS

| Method | Path | Purpose |
|---|---|---|
| POST | `/orchestrator/run` | Enqueue job. |
| POST | `/orchestrator/jobs/{id}/resume` | Resume job. |
| GET | `/orchestrator/status/{id}` | Read job. |
| DELETE | `/orchestrator/jobs/clean` | Purge jobs and worktrees. |
| POST | `/orchestrator/sync`, `/orchestrator/webhook/sync` | Fetch base branch. |
| GET, POST | `/orchestrator/settings` | Manage settings. |
| GET | `/orchestrator/tokens`, `/orchestrator/telemetry/tokens` | Query telemetry. |
| GET | `/orchestrator/reports/summary` | Aggregate costs. |
| GET | `/health`, `/docs`, `/docs/openapi.json` | Read health or API docs. |

## REQUEST CONTRACT

REQUIRED: Send registered `project` and `agent`, unique `idempotencyKey`, and non-empty `scope`.
ALLOWED: Set `score` from 0.1 to 1, `reworks` from 1 to 10, and initial `steeringMessage`.
ALLOWED: Resume failed or aborted jobs with an optional `steeringMessage` only.
REQUIRED: Use `OpenApiSpecGenerator.ts` as endpoint contract source.
PROHIBITED: Send multiple projects, filesystem paths, `branch`, `baseBranch`, `useWorktree`, or `skipDeploy`.
REQUIRED: Use **fast** mode: refinement off, validation and memory on. Omit `mode` or send `"fast"`.
PROHIBITED: Send another `mode`, `refine`, `enableRefinement`, `skipValidation`, or `skipMemory`; return HTTP 400 before queueing.

## CONFIGURATION

| Name | Purpose | Default |
|---|---|---|
| `port`, `host` | Listener binding | `3000`, `0.0.0.0` |
| `allowedWorkspaces` | Workspace allowlist | `[]` |
| `auth` | No-auth, Basic, Bearer, JWT, or HMAC | No auth |
| `maxConcurrency` | Concurrent jobs | `4` |
| `PROJECT_MAPPINGS` | Project, workspace, and Git mapping | Environment-defined |

## BEST PRACTICES

REQUIRED: Validate input with `DtoMappers`.
REQUIRED: Persist `.harness-kit/settings.json` per project.
REQUIRED: Derive worktrees from job IDs and configured base branches.
REQUIRED: Keep failed job worktrees for resume; reuse the original worktree and branch.
REQUIRED: Complete jobs only when all features are `COMPLETED`.
REQUIRED: Screen sensitive files before job commits.
REQUIRED: Deploy job branches through the server.
REQUIRED: Sync OpenAPI after endpoint changes.
PROHIBITED: Block request handling during agent execution.

## REFERENCES

- [**ARCHITECTURE.md**](../../adr/ARCHITECTURE.md): Adapter boundaries.
- [**TESTS.md**](../../adr/TESTS.md): Server test strategy.
- [**SDK_CORE.md**](../orchestration/SDK_CORE.md): Background orchestration.
