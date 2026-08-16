import { AgentRunnerFactory } from '../agent-runner/AgentRunnerFactory'
import type { IAgentRunner } from '../agent-runner/IAgentRunner'
import type { AgentInvocation, AgentOutput } from '../agent-runner/types'
import { Runner } from '../agent-runner/types'
import type { DiagnoseSessionRecord, DiagnoseSettings, IMetaHarnessAgentAdapter } from './types'
import { DiagnosePaths } from './utils/DiagnosePaths'

export interface MetaHarnessAgentAdapterOptions {
  agentRunner?: IAgentRunner
  workingDir?: string
}

export class MetaHarnessAgentAdapter implements IMetaHarnessAgentAdapter {
  private readonly customRunner?: IAgentRunner
  private readonly workingDir: string

  constructor(options: MetaHarnessAgentAdapterOptions = {}) {
    this.customRunner = options.agentRunner
    this.workingDir = options.workingDir ?? process.cwd()
  }

  async invoke(
    session: DiagnoseSessionRecord,
    preComputedId: string,
    settings?: DiagnoseSettings
  ): Promise<AgentOutput> {
    const model = (settings?.model && settings.model.trim().length > 0) ? settings.model.trim() : (session.model || undefined)
    const effort = (settings?.effort && settings.effort.trim().length > 0) ? settings.effort.trim() : (session.effort || undefined)

    const runner = this.customRunner ?? AgentRunnerFactory.create({
      type: session.runner,
      model,
      effort,
    })

    const normalizedWorkingDir = DiagnosePaths.toForwardSlashes(this.workingDir)
    const tracesBasePath = DiagnosePaths.toForwardSlashes(DiagnosePaths.tracesDir(this.workingDir))
    const sessionTracePath = DiagnosePaths.toForwardSlashes(DiagnosePaths.sessionTraceDir(this.workingDir, preComputedId))
    const paretoPath = DiagnosePaths.toForwardSlashes(DiagnosePaths.paretoFrontierPath(this.workingDir))

    const prompt = [
      `You are \`harness-kit:meta-harness-agent\`. Execute the trace and evaluation lifecycle for this session:`,
      ``,
      `TARGET WORKSPACE ROOT: ${normalizedWorkingDir}`,
      `STRICT WORKSPACE CONSTRAINTS (MANDATORY):`,
      `- All file operations, trace records, and directories MUST be read and created strictly inside the project root: \`${normalizedWorkingDir}\`.`,
      `- PROHIBITED: NEVER search, read, create, or write files in home directories, user profiles, ~/.gemini/, or any location outside \`${normalizedWorkingDir}\`.`,
      ``,
      `1. Invoke \`harness-kit:harness-tracer\` to record the execution trace for this session in \`${sessionTracePath}/\` (relative: \`docs/harness-history/traces/${preComputedId}/\`).`,
      `   - Target directory: ${sessionTracePath}/`,
      `   - Use pre-computed session_id: ${preComputedId}`,
      `   - Skill: ${session.skill ?? 'unknown'}`,
      `   - Agent: ${session.agent}`,
      `   - Model: ${model || 'default'}`,
      `   - Effort: ${effort || 'default'}`,
      ``,
      `2. Evaluate activation rules:`,
      `   - Check trace count in \`${tracesBasePath}/\`. If count is a positive multiple of 6 (6, 12, 18, ...), invoke \`harness-kit:harness-evaluator\` to update \`${paretoPath}\`.`,
    ].join('\n')

    const invocation: AgentInvocation = {
      agent: 'harness-kit:meta-harness-agent',
      mode: 'autonomous',
      prompt,
      workspacePath: this.workingDir,
      model,
      effort,
      phaseKey: 'diagnose',
      session: { id: session.sessionId },
    }

    return runner.run(invocation)
  }

  async invokeMetaHarness(
    session: DiagnoseSessionRecord,
    settings?: DiagnoseSettings
  ): Promise<AgentOutput> {
    const model = (settings?.model && settings.model.trim().length > 0) ? settings.model.trim() : (session.model || undefined)
    const effort = (settings?.effort && settings.effort.trim().length > 0) ? settings.effort.trim() : (session.effort || undefined)

    const runner = this.customRunner ?? AgentRunnerFactory.create({
      type: session.runner,
      model,
      effort,
    })

    const normalizedWorkingDir = DiagnosePaths.toForwardSlashes(this.workingDir)
    const tracesBasePath = DiagnosePaths.toForwardSlashes(DiagnosePaths.tracesDir(this.workingDir))
    const paretoPath = DiagnosePaths.toForwardSlashes(DiagnosePaths.paretoFrontierPath(this.workingDir))
    const candidatesBasePath = DiagnosePaths.toForwardSlashes(DiagnosePaths.candidatesDir(this.workingDir))

    const prompt = [
      `You are \`harness-kit:meta-harness-agent\`.`,
      `TARGET WORKSPACE ROOT: ${normalizedWorkingDir}`,
      ``,
      `STRICT WORKSPACE CONSTRAINTS (MANDATORY):`,
      `- All operations, file reads, and file writes MUST be performed strictly inside the project root: \`${normalizedWorkingDir}\`.`,
      `- PROHIBITED: NEVER search for, read, create, or modify files in home directory, user profile, ~/.gemini/, or any location outside \`${normalizedWorkingDir}\`.`,
      `- Traces directory: \`${tracesBasePath}/\``,
      `- Pareto frontier file: \`${paretoPath}\``,
      `- Candidates directory: \`${candidatesBasePath}/\``,
      ``,
      `All execution sessions have been traced in \`${tracesBasePath}/\`.`,
      ``,
      `Execute \`harness-kit:meta-harness\` optimization workflow:`,
      `1. Read the trace history strictly from \`${tracesBasePath}/\` and verify that \`${paretoPath}\` is compiled (invoke \`harness-kit:harness-evaluator\` if needed).`,
      `2. Diagnose patterns of regression, failure modes, or stagnation across skills.`,
      `3. Create the candidate directory strictly in \`${candidatesBasePath}/{candidate_id}/\` (relative: \`docs/harness-history/candidates/{candidate_id}/\`, e.g. \`v001\`, \`v002\`, etc.).`,
      `4. Write the proposed candidate modification to the target skill's \`SKILL.md\` and store all candidate metadata files (\`rationale.md\`, \`diff.md\`, \`score.md\`, \`SKILL.md\`) inside \`${candidatesBasePath}/{candidate_id}/\`.`,
      `5. Output final decision strictly as a JSON block with candidateId, targetSkill, status, and decision.`,
    ].join('\n')

    const invocation: AgentInvocation = {
      agent: 'harness-kit:meta-harness-agent',
      skill: 'harness-kit:meta-harness',
      mode: 'autonomous',
      prompt,
      workspacePath: this.workingDir,
      model,
      effort,
      phaseKey: 'diagnose',
    }

    return runner.run(invocation)
  }

  async invokeCandidatePromotion(
    candidateId: string,
    targetSkill: string,
    runnerType: string = Runner.CLAUDE_CLI,
    settings?: DiagnoseSettings
  ): Promise<AgentOutput> {
    const model = (settings?.model && settings.model.trim().length > 0) ? settings.model.trim() : undefined
    const effort = (settings?.effort && settings.effort.trim().length > 0) ? settings.effort.trim() : undefined

    const runner = this.customRunner ?? AgentRunnerFactory.create({
      type: runnerType,
      model,
      effort,
    })

    const normalizedWorkingDir = DiagnosePaths.toForwardSlashes(this.workingDir)
    const candidatesBasePath = DiagnosePaths.toForwardSlashes(DiagnosePaths.candidatesDir(this.workingDir))
    const candidateDir = `${candidatesBasePath}/${candidateId}`

    const prompt = [
      `You are \`harness-kit:meta-harness-agent\`. Apply and integrate candidate ${candidateId} for skill "${targetSkill}".`,
      ``,
      `TARGET WORKSPACE ROOT: ${normalizedWorkingDir}`,
      `STRICT WORKSPACE CONSTRAINTS (MANDATORY):`,
      `- All operations, file reads, and file writes MUST be performed strictly inside the project root: \`${normalizedWorkingDir}\`.`,
      `- PROHIBITED: NEVER search for, read, create, or modify files in home directory, user profile, ~/.gemini/, or any location outside \`${normalizedWorkingDir}\`.`,
      ``,
      `Candidate Files:`,
      `- Diff: \`${candidateDir}/diff.md\``,
      `- Rationale: \`${candidateDir}/rationale.md\``,
      `- Candidate SKILL: \`${candidateDir}/SKILL.md\``,
      ``,
      `Instructions:`,
      `1. Read the candidate changes from \`${candidateDir}/diff.md\` and \`${candidateDir}/SKILL.md\`.`,
      `2. Locate the active target skill file in \`skills/${targetSkill}/SKILL.md\` (or in parent/plugin directories if configured).`,
      `3. Apply the improvements and update the active skill file.`,
      `4. In \`${candidateDir}/score.md\`, update the record setting \`promoted: true\` and recording \`promoted_at: ${new Date().toISOString()}\`.`,
      `5. Output your decision as a JSON block with candidateId, targetSkill, status: "PROMOTED", and promoted: true.`,
    ].join('\n')

    const invocation: AgentInvocation = {
      agent: 'harness-kit:meta-harness-agent',
      mode: 'autonomous',
      prompt,
      workspacePath: this.workingDir,
      model,
      effort,
      phaseKey: 'diagnose',
    }

    return runner.run(invocation)
  }
}
