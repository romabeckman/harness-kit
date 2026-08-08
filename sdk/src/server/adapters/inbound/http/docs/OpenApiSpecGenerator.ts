import type { OpenApiSpec } from '../../../../domain/types'
import { Runner } from '../../../../../agent-runner/types'

const SHORT_AGENTS = ['antigravity', 'claude', 'copilot', 'cursor', 'codex', 'kiro']
const VALID_RUNNER_TYPES = Object.values(Runner) as string[]
const VALID_SETTINGS_AGENTS = Array.from(new Set([...SHORT_AGENTS, ...VALID_RUNNER_TYPES]))

export class OpenApiSpecGenerator {
  static getSpec(): OpenApiSpec {
    return {
      openapi: '3.0.3',
      info: {
        title: 'Harness-Kit Orchestrator API',
        version: '1.0.0',
        description: 'REST API for Harness-Kit HTTP daemon worker and job orchestration service.',
      },
      tags: [
        {
          name: 'Orchestration Jobs',
          description: 'Endpoints for enqueuing, resuming, monitoring, and cleaning orchestrator jobs.',
        },
        {
          name: 'Workspace & Git',
          description: 'Endpoints for synchronizing git repository workspaces.',
        },
        {
          name: 'Settings',
          description: 'Endpoints for inspecting and updating project model configurations.',
        },
        {
          name: 'Telemetry & Reports',
          description: 'Endpoints for querying token usage telemetry and cost summary reports.',
        },
        {
          name: 'System & Documentation',
          description: 'System health check and interactive OpenAPI / Swagger UI documentation.',
        },
      ],
      paths: {
        '/orchestrator/run': {
          post: {
            tags: ['Orchestration Jobs'],
            summary: 'Enqueue an orchestration job',
            description: 'Enqueues a background orchestration job with requested parameters. Client MUST pass registered project identifier and agent runner.',
            security: [{ BearerAuth: [] }, { BasicAuth: [] }],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    $ref: '#/components/schemas/RunRequestDtoExtended',
                  },
                },
              },
            },
            responses: {
              '202': {
                description: 'Job enqueued successfully',
                content: {
                  'application/json': {
                    schema: {
                      $ref: '#/components/schemas/RunResponseDto',
                    },
                  },
                },
              },
              '400': {
                description: 'Missing project/agent, invalid agent, or unsupported parameters',
                content: {
                  'application/json': {
                    schema: {
                      $ref: '#/components/schemas/HttpServerError',
                    },
                  },
                },
              },
              '401': {
                description: 'Unauthorized access',
                content: {
                  'application/json': {
                    schema: {
                      $ref: '#/components/schemas/HttpServerError',
                    },
                  },
                },
              },
              '403': {
                description: 'Forbidden - token lacks permission for target project',
                content: {
                  'application/json': {
                    schema: {
                      $ref: '#/components/schemas/HttpServerError',
                    },
                  },
                },
              },
              '409': {
                description: 'Duplicate idempotencyKey submitted',
                content: {
                  'application/json': {
                    schema: {
                      $ref: '#/components/schemas/HttpServerError',
                    },
                  },
                },
              },
              '429': {
                description: 'Rate limit exceeded',
                content: {
                  'application/json': {
                    schema: {
                      $ref: '#/components/schemas/HttpServerError',
                    },
                  },
                },
              },
              '500': {
                description: 'Internal server error',
                content: {
                  'application/json': {
                    schema: {
                      $ref: '#/components/schemas/HttpServerError',
                    },
                  },
                },
              },
            },
          },
        },
        '/orchestrator/jobs/{id}/resume': {
          post: {
            tags: ['Orchestration Jobs'],
            summary: 'Resume/retry a stopped or failed job',
            description: 'Resumes execution of a previously failed, stopped, or completed job by ID.',
            security: [{ BearerAuth: [] }, { BasicAuth: [] }],
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                description: 'UUID of the job to resume',
                schema: { type: 'string' },
              },
            ],
            requestBody: {
              required: false,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/RunRequestDtoExtended' },
                },
              },
            },
            responses: {
              '202': {
                description: 'Resumed job enqueued successfully',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/RunResponseDto' },
                  },
                },
              },
              '400': {
                description: 'Job is currently running or invalid ID',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/HttpServerError' },
                  },
                },
              },
              '401': {
                description: 'Unauthorized access',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/HttpServerError' },
                  },
                },
              },
              '403': {
                description: 'Forbidden access',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/HttpServerError' },
                  },
                },
              },
              '404': {
                description: 'Previous job not found',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/HttpServerError' },
                  },
                },
              },
              '429': {
                description: 'Rate limit exceeded',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/HttpServerError' },
                  },
                },
              },
              '500': {
                description: 'Internal server error',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/HttpServerError' },
                  },
                },
              },
            },
          },
        },
        '/orchestrator/status/{id}': {
          get: {
            tags: ['Orchestration Jobs'],
            summary: 'Get job status',
            description: 'Retrieves current status and progress of an orchestration job by ID.',
            security: [{ BearerAuth: [] }, { BasicAuth: [] }],
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                description: 'UUID of the job',
                schema: { type: 'string' },
              },
              {
                name: 'project',
                in: 'query',
                required: false,
                description: 'Optional registered project identifier for scoping authorization',
                schema: { type: 'string' },
              },
            ],
            responses: {
              '200': {
                description: 'Job details',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/JobStatusDto' },
                  },
                },
              },
              '401': {
                description: 'Unauthorized access',
                content: {
                  'application/json': { $ref: '#/components/schemas/HttpServerError' },
                },
              },
              '403': {
                description: 'Forbidden access',
                content: {
                  'application/json': { $ref: '#/components/schemas/HttpServerError' },
                },
              },
              '404': {
                description: 'Job not found',
                content: {
                  'application/json': { $ref: '#/components/schemas/HttpServerError' },
                },
              },
              '429': {
                description: 'Rate limit exceeded',
                content: {
                  'application/json': { $ref: '#/components/schemas/HttpServerError' },
                },
              },
              '500': {
                description: 'Internal server error',
                content: {
                  'application/json': { $ref: '#/components/schemas/HttpServerError' },
                },
              },
            },
          },
        },
        '/orchestrator/jobs/clean': {
          delete: {
            tags: ['Orchestration Jobs'],
            summary: 'Purge completed jobs and clean stale worktrees',
            description: 'Removes finished/failed jobs from memory store and cleans up stale .worktrees/ directories.',
            security: [{ BearerAuth: [] }, { BasicAuth: [] }],
            requestBody: {
              required: false,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      maxAgeMs: { type: 'integer', description: 'Minimum age of completed jobs to purge in milliseconds (default 0)' },
                    },
                  },
                },
              },
            },
            responses: {
              '200': {
                description: 'Cleanup summary',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/CleanResultVo' },
                  },
                },
              },
              '401': {
                description: 'Unauthorized access',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/HttpServerError' } },
                },
              },
              '403': {
                description: 'Forbidden access',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/HttpServerError' } },
                },
              },
              '429': {
                description: 'Rate limit exceeded',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/HttpServerError' } },
                },
              },
              '500': {
                description: 'Internal server error',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/HttpServerError' } },
                },
              },
            },
          },
        },
        '/orchestrator/sync': {
          post: {
            tags: ['Workspace & Git'],
            summary: 'Synchronize workspace git repository',
            description: 'Triggers asynchronous git fetch for baseBranch on target project workspace.',
            security: [{ BearerAuth: [] }, { BasicAuth: [] }],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SyncWorkspaceRequestDto' },
                },
              },
            },
            responses: {
              '200': {
                description: 'Workspace synchronized successfully',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/SyncWorkspaceResponseDto' },
                  },
                },
              },
              '400': {
                description: 'Missing project, not a git repository, or fetch failure',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/HttpServerError' } },
                },
              },
              '401': {
                description: 'Unauthorized access',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/HttpServerError' } },
                },
              },
              '403': {
                description: 'Forbidden access',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/HttpServerError' } },
                },
              },
              '429': {
                description: 'Rate limit exceeded',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/HttpServerError' } },
                },
              },
              '500': {
                description: 'Internal server error',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/HttpServerError' } },
                },
              },
            },
          },
        },
        '/orchestrator/webhook/sync': {
          post: {
            tags: ['Workspace & Git'],
            summary: 'Synchronize workspace git repository (Webhook)',
            description: 'Triggers asynchronous git fetch for baseBranch on target project workspace via webhook.',
            security: [{ BearerAuth: [] }, { BasicAuth: [] }, { HmacAuth: [] }],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/SyncWorkspaceRequestDto' },
                },
              },
            },
            responses: {
              '200': {
                description: 'Workspace synchronized successfully',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/SyncWorkspaceResponseDto' },
                  },
                },
              },
              '400': {
                description: 'Missing project, not a git repository, or fetch failure',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/HttpServerError' } },
                },
              },
              '401': {
                description: 'Unauthorized access',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/HttpServerError' } },
                },
              },
              '403': {
                description: 'Forbidden access',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/HttpServerError' } },
                },
              },
              '429': {
                description: 'Rate limit exceeded',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/HttpServerError' } },
                },
              },
              '500': {
                description: 'Internal server error',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/HttpServerError' } },
                },
              },
            },
          },
        },
        '/orchestrator/settings': {
          get: {
            tags: ['Settings'],
            summary: 'Get local project model settings',
            description: 'Consults local settings.json model configuration for the target project workspace using project identifier.',
            security: [{ BearerAuth: [] }, { BasicAuth: [] }],
            parameters: [
              {
                name: 'project',
                in: 'query',
                required: true,
                description: 'Mandatory registered project identifier (e.g. "backend")',
                schema: { type: 'string' },
              },
              {
                name: 'agent',
                in: 'query',
                required: false,
                description: 'Optional agent runner to filter settings (e.g. "antigravity", "claude-cli")',
                schema: { type: 'string', enum: [...VALID_SETTINGS_AGENTS] },
              },
            ],
            responses: {
              '200': {
                description: 'Local project model settings object',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/SettingsResponseDto' },
                  },
                },
              },
              '400': {
                description: 'Missing/invalid project identifier or invalid agent runner',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/HttpServerError' },
                  },
                },
              },
              '401': {
                description: 'Unauthorized access',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/HttpServerError' } },
                },
              },
              '403': {
                description: 'Forbidden access',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/HttpServerError' } },
                },
              },
              '429': {
                description: 'Rate limit exceeded',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/HttpServerError' } },
                },
              },
              '500': {
                description: 'Internal server error',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/HttpServerError' } },
                },
              },
            },
          },
          post: {
            tags: ['Settings'],
            summary: 'Create or update local project model settings',
            description: 'Saves model configuration in target project local .harness-kit/settings.json file. Supports structured settings wrapper or flat batch parameters.',
            security: [{ BearerAuth: [] }, { BasicAuth: [] }],
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: { $ref: '#/components/schemas/UpdateSettingsRequestDto' },
                },
              },
            },
            responses: {
              '200': {
                description: 'Settings saved successfully',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/SettingsResponseDto' },
                  },
                },
              },
              '400': {
                description: 'Missing/invalid project identifier, invalid agent runner, or path traversal',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/HttpServerError' },
                  },
                },
              },
              '401': {
                description: 'Unauthorized access',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/HttpServerError' } },
                },
              },
              '403': {
                description: 'Forbidden access',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/HttpServerError' } },
                },
              },
              '429': {
                description: 'Rate limit exceeded',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/HttpServerError' } },
                },
              },
              '500': {
                description: 'Internal server error',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/HttpServerError' } },
                },
              },
            },
          },
        },
        '/orchestrator/tokens': {
          get: {
            tags: ['Telemetry & Reports'],
            summary: 'Get token telemetry report (alias)',
            description: 'Alias for /orchestrator/telemetry/tokens. Retrieves parsed token ledger report entries and totals.',
            security: [{ BearerAuth: [] }, { BasicAuth: [] }],
            parameters: [
              {
                name: 'project',
                in: 'query',
                required: false,
                description: 'Registered project identifier',
                schema: { type: 'string' },
              },
              {
                name: 'jobId',
                in: 'query',
                required: false,
                description: 'Optional job UUID filter',
                schema: { type: 'string' },
              },
              {
                name: 'startDate',
                in: 'query',
                required: false,
                description: 'Optional start date ISO string filter',
                schema: { type: 'string' },
              },
              {
                name: 'endDate',
                in: 'query',
                required: false,
                description: 'Optional end date ISO string filter',
                schema: { type: 'string' },
              },
              {
                name: 'model',
                in: 'query',
                required: false,
                description: 'Optional model name filter',
                schema: { type: 'string' },
              },
              {
                name: 'limit',
                in: 'query',
                required: false,
                description: 'Page size limit (default 50)',
                schema: { type: 'integer' },
              },
              {
                name: 'nextToken',
                in: 'query',
                required: false,
                description: 'Opaque pagination token for next page',
                schema: { type: 'string' },
              },
            ],
            responses: {
              '200': {
                description: 'Token telemetry report object',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/TokensTelemetryDto' },
                  },
                },
              },
              '400': {
                description: 'Missing or unregistered project identifier',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/HttpServerError' } },
                },
              },
              '401': {
                description: 'Unauthorized access',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/HttpServerError' } },
                },
              },
              '403': {
                description: 'Forbidden access',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/HttpServerError' } },
                },
              },
              '429': {
                description: 'Rate limit exceeded',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/HttpServerError' } },
                },
              },
              '500': {
                description: 'Internal server error',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/HttpServerError' } },
                },
              },
            },
          },
        },
        '/orchestrator/telemetry/tokens': {
          get: {
            tags: ['Telemetry & Reports'],
            summary: 'Get token telemetry report (tokens.jsonl)',
            description: 'Retrieves parsed token ledger report entries and totals for target registered project.',
            security: [{ BearerAuth: [] }, { BasicAuth: [] }],
            parameters: [
              {
                name: 'project',
                in: 'query',
                required: false,
                description: 'Registered project identifier',
                schema: { type: 'string' },
              },
              {
                name: 'jobId',
                in: 'query',
                required: false,
                description: 'Optional job UUID filter to obtain tokens for a specific workflow execution',
                schema: { type: 'string' },
              },
              {
                name: 'startDate',
                in: 'query',
                required: false,
                description: 'Optional start date ISO string filter',
                schema: { type: 'string' },
              },
              {
                name: 'endDate',
                in: 'query',
                required: false,
                description: 'Optional end date ISO string filter',
                schema: { type: 'string' },
              },
              {
                name: 'model',
                in: 'query',
                required: false,
                description: 'Optional model name filter',
                schema: { type: 'string' },
              },
              {
                name: 'limit',
                in: 'query',
                required: false,
                description: 'Page size limit (default 50)',
                schema: { type: 'integer' },
              },
              {
                name: 'nextToken',
                in: 'query',
                required: false,
                description: 'Opaque pagination token for next page',
                schema: { type: 'string' },
              },
            ],
            responses: {
              '200': {
                description: 'Token telemetry report object',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/TokensTelemetryDto' },
                  },
                },
              },
              '400': {
                description: 'Missing or unregistered project identifier',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/HttpServerError' } },
                },
              },
              '401': {
                description: 'Unauthorized access',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/HttpServerError' } },
                },
              },
              '403': {
                description: 'Forbidden access',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/HttpServerError' } },
                },
              },
              '429': {
                description: 'Rate limit exceeded',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/HttpServerError' } },
                },
              },
              '500': {
                description: 'Internal server error',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/HttpServerError' } },
                },
              },
            },
          },
        },
        '/orchestrator/reports/summary': {
          get: {
            tags: ['Telemetry & Reports'],
            summary: 'Get consolidated reports summary',
            description: 'Returns consolidated cost view aggregated by Project, Model, and Agent within a time window.',
            security: [{ BearerAuth: [] }, { BasicAuth: [] }],
            parameters: [
              {
                name: 'project',
                in: 'query',
                required: false,
                description: 'Optional project identifier to filter report summary',
                schema: { type: 'string' },
              },
              {
                name: 'startDate',
                in: 'query',
                required: false,
                description: 'Optional start date ISO string filter',
                schema: { type: 'string' },
              },
              {
                name: 'endDate',
                in: 'query',
                required: false,
                description: 'Optional end date ISO string filter',
                schema: { type: 'string' },
              },
            ],
            responses: {
              '200': {
                description: 'Consolidated report summary object',
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/ReportsSummaryDto' },
                  },
                },
              },
              '400': {
                description: 'Invalid request parameters',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/HttpServerError' } },
                },
              },
              '401': {
                description: 'Unauthorized access',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/HttpServerError' } },
                },
              },
              '403': {
                description: 'Forbidden access',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/HttpServerError' } },
                },
              },
              '429': {
                description: 'Rate limit exceeded',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/HttpServerError' } },
                },
              },
              '500': {
                description: 'Internal server error',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/HttpServerError' } },
                },
              },
            },
          },
        },
        '/health': {
          get: {
            tags: ['System & Documentation'],
            summary: 'Health check',
            description: 'Returns system health, active jobs, queued jobs, uptime, and memory usage.',
            responses: {
              '200': {
                description: 'System health status',
                content: {
                  'application/json': {
                    schema: {
                      $ref: '#/components/schemas/HealthStatusVo',
                    },
                  },
                },
              },
              '500': {
                description: 'Internal server error',
                content: {
                  'application/json': {
                    schema: {
                      $ref: '#/components/schemas/HttpServerError',
                    },
                  },
                },
              },
            },
          },
        },
        '/docs': {
          get: {
            tags: ['System & Documentation'],
            summary: 'Swagger UI documentation page',
            description: 'Serves standalone HTML page rendering Swagger UI.',
            responses: {
              '200': {
                description: 'Swagger UI HTML page',
                content: {
                  'text/html': {
                    schema: {
                      type: 'string',
                    },
                  },
                },
              },
            },
          },
        },
        '/docs/openapi.json': {
          get: {
            tags: ['System & Documentation'],
            summary: 'OpenAPI specification JSON',
            description: 'Returns the raw OpenAPI 3.0.3 JSON document.',
            responses: {
              '200': {
                description: 'OpenAPI spec JSON',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                    },
                  },
                },
              },
            },
          },
        },
      },
      components: {
        securitySchemes: {
          BearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'Token',
            description: 'Bearer token or API key for protected /orchestrator/* endpoints',
          },
          BasicAuth: {
            type: 'http',
            scheme: 'basic',
            description: 'HTTP Basic authentication for protected /orchestrator/* endpoints',
          },
          JwtAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            description: 'JSON Web Token (JWT/OIDC) for authenticated access and RBAC project scoping',
          },
          HmacAuth: {
            type: 'apiKey',
            in: 'header',
            name: 'X-Signature-256',
            description: 'HMAC-SHA256 payload signature for webhook and M2M authentication',
          },
        },
        schemas: {
          RunRequestDtoExtended: {
            type: 'object',
            properties: {
              idempotencyKey: { type: 'string', description: 'Mandatory client-supplied unique request correlation ID' },
              scope: { type: 'string', description: 'Mandatory target task scope prompt' },
              project: {
                oneOf: [
                  { type: 'string', description: 'Registered project identifier' },
                  { type: 'array', items: { type: 'string' }, description: 'List of registered project identifiers' },
                ],
                description: 'Mandatory registered project identifier or list of project identifiers (min 1 required)',
              },
              agent: { type: 'string', enum: [...VALID_RUNNER_TYPES], description: 'Mandatory registered agent runner strategy' },
              mode: { type: 'string', enum: ['quick', 'fast', 'thinking', 'deep_thinking'], default: 'fast', description: 'Execution mode strategy (default "fast")' },
              action: { type: 'string', enum: ['reset', 'resume'], description: 'Execution action strategy (always "reset" on /orchestrator/run)' },
              reworks: { type: 'integer', default: 2, description: 'Maximum rework attempts (default 2)' },
              steeringMessage: { type: 'string', description: 'Optional initial steering guidance message' },
              model: { type: 'string', description: 'Optional LLM model override string' },
              effort: { type: 'string', description: 'Optional effort/reasoning intensity level' },
              skipValidation: { type: 'boolean', default: false, description: 'Skip validation/review phase (default false)' },
              skipMemory: { type: 'boolean', default: false, description: 'Skip project memory phase (default false)' },
            },
            required: ['idempotencyKey', 'scope', 'project', 'agent'],
          },
          RunResponseDto: {
            type: 'object',
            properties: {
              jobId: { type: 'string' },
              status: { type: 'string', enum: ['queued', 'running'] },
              enqueuedAt: { type: 'string', format: 'date-time' },
              statusUrl: { type: 'string' },
            },
            required: ['jobId', 'status', 'enqueuedAt', 'statusUrl'],
          },
          JobStatusDto: {
            type: 'object',
            properties: {
              jobId: { type: 'string' },
              status: { type: 'string', enum: ['queued', 'running', 'completed', 'failed', 'aborted'] },
              createdAt: { type: 'string', format: 'date-time' },
              startedAt: { type: 'string', format: 'date-time' },
              completedAt: { type: 'string', format: 'date-time' },
              progress: {
                type: 'object',
                properties: {
                  phase: { type: 'string' },
                  step: { type: 'integer' },
                },
              },
              error: {
                type: 'object',
                properties: {
                  code: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
            required: ['jobId', 'status', 'createdAt'],
          },
          SyncWorkspaceRequestDto: {
            type: 'object',
            properties: {
              project: { type: 'string', description: 'Mandatory registered project identifier' },
            },
            required: ['project'],
          },
          SyncWorkspaceResponseDto: {
            type: 'object',
            properties: {
              status: { type: 'string', example: 'synced' },
              project: { type: 'string' },
              workspacePath: { type: 'string' },
              baseBranch: { type: 'string' },
              fetchedAt: { type: 'string', format: 'date-time' },
            },
            required: ['status', 'project', 'workspacePath', 'baseBranch', 'fetchedAt'],
          },
          CleanResultVo: {
            type: 'object',
            properties: {
              purgedJobs: { type: 'integer', description: 'Number of completed jobs purged from memory' },
              cleanedWorktrees: { type: 'integer', description: 'Number of stale worktree directories removed' },
            },
            required: ['purgedJobs', 'cleanedWorktrees'],
          },
          PhaseSettings: {
            type: 'object',
            properties: {
              model: { type: 'string', description: 'LLM model identifier' },
              effort: { type: 'string', description: 'Reasoning effort level' },
              timeoutMs: { type: 'integer', description: 'Phase execution timeout in milliseconds' },
            },
          },
          RunnerSettings: {
            type: 'object',
            properties: {
              timeoutMs: { type: 'integer', description: 'Global runner timeout in milliseconds' },
              phases: {
                type: 'object',
                additionalProperties: { $ref: '#/components/schemas/PhaseSettings' },
                description: 'Phase settings map keyed by phase name (e.g. bootstrap, planning, implementation)',
              },
            },
          },
          HarnessSettingsMap: {
            type: 'object',
            additionalProperties: { $ref: '#/components/schemas/RunnerSettings' },
            description: 'Settings map keyed by runner identifier (e.g. antigravity, claude, copilot)',
          },
          SettingsResponseDto: {
            type: 'object',
            properties: {
              project: { type: 'string', description: 'Registered project identifier' },
              agent: { type: 'string', description: 'Filtered agent runner identifier (if specified)' },
              settings: { $ref: '#/components/schemas/HarnessSettingsMap' },
            },
            required: ['project', 'settings'],
          },
          UpdateSettingsRequestDto: {
            type: 'object',
            properties: {
              project: { type: 'string', description: 'Mandatory registered project identifier (e.g. "backend")' },
              agent: { type: 'string', enum: [...VALID_SETTINGS_AGENTS], description: 'Mandatory agent runner identifier (e.g. "antigravity", "claude-cli")' },
              timeoutMs: { type: 'integer', description: 'Optional runner execution timeout in milliseconds (e.g. 1800000)' },
              phases: {
                type: 'array',
                items: { type: 'string' },
                description: 'Target phase names list (e.g. ["bootstrap", "planning", "implementation", "review_tl", "review_adv", "memory"])',
              },
              model: { type: 'string', description: 'Optional LLM model override (e.g. "gemini-3.1-flash-lite")' },
              effort: { type: 'string', description: 'Optional reasoning effort level (e.g. "high")' },
            },
            required: ['project', 'agent'],
          },
          DetailedTokenUsage: {
            type: 'object',
            properties: {
              inputTokens: { type: 'integer' },
              outputTokens: { type: 'integer' },
              cacheCreationTokens: { type: 'integer' },
              cacheReadTokens: { type: 'integer' },
              calculatedCostUsd: { type: 'number' },
            },
            required: ['inputTokens', 'outputTokens', 'cacheCreationTokens', 'cacheReadTokens', 'calculatedCostUsd'],
          },
          TelemetryAuditEvent: {
            type: 'object',
            properties: {
              auditId: { type: 'string' },
              timestamp: { type: 'string', format: 'date-time' },
              projectId: { type: 'string' },
              jobId: { type: 'string' },
              agent: { type: 'string' },
              skill: { type: 'string' },
              model: { type: 'string' },
              tokenUsage: { $ref: '#/components/schemas/DetailedTokenUsage' },
            },
            required: ['auditId', 'timestamp', 'projectId', 'agent', 'skill', 'model', 'tokenUsage'],
          },
          TokensTelemetryPagination: {
            type: 'object',
            properties: {
              limit: { type: 'integer' },
              nextToken: { type: 'string' },
              totalEntries: { type: 'integer' },
              hasMore: { type: 'boolean' },
            },
            required: ['limit', 'totalEntries', 'hasMore'],
          },
          TokensTelemetryDto: {
            type: 'object',
            properties: {
              project: { type: 'string', description: 'Registered project identifier' },
              jobId: { type: 'string', description: 'Optional job filter' },
              entries: {
                type: 'array',
                items: { $ref: '#/components/schemas/TelemetryAuditEvent' },
                description: 'List of token usage audit events',
              },
              totals: { $ref: '#/components/schemas/DetailedTokenUsage' },
              bySkill: {
                type: 'object',
                additionalProperties: { $ref: '#/components/schemas/DetailedTokenUsage' },
                description: 'Aggregated token usage grouped by skill',
              },
              pagination: { $ref: '#/components/schemas/TokensTelemetryPagination' },
            },
            required: ['project', 'entries', 'totals', 'bySkill'],
          },
          AggregatedMetrics: {
            type: 'object',
            properties: {
              totalCostUsd: { type: 'number' },
              inputTokens: { type: 'integer' },
              outputTokens: { type: 'integer' },
              cacheCreationTokens: { type: 'integer' },
              cacheReadTokens: { type: 'integer' },
              totalInvocations: { type: 'integer' },
            },
            required: ['totalCostUsd', 'inputTokens', 'outputTokens', 'cacheCreationTokens', 'cacheReadTokens', 'totalInvocations'],
          },
          ReportsSummaryDto: {
            type: 'object',
            properties: {
              period: {
                type: 'object',
                properties: {
                  startDate: { type: 'string' },
                  endDate: { type: 'string' },
                },
              },
              summary: {
                type: 'object',
                properties: {
                  byProject: { type: 'object', additionalProperties: { $ref: '#/components/schemas/AggregatedMetrics' } },
                  byModel: { type: 'object', additionalProperties: { $ref: '#/components/schemas/AggregatedMetrics' } },
                  byAgent: { type: 'object', additionalProperties: { $ref: '#/components/schemas/AggregatedMetrics' } },
                },
                required: ['byProject', 'byModel', 'byAgent'],
              },
              grandTotal: { $ref: '#/components/schemas/AggregatedMetrics' },
            },
            required: ['period', 'summary', 'grandTotal'],
          },
          HealthStatusVo: {
            type: 'object',
            properties: {
              status: { type: 'string', enum: ['healthy', 'degraded', 'unhealthy'] },
              uptimeSeconds: { type: 'number' },
              timestamp: { type: 'string', format: 'date-time' },
              activeJobs: { type: 'integer' },
              queuedJobs: { type: 'integer' },
              memoryUsage: {
                type: 'object',
                properties: {
                  rssMb: { type: 'number' },
                  heapUsedMb: { type: 'number' },
                },
                required: ['rssMb', 'heapUsedMb'],
              },
            },
            required: ['status', 'uptimeSeconds', 'timestamp', 'activeJobs', 'queuedJobs', 'memoryUsage'],
          },
          HttpServerError: {
            type: 'object',
            properties: {
              statusCode: { type: 'integer' },
              code: { type: 'string' },
              message: { type: 'string' },
            },
            required: ['statusCode', 'code', 'message'],
          },
        },
      },
    }
  }

  static getSwaggerHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Harness-Kit API Documentation</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
  <style>
    html { box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin:0; background: #fafafa; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" charset="UTF-8"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-standalone-preset.js" charset="UTF-8"></script>
  <script>
    window.onload = function() {
      window.ui = SwaggerUIBundle({
        url: "/docs/openapi.json",
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        layout: "StandaloneLayout"
      });
    };
  </script>
</body>
</html>`
  }
}
