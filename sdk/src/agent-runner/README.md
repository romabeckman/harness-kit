# Agent Runner Plugin Blueprint

This blueprint demonstrates how external packages or plugins register custom runner strategies (e.g. OpenCode, Copilot, Cursor) without modifying the core files of `harness-kit`.

## How It Works

1. Create a class implementing the `IAgentRunner` interface.
2. Register the strategy dynamically using `AgentRunnerRegistry.register`.

### Example Strategy Implementation

```typescript
import { IAgentRunner, AgentInvocation, AgentOutput, AgentRunnerRegistry } from '@romabeckman/hk/dist/agent-runner'

export interface OpenCodeRunnerConfig {
  readonly endpoint: string
  readonly model?: string
}

export class OpenCodeRunner implements IAgentRunner {
  constructor(private readonly config: OpenCodeRunnerConfig) {
    if (!config.endpoint) {
      throw new Error("endpoint is required for OpenCodeRunner")
    }
  }

  async run(invocation: AgentInvocation, options?: { signal?: AbortSignal }): Promise<AgentOutput> {
    const controller = new AbortController()

    if (options?.signal) {
      if (options.signal.aborted) {
        controller.abort()
      }
      options.signal.addEventListener('abort', () => {
        controller.abort()
      })
    }

    // Call external service or API using config.endpoint
    // Handle signal to abort HTTP requests
    
    return {
      success: true,
      stdout: "result text",
      stderr: "",
      raw: "result text",
      usage: {
        inputTokens: 100,
        outputTokens: 200,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        costUsd: 0.001
      }
    }
  }
}

// Self-registration
AgentRunnerRegistry.register({
  type: 'opencode',
  constructor: OpenCodeRunner,
  validateConfig: (config: any) => {
    if (!config.endpoint) {
      throw new Error("endpoint is required for opencode runner type")
    }
  }
})
```
