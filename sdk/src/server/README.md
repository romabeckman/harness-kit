# Harness SDK HTTP Server

> **Beta:** The HTTP server is currently in beta. Its APIs and behavior may change.

This directory (`src/server/`) contains the headless, non-interactive HTTP daemon capability for `@romabeckman/hrns`. It allows external clients, CI/CD runners, and Docker containers to trigger and monitor autonomous TDD orchestration loops via RESTful APIs.

---

## Quick Start

### 1. Programmatic Usage (Node.js / TypeScript)

You can import and start the server directly within your Node.js application:

```typescript
import { startHttpServer } from '@romabeckman/hrns'

// Start server on custom port/host (defaults: port 3000, host 'localhost')
const server = await startHttpServer({
  port: 3000,
  host: 'localhost',
  allowedWorkspaces: ['/workspace/my-project'], // optional path restriction
})

console.log(`HTTP Server running at http://localhost:${server.getPort()}`)

// To stop the server gracefully (drains open connections and stops worker loop):
// await server.stop()
```

---

### 2. Standalone Script

After building the project (`npm run build`), you can run the compiled HTTP server script directly:

```bash
# Default settings (PORT 3000, HOST localhost)
node dist/server/index.js

# Custom port and host via environment variables
PORT=8080 HOST=127.0.0.1 node dist/server/index.js
```

---

### 3. Running with Docker

From the SDK directory containing `Dockerfile`, build the image with Docker installed and running:

```bash
docker build -t hrns-server:latest .
```

Create a local directory for the project repositories and set a GitHub token with access to the repository. Replace the example repository URL and branch with your own. The token is used for HTTPS authentication during clone, fetch, and push.

```bash
mkdir -p ./workspaces
export GIT_TOKEN='your-github-token'
```

Start the container and mount the workspace directory so repositories, failed job worktrees, and job artifacts persist across container recreation. The `backend` alias identifies the project in API requests.

```bash
docker run -d \
  --name hrns-daemon \
  -p 127.0.0.1:3000:3000 \
  -v "$(pwd)/workspaces:/workspaces" \
  -e PORT=3000 \
  -e HOST=0.0.0.0 \
  -e ALLOWED_WORKSPACES=/workspaces \
  -e GIT_COMMIT_AUTHOR_NAME="HRNS Bot" \
  -e GIT_COMMIT_AUTHOR_EMAIL="bot@company.com" \
  -e GIT_TOKEN \
  -e PROJECT_MAPPINGS='{"backend":{"path":"/workspaces/backend","gitUrl":"https://github.com/org/backend.git","baseBranch":"main"}}' \
  hrns-server:latest
```

The entrypoint clones the mapped repository on startup. If it already exists at the mapped path, the entrypoint fetches the base branch and resets the checkout to its remote state. Use a dedicated workspace for this container.

Check startup logs and the health endpoint:

```bash
docker logs -f hrns-daemon
# In another terminal
curl http://localhost:3000/health
```

The image starts the HTTP server and includes Git. To execute orchestration jobs, provision the selected agent runner, its credentials, and the Harness Kit skills in the container environment. See the API examples below for submitting and monitoring jobs. The example binds the published port to localhost and uses the default unauthenticated mode. Configure `AUTH_MODE` when clients need authenticated access.

---

### 4. Running with Docker Compose

Use `docker-compose.yml` for zero-configuration local execution:

```bash
# Build and start container in background
docker compose up -d --build

# Inspect bootstrap and server logs
docker compose logs -f

# Check container health status
docker compose ps

# Execute an interactive shell inside container for debugging
docker compose exec hrns-server sh

# Stop container and clean resources
docker compose down
```

---

## Configuration & Environment Variables

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `3000` | HTTP port to listen on |
| `HOST` | `localhost` | Host interface to bind (`0.0.0.0` for container networks) |
| `ALLOWED_WORKSPACES` | *None* | Comma-separated list of allowed workspace directories/repos on VM |
| `PROJECT_MAPPINGS` | *None* | JSON object mapping project aliases to `{ path, gitUrl, baseBranch }` for startup pre-cloning |
| `PROJECT_<NAME>_BASE_BRANCH` | `main` | Base branch for target project (e.g. `develop`) |
| `GIT_COMMIT_AUTHOR_NAME` | `HRNS Automation` | Git commit author name for automated commits |
| `GIT_COMMIT_AUTHOR_EMAIL` | `automation@hrns.local` | Git commit author email for automated commits |
| `GIT_SSH_PRIVATE_KEY` | *None* | RSA/Ed25519 private SSH key string injected at boot into `/root/.ssh/id_ed25519` |
| `GIT_TOKEN` | *None* | Personal Access Token (PAT) registered in `/root/.git-credentials` |
| `AUTH_MODE` | `none` | Authentication strategy: `none` (disabled), `basic`, or `bearer` |
| `AUTH_BEARER_TOKEN` | *None* | Secret token for Bearer auth / `X-API-Key` header |
| `AUTH_BASIC_USER` | `admin` | Username for HTTP Basic Auth |
| `AUTH_BASIC_PASS` | *None* | Password for HTTP Basic Auth |

---

## Workspace paths and project mappings

`PROJECT_MAPPINGS` registers each project alias and its workspace path. When a request sends `"project": "cms"`, the server resolves that alias to its configured path. If `ALLOWED_WORKSPACES` contains paths, the project path must equal one of them or be inside it; otherwise the run is rejected with `WORKSPACE_NOT_ALLOWED`. An empty or unset `ALLOWED_WORKSPACES` does not apply this restriction.

For a server running directly on Windows, for example:

```env
ALLOWED_WORKSPACES=C:/Projects/example-app
PROJECT_MAPPINGS={"cms":{"path":"C:/Projects/example-app","baseBranch":"main"}}
```

A parent directory such as `C:/Projects` can also allow projects inside it. For Docker, use paths visible inside the container in both variables, and mount the host directory there. For example, if the CMS directory is mounted at `/workspaces/cms`, use:

```env
ALLOWED_WORKSPACES=/workspaces/cms
PROJECT_MAPPINGS={"cms":{"path":"/workspaces/cms","baseBranch":"main"}}
```

---
## Authentication & Security Options

Authentication is optional and configurable via the `AUTH_MODE` environment variable.

### 1. Bearer Token / API Key Mode (`AUTH_MODE=bearer`)
Recommended for CI/CD runners and machine-to-machine integrations.

```bash
# Environment variables
AUTH_MODE=bearer
AUTH_BEARER_TOKEN=hrns_sk_live_9876543210

# cURL with Bearer header
curl -X POST http://localhost:3000/orchestrator/run \
  -H "Authorization: Bearer hrns_sk_live_9876543210" \
  -H "Content-Type: application/json" \
  -d '{ "idempotencyKey": "build-request-001", "scope": "build", "project": "backend", "agent": "claude-cli" }'

# Or using X-API-Key header
curl -X POST http://localhost:3000/orchestrator/run \
  -H "X-API-Key: hrns_sk_live_9876543210" \
  -H "Content-Type: application/json" \
  -d '{ "idempotencyKey": "build-request-002", "scope": "build", "project": "backend", "agent": "claude-cli" }'
```

### 2. Basic Auth Mode (`AUTH_MODE=basic`)

```bash
# Environment variables
AUTH_MODE=basic
AUTH_BASIC_USER=admin
AUTH_BASIC_PASS=secret123

# cURL with Basic Auth
curl -u admin:secret123 -X POST http://localhost:3000/orchestrator/run \
  -H "Content-Type: application/json" \
  -d '{ "idempotencyKey": "build-request-003", "scope": "build", "project": "backend", "agent": "claude-cli" }'
```

### 3. Disabled Mode (`AUTH_MODE=none`)
Default mode for local development. Requests require no authorization headers.

---

## Mandatory Git Worktree & Automated Commit/Push

In HTTP daemon execution mode:
1. **Mandatory Worktree Isolation**: All background jobs run inside an isolated Git worktree (`.worktrees/<jobId>`) by default. Worktrees are created directly off `origin/<baseBranch>` after performing a JIT `git fetch origin <baseBranch>`.
2. **Automated Commit & Push**: Upon successful completion of the TDD orchestrator loop:
   - The server inspects modified files and stages them (`git add -A`).
   - Commits changes (`git commit -m "feat(harness): completed orchestration job <jobId> [<scope>]"`).
   - Pushes branch to remote origin (`git push origin <branch>`).
3. **Resume**: Failed jobs keep their worktree and branch. Resume uses that state; successful jobs remove the worktree.

Before deployment, the server archives the job's diagnostic session ledger and Project Dreaming episode and handoff JSON files when they exist. The archive stays under `<workspace>/.harness-kit/job-artifacts/<jobId>/` for manual inspection after worktree cleanup. If archival fails, the job reports `ARTIFACT_ARCHIVE_FAILED`, keeps the worktree, and can be resumed after the archive location is corrected.

---

## API Endpoints

Once the server is running, the following REST endpoints are available:

| Method | Endpoint | Description | Response Code |
| :--- | :--- | :--- | :--- |
| `POST` | `/orchestrator/run` | Enqueues a new background orchestration job | `202 Accepted` |
| `POST` | `/orchestrator/jobs/:id/resume` | Resumes/retries a previously stopped or failed job | `202 Accepted` |
| `POST` | `/orchestrator/webhook/sync` | Reactive git fetch sync on target project baseBranch | `200 OK` |
| `GET` | `/orchestrator/status/:id` | Polls current status and progress for job `:id` | `200 OK` / `404 Not Found` |
| `DELETE` | `/orchestrator/jobs/clean` | Purges completed jobs from memory store & cleans stale worktrees | `200 OK` |
| `GET` | `/health` | Liveness & readiness probe (active/queued jobs, memory usage) | `200 OK` |
| `GET` | `/docs` | Interactive Swagger UI documentation page | `200 OK` (HTML) |
| `GET` | `/docs/openapi.json` | Raw OpenAPI 3.0.3 specification JSON | `200 OK` (JSON) |

---

## Triggering an Orchestration Job

### Triggering an Orchestration Job on Remote Server (Using Project Alias)

The client sends one registered project alias, plus idempotencyKey, scope, and agent. The server resolves the workspace and creates an isolated worktree:

```bash
curl -X POST http://localhost:3000/orchestrator/run \
  -H "Content-Type: application/json" \
  -d '{
    "idempotencyKey": "auth-request-001",
    "scope": "implement-user-authentication",
    "project": "backend",
    "agent": "claude-cli",
    "mode": "fast",
    "score": 0.8
  }'
```

### Resuming a Stopped or Failed Job (`POST /orchestrator/jobs/:id/resume`)

If a job stops or fails, the server uses the persisted state to resume it.

```bash
curl -X POST http://localhost:3000/orchestrator/jobs/job-123-abc/resume \
  -H "Content-Type: application/json" \
  -d '{
    "steeringMessage": "Require manual approval for orders over $500."
  }'
```

The resume request accepts only `steeringMessage`. When job status reports `REFINEMENT_REQUIRED`, provide a non-blank new `steeringMessage` containing the decision requested in the error. An absent or blank decision returns `400` with `REFINEMENT_DECISION_REQUIRED`. The resumed job uses the original preserved worktree and branch.

When project memory fails or times out, the job reports `MEMORY_FAILED` and retains the worktree for a retry before deployment. During a running job, the status response may include a `progress.phase` such as `DEVELOPMENT`, `REVIEW`, `PROJECT_DREAMING`, `MEMORY`, or `DEPLOY`.

The server passes Project Dreaming a deadline of at most 120 seconds, subject to the runner honoring cancellation. Provision `harness-kit:project-dreaming` for the selected runner in the deployment environment.

### Cleaning Old Jobs & Stale Worktrees (`DELETE /orchestrator/jobs/clean`)

To purge completed/failed jobs from memory and clean up stale `.worktrees/` directories, including saved resume state:

```bash
curl -X DELETE http://localhost:3000/orchestrator/jobs/clean \
  -H "Content-Type: application/json" \
  -d '{ "maxAgeMs": 3600000 }'
```

- **`maxAgeMs`**: Optional threshold in milliseconds (default `0` purges all completed/failed jobs).

### Example Response (`HTTP 202 Accepted`)

```json
{
  "jobId": "e4e9d777-3db4-44d1-907e-bff18ee3342e",
  "status": "queued",
  "workspacePath": "/workspace",
  "enqueuedAt": "2026-08-06T17:50:00.000Z",
  "statusUrl": "/orchestrator/status/e4e9d777-3db4-44d1-907e-bff18ee3342e"
}
```

---

## Non-Interactive Invariants

> âš ï¸ **Important Execution Constraints:**
> - Refinement parameters (`refine` and `enableRefinement`) are **forbidden** in HTTP mode, including `false`. The server returns `HTTP 400 Bad Request`.
> - Execution mode is fixed to **fast**. Omit `mode` or send `"fast"`; every other value returns `HTTP 400 Bad Request`. Validation and memory remain enabled; `skipValidation` and `skipMemory` overrides return `HTTP 400 Bad Request`.
> - Parameter `project` is required and must contain at least 1 project identifier.
> - One project is supported per job. Arrays with multiple projects return `HTTP 400 Bad Request`.
> - `idempotencyKey`, `scope`, and `agent` are required.
> - Path traversal sequences (`..`) in `project` parameter are blocked (`HTTP 400 Bad Request`).
