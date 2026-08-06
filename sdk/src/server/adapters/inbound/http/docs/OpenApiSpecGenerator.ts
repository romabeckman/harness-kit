import type { OpenApiSpec } from '../../../../domain/types'

export class OpenApiSpecGenerator {
  static getSpec(): OpenApiSpec {
    return {
      openapi: '3.0.3',
      info: {
        title: 'Harness-Kit Orchestrator API',
        version: '1.0.0',
        description: 'REST API for Harness-Kit HTTP daemon worker and job orchestration service.',
      },
      paths: {
        '/orchestrator/run': {
          post: {
            summary: 'Enqueue an orchestration job',
            description: 'Enqueues a background orchestration job with requested parameters. Client passes registered project identifier (e.g. "backend").',
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
                description: 'Invalid input, project not registered, or unsupported non-interactive mode',
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
            },
          },
        },
        '/orchestrator/jobs/{id}/resume': {
          post: {
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
              '404': {
                description: 'Previous job not found',
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
            summary: 'Get job status',
            description: 'Retrieves current status and progress of an orchestration job by ID.',
            security: [{ BearerAuth: [] }, { BasicAuth: [] }],
            parameters: [
              {
                name: 'id',
                in: 'path',
                required: true,
                description: 'UUID of the job',
                schema: {
                  type: 'string',
                },
              },
            ],
            responses: {
              '200': {
                description: 'Job details',
                content: {
                  'application/json': {
                    schema: {
                      $ref: '#/components/schemas/JobStatusDto',
                    },
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
              '404': {
                description: 'Job not found',
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
        '/orchestrator/settings': {
          get: {
            summary: 'Get local project model settings',
            description: 'Consults local settings.json model configuration for the target project workspace using project identifier.',
            security: [{ BearerAuth: [] }, { BasicAuth: [] }],
            parameters: [
              {
                name: 'project',
                in: 'query',
                required: false,
                description: 'Registered project identifier (e.g. "backend")',
                schema: { type: 'string' },
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
                description: 'Project identifier not registered in server environment',
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
            },
          },
          post: {
            summary: 'Create or update local project model settings',
            description: 'Saves model configuration in target project local .harness-kit/settings.json file.',
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
                description: 'Project identifier not registered or path traversal detected',
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
            },
          },
        },
        '/orchestrator/jobs/clean': {
          delete: {
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
                    schema: {
                      type: 'object',
                      properties: {
                        purgedJobs: { type: 'integer' },
                        cleanedWorktrees: { type: 'integer' },
                      },
                      required: ['purgedJobs', 'cleanedWorktrees'],
                    },
                  },
                },
              },
              '401': {
                description: 'Unauthorized access',
                content: {
                  'application/json': { schema: { $ref: '#/components/schemas/HttpServerError' } },
                },
              },
            },
          },
        },
        '/health': {
          get: {
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
            },
          },
        },
        '/docs': {
          get: {
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
        },
        schemas: {
          RunRequestDtoExtended: {
            type: 'object',
            properties: {
              scope: { type: 'string' },
              project: { type: 'string', description: 'Mandatory registered project identifier (e.g. "backend")' },
              mode: { type: 'string', enum: ['quick', 'fast', 'thinking', 'deep_thinking'] },
              action: { type: 'string', enum: ['reset', 'resume'] },
              score: { type: 'number' },
              reworks: { type: 'integer' },
              steeringMessage: { type: 'string' },
              agentType: { type: 'string' },
              model: { type: 'string' },
              effort: { type: 'string' },
              skipValidation: { type: 'boolean' },
              skipMemory: { type: 'boolean' },
              skipDeploy: { type: 'boolean' },
              refine: { type: 'boolean' },
              branch: { type: 'string', description: 'Target Git branch to checkout prior to job execution' },
              gitUrl: { type: 'string', description: 'Git repository URL to clone if missing from workspace' },
              useWorktree: { type: 'boolean', description: 'Enable isolated Git worktree for parallel job execution' },
            },
          },
          RunResponseDto: {
            type: 'object',
            properties: {
              jobId: { type: 'string' },
              status: { type: 'string', enum: ['queued', 'running'] },
              workspacePath: { type: 'string' },
              enqueuedAt: { type: 'string', format: 'date-time' },
              statusUrl: { type: 'string' },
            },
            required: ['jobId', 'status', 'workspacePath', 'enqueuedAt', 'statusUrl'],
          },
          JobStatusDto: {
            type: 'object',
            properties: {
              jobId: { type: 'string' },
              status: { type: 'string', enum: ['queued', 'running', 'completed', 'failed', 'aborted'] },
              workspacePath: { type: 'string' },
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
            required: ['jobId', 'status', 'workspacePath', 'createdAt'],
          },
          SettingsResponseDto: {
            type: 'object',
            properties: {
              projectPath: { type: 'string' },
              settings: { type: 'object', description: 'HarnessSettingsMap model configuration' },
            },
            required: ['projectPath', 'settings'],
          },
          UpdateSettingsRequestDto: {
            type: 'object',
            properties: {
              project: { type: 'string', description: 'Registered project identifier (e.g. "backend")' },
              settings: { type: 'object', description: 'HarnessSettingsMap model configuration to save' },
            },
            required: ['settings'],
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
