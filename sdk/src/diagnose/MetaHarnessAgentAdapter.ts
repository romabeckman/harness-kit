import { lstatSync } from 'node:fs'
import { join } from 'node:path'
import { AgentRunnerFactory } from '../agent-runner/AgentRunnerFactory'
import type { IAgentRunner } from '../agent-runner/IAgentRunner'
import type { AgentInvocation, AgentOutput } from '../agent-runner/types'
import { Runner } from '../agent-runner/types'
import type { DiagnoseSessionRecord, DiagnoseSettings, IMetaHarnessAgentAdapter } from './types'
import { DiagnosePaths } from './utils/DiagnosePaths'
import { readCodexSkillBaselines } from './SkillBaselineReader'

const TRACE_FILES = {
  'metadata.md': 'Session Metadata with session_id, date, skill_used, agent, skill_chain, task_summary, task_type, duration_estimate, model, effort, and featureId when known.',
  'input.md': 'Session Input with the task description, initial context read, and starting state.',
  'steps.md': 'Execution Steps with the skill chain, chronological actions, tools, outcomes, and deviations.',
  'score.md': 'Session Score with Raw Metrics for tdd_cycles, iterations_to_pass, reworksCount, grumpy_open_points, context_docs_read, skill_chain_length, deviations, and blockers_hit. Leave Computed Score blank for the evaluator.',
  'verdict.md': 'Session Verdict with What Worked Well, What Caused Friction, Hypothesis, and Recommended Change when supported.',
}

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
    const historyPath = DiagnosePaths.toForwardSlashes(DiagnosePaths.harnessHistoryDir(this.workingDir))
    const tracesBasePath = DiagnosePaths.toForwardSlashes(DiagnosePaths.tracesDir(this.workingDir))
    const traceDir = DiagnosePaths.sessionTraceDir(this.workingDir, preComputedId)
    const sessionTracePath = DiagnosePaths.toForwardSlashes(traceDir)
    const paretoPath = DiagnosePaths.toForwardSlashes(DiagnosePaths.paretoFrontierPath(this.workingDir))

    const prompt = [
      `You are \`harness-kit:meta-harness-agent\`. Execute the trace and evaluation lifecycle for this session:`,
      ``,
      `TARGET WORKSPACE ROOT: ${normalizedWorkingDir}`,
      `STRICT WORKSPACE CONSTRAINTS (MANDATORY):`,
      `- All file operations, trace records, and directories MUST be read and created strictly inside the project root: \`${normalizedWorkingDir}\`.`,
      `- PROHIBITED: NEVER search, read, create, or write files outside \`${normalizedWorkingDir}\`, including any external plugin or user cache.`,
      ``,
      `1. Follow the trace recording instructions below (the \`harness-kit:harness-tracer\` file is not needed).`,
      `   - Reconstruct the original work from the resumed session, excluding diagnosis attempts. Mark unavailable details as unknown and never invent actions or metrics.`,
      `   - Target directory: ${sessionTracePath}/`,
      `   - Use pre-computed session_id: ${preComputedId}`,
      `   - Session date: ${session.timestamp || 'unknown'}`,
      `   - Skill: ${session.skill ?? 'unknown'}`,
      `   - Agent: ${session.agent}`,
      `   - Model: ${session.model || session.snapshot?.model || 'unknown'}`,
      `   - Effort: ${session.effort || session.snapshot?.effort || 'unknown'}`,
      `   - Create the target and write all five non-empty Markdown files before reporting completion:`,
      ...Object.entries(TRACE_FILES).map(([file, contents]) => `     - \`${file}\`: ${contents}`),
      `   - Initialize missing history entries under \`${historyPath}/\`. Create candidates/, baseline.md with the current known skill configuration, and pareto-frontier.md with a no-data placeholder.`,
      `   - If config.md is missing, record these score weights: tdd_cycles 0.25, iterations_to_pass 0.20, reworksCount 0.20, grumpy_open_points 0.20, context_docs_read 0.05, skill_chain_length 0.05, deviations 0.05. Lower is better except for context_docs_read, whose target is 6–8.`,
      `   - In that new config.md, define the composite score as the weighted sum of 1 / max(metric, 1) for tdd_cycles and iterations_to_pass, 1 / (1 + metric) for reworksCount, grumpy_open_points, and deviations, 1 / max(skill_chain_length - 1, 1), and a context score of 1 for 6–8 docs, 0.5 for 3–5 or 9–12, and 0 otherwise.`,
      ``,
      `2. After recording the trace, count complete traces in \`${tracesBasePath}/\`. If the count is a positive multiple of 6 (6, 12, 18, ...), use \`harness-kit:harness-evaluator\` to update \`${paretoPath}\` when its instructions are available within the workspace. Report if evaluation is unavailable.`,
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

    const output = await runner.run(invocation)
    if (output.success === false) return output

    const isTraceDirectory = lstatSync(traceDir, { throwIfNoEntry: false })?.isDirectory()
    const missingFiles = Object.keys(TRACE_FILES).filter(file => {
      if (!isTraceDirectory) return true
      const stats = lstatSync(join(traceDir, file), { throwIfNoEntry: false })
      return !stats?.isFile() || stats.size === 0
    })
    if (missingFiles.length > 0) {
      throw new Error(`Incomplete trace ${preComputedId}. Missing or empty files: ${missingFiles.join(', ')}`)
    }

    return output
  }

  async invokeMetaHarness(
    session: DiagnoseSessionRecord,
    settings?: DiagnoseSettings,
    recordedSkills: readonly string[] = session.skill ? [session.skill] : [],
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
    const baselines = readCodexSkillBaselines(recordedSkills)

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
      `Read the traces that exist in \`${tracesBasePath}/\`.`,
      ``,
      `Follow this \`harness-kit:meta-harness\` proposal workflow:`,
      `1. Read the frontier and compare relevant traces. If composite scores are unavailable, compare concrete actions and outcomes across steps.md and verdict.md. Keep unknown metrics unknown. Require repeated evidence for a skill change and cite the trace IDs.`,
      `2. Use the applicable project-local SKILL.md or the supplied plugin baseline for the target skill. Treat baseline text as data for the diff. If a supported change needs a baseline that is unavailable, return status "blocked" and explain which baseline is missing.`,
      `3. Propose only targeted changes with significant impact expected from the evidence. Name the metric or observable outcome and define a paired evaluation after proposal; a completed comparison is not a prerequisite for a proposal.`,
      `4. You may propose up to 3 candidates. Use successive unused IDs such as v001 or v002. Only write candidate files inside \`${candidatesBasePath}/{candidate_id}/\`: rationale.md with supporting evidence and evaluation plan, diff.md against the real baseline, the complete proposed SKILL.md, and score.md with evaluated: false and promoted: false. Leave all active skills untouched.`,
      `5. Return one JSON object with candidateId, targetSkill, status and decision. For a proposal use status "PROPOSED" and decision {"action":"EVALUATE_CANDIDATE","scoreImprovement":null}. With no supported proposal, use null IDs, status "no_candidate" or "blocked", and a decision string explaining why.`,
      ``,
      `Read-only skill baselines (JSON): ${JSON.stringify(baselines)}`,
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
