# Harness SDK HTTP Server

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

Build and run using the production multi-stage `Dockerfile` with the pre-cloning `entrypoint.sh` script:

```bash
# 1. Build the Docker image
docker build -t hrns-server:latest .

# 2. Run container with environment variables & Git authorization
docker run -d \
  -p 3000:3000 \
  -v /path/to/workspaces:/workspaces \
  -e PORT=3000 \
  -e HOST=0.0.0.0 \
  -e GIT_COMMIT_AUTHOR_NAME="HRNS Bot" \
  -e GIT_COMMIT_AUTHOR_EMAIL="bot@company.com" \
  -e GIT_TOKEN="ghp_xxxxxxxxxxxx" \
  -e PROJECT_MAPPINGS='{"backend":{"path":"/workspaces/backend","gitUrl":"git@github.com:org/backend.git"}}' \
  --name hrns-daemon \
  hrns-server:latest

# 3. View entrypoint bootstrap logs
docker logs -f hrns-daemon
```

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
  -d '{ "scope": "build", "project": "backend" }'

# Or using X-API-Key header
curl -X POST http://localhost:3000/orchestrator/run \
  -H "X-API-Key: hrns_sk_live_9876543210" \
  -H "Content-Type: application/json" \
  -d '{ "scope": "build", "project": "backend" }'
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
  -d '{ "scope": "build", "project": "backend" }'
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
3. **Clean Up**: The worktree is safely deleted in a `finally` block, leaving the main repository clean.

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

The client sending the request does **not** need to know internal server filesystem paths. Instead, the client sends a clean project alias or list of project aliases (`"project": "backend"` or `"project": ["backend"]`, minimum 1 required):

```bash
curl -X POST http://localhost:3000/orchestrator/run \
  -H "Content-Type: application/json" \
  -d '{
    "scope": "implement-user-authentication",
    "project": ["backend"],
    "branch": "feature/login-auth",
    "mode": "fast",
    "useWorktree": true
  }'
```

### Resuming a Stopped or Failed Job (`POST /orchestrator/jobs/:id/resume`)

If a job stops or fails, you can resume execution from the exact phase it stopped by calling:

```bash
curl -X POST http://localhost:3000/orchestrator/jobs/job-123-abc/resume \
  -H "Content-Type: application/json" \
  -d '{
    "steeringMessage": "try adjusting test thresholds"
  }'
```

### Cleaning Old Jobs & Stale Worktrees (`DELETE /orchestrator/jobs/clean`)

To purge completed/failed jobs from memory and clean up stale `.worktrees/` directories:

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

> ⚠️ **Important Execution Constraints:**
> - Interactive pre-planning refinement (`refine: true`) requires terminal TTY input and is **forbidden** in HTTP mode. The server returns `HTTP 400 Bad Request`.
> - Interactive `mode: "deep_thinking"` is forbidden in HTTP mode and returns `HTTP 400 Bad Request`.
> - Parameter `project` is required and must contain at least 1 project identifier.
> - Path traversal sequences (`..`) in `project` parameter are blocked (`HTTP 400 Bad Request`).
