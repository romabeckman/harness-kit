# The `hrns diagnose` command

`hrns diagnose` recovers evidence from Harness Kit sessions and helps identify improvements to the development process. It has two related but distinct uses: analyzing traces to propose skill changes and, when requested, analyzing Project Dreaming episodes to record local test hypotheses.

The command examines saved history. It does not run application tests or confirm on its own that a hypothesis improves a delivery.

## What the command analyzes

### Sessions and traces

During an orchestrator run, planning, development, and review sessions can be recorded for diagnosis. `hrns diagnose` processes pending sessions, usually in batches of three, and asks the runner to reconstruct their traces under `docs/harness-history/traces/`. The SDK checks that each trace contains the expected information and matches its source session. If recording fails, the session remains pending for a later retry.

When at least three complete traces are available, the flow can also ask Meta-Harness to propose a skill improvement. This proposal is separate from Project Dreaming hypotheses. Evaluation and application happen in the candidate workflow; `diagnose` does not change a skill automatically.

### Project Dreaming episodes

Add `--project-dreaming` to examine closed development episodes and their linked rework attempts. The SDK gathers evidence for each owning project, including eligible traces, cited tests, and review signals. The goal is to identify a concrete decision about how to select, order, or reuse tests and record a hypothesis that can be evaluated on another task.

An episode is a saved record of development work and its review. A hypothesis proposes a test-selection improvement to evaluate; it is not yet an instruction for future work.

The result can be:

- `recorded`: one or more hypotheses were created, updated, or reconciled, and the SDK verified the records before saving the receipt.
- `no_hypothesis`: the sources were inspected but do not support a distinct test decision; the result includes a reason.
- `incomplete`: a required source, valid trace, or verifiable runner response was missing. The analysis remains pending and can be retried.
- `historical_unknown`: an older episode was marked as processed but has no receipt explaining its earlier result.

A recorded hypothesis is not yet guidance for the next TDD cycle. It needs independent evaluation on a distinct task. Only a validated hypothesis can proceed to publication in the feature documentation.

## When to use it

- Use `hrns diagnose` to process pending sessions and create or update traces. The Meta-Harness flow can also propose a skill improvement when enough traces are available.
- Use `hrns diagnose --project-dreaming` after development to capture local learning about test decisions, including from a delivery that passed on the first attempt.
- Use targeted reanalysis when you know which project and episode to recover, such as an episode with an unknown historical result or one with newly available evidence.

Run the commands from the orchestrator workspace root, where Harness Kit keeps `docs/product/` and `docs/harness-history/`. The selected project must be configured in that workspace. The runner must be installed and authenticated; pass `--agent` to select it without opening the interactive selector. `--model` and `--effort` can override the runner settings for that run.

## How to use it

Process pending sessions and traces:

```sh
hrns diagnose --agent <runner>
```

Replace `<runner>` with your installed runner, such as `codex-cli` or `claude-cli`. Batches contain three sessions by default; use `--batch-size <number>` to change their size, for example `hrns diagnose --batch-size 6 --agent codex-cli`.

Process sessions and also analyze eligible Project Dreaming episodes:

```sh
hrns diagnose --project-dreaming --agent <runner>
```

Reanalyze one episode for a specific project:

```sh
hrns diagnose --project-dreaming --dreaming-project <project-path> --dreaming-episode <episode-id> --agent <runner>
```

`--dreaming-project` and `--dreaming-episode` must be used together. The path can be relative to the workspace root or absolute, and must resolve to the owning project's root. For example, if the workspace contains the `sdk` project:

```sh
hrns diagnose --project-dreaming --dreaming-project sdk --dreaming-episode <episode-id> --agent <runner>
```

The ID must belong to an episode under `docs/product/project-dreaming/episodes/`. Find it in the episode record or in a previous diagnosis summary. It is not the hypothesis ID, which identifies a file under `docs/harness-history/learning/active/` or `docs/harness-history/learning/archived/`.

## Reading the result

The summary reports how many sessions were processed and how many Project Dreaming episodes were recorded, left pending, or produced no hypothesis. For targeted results, also check the project, episode, and reason shown in the terminal.

A pending analysis usually means that no complete trace linked to the episode was available or a required source could not be verified. Fix or provide the source and run the command again. The command also processes pending diagnosis sessions; episode filters limit Project Dreaming, but do not isolate the rest of `diagnose` processing.

## What this flow does not do

Project Dreaming collects evidence and formulates or reconciles hypotheses. It does not compare a baseline with a variant, validate a RED gain, or publish guidance. Evaluation must use a distinct task and criteria defined before comparison. After validation, guidance is published in the owning feature's `RED guidance` section; TDD must not use it before that confirmation.
