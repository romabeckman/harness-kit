# 📖 HarnessKit: Usage Sequence Documentation

This collection of documents explains how you (developer) use all HarnessKit skills in a logical continuous optimization sequence.

---

## 📚 Documents Created

### 1. **[USER-WORKFLOW.md](USER-WORKFLOW.md)** — Complete Guide
**What is it:** Detailed explanation of how a developer follows the logical harness-kit sequence.

**Contains:**
- ✅ Flow 1: Normal Development (daily)
  - Stage 1: project-memory (context)
  - Stage 2: scope-refinement (DDD + design)
  - Stage 3: tdd-orchestrator (implementation)
  - Stage 4: the-grumpy-tech-lead (review)
  - Stage 5: harness-tracer (recording)
- ✅ Flow 2: Harness Optimization (meta-harness loop)
- ✅ Practical example: Register ADR and use in next sessions
- ✅ Decision matrix: which skill to use when
- ✅ Benefits of sequence vs ad-hoc development

**Read when:** You want to understand the complete flow.

---

### 2. **[ARCHITECTURE-3-LAYERS.md](ARCHITECTURE-3-LAYERS.md)** — Architectural View
**What is it:** 3-layer diagram showing how Developer, Skills, and Filesystem interact.

**Contains:**
- ✅ Layer 1: Developer (you)
- ✅ Layer 2: Skills (modules)
- ✅ Layer 3: Filesystem 𝒟 (storage)
- ✅ Feedback loop (feedback loop visual)
- ✅ Practical example: Complete 8-day cycle
- ✅ Gain: With vs without harness

**Read when:** You want to visualize the entire architecture.

---

### 3. **[PLAYBOOK-DAILY-USE.md](PLAYBOOK-DAILY-USE.md)** — Practical Checklist
**What is it:** Executable step-by-step guide for each task type.

**Contains:**
- ✅ Preparation checklist
- ✅ Flow 1: Implement new feature (step-by-step with code)
- ✅ Flow 2: Fix bug (step-by-step)
- ✅ Flow 3: Optimize harness (step-by-step)
- ✅ Quick decision matrix
- ✅ Timed example (09:00 to 10:05)
- ✅ Troubleshooting

**Read when:** You want to know exactly what to do now.

---

### 4. **[README.md](README.md)**

### If you're starting:
```
1. Read USER-WORKFLOW.md (30-40 min)
   → Understand complete flow
   
2. Read PLAYBOOK-DAILY-USE.md (10-15 min)
   → Know how to execute
   
3. Consult ARCHITECTURE-3-LAYERS.md (5 min)
   → When you have visual questions
```

### If you're implementing:
```
1. Read PLAYBOOK-DAILY-USE.md
   → Follow step-by-step
   
2. Consult USER-WORKFLOW.md
   → To understand why you do each thing
```

### If you want to teach others:
```
1. ARCHITECTURE-3-LAYERS.md (diagram)
2. USER-WORKFLOW.md (logical flow)
3. PLAYBOOK-DAILY-USE.md (how to execute)
```

---

## 🔑 Key Concepts

### HarnessKit: Continuous Optimization
**Principle:** Optimize "skills" (tools that govern development) through feedback from sessions.

**Components:**
- meta-harness (proposer: reads history and proposes improvements)
- docs/harness-history/ (filesystem: complete history)
- harness-tracer (records each session)
- harness-evaluator (analyzes patterns)
- pareto-frontier.md (best configurations)

---

## 📊 Flow in 1 Page

```
┌─────────────────────────────────────────────┐
│ DAY 1-5: Normal Development (5 sessions)    │
├─────────────────────────────────────────────┤
│ You: /harness-kit:project-memory            │
│       /harness-kit:scope-refinement         │
│       /harness-kit:tdd-orchestrator         │
│       /harness-kit:the-grumpy-tech-lead     │
│ [automatic] harness-tracer                  │
│       ↓ (each session creates session-*/  │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ DAY 6: Pattern Analysis                     │
├─────────────────────────────────────────────┤
│ You: /harness-kit:harness-evaluator         │
│       (analyzes 5 traces)                   │
│       → pareto-frontier.md (best)           │
│       → identifies "weak skill"             │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ DAY 7: Optimization (Improvement Loop)      │
├─────────────────────────────────────────────┤
│ You: /harness-kit:meta-harness              │
│       (reads 𝒟, diagnoses, proposes v001) │
│                                             │
│ You test v001 in practice                  │
│       (run modified skill)                  │
│       /harness-kit:harness-tracer           │
│                                             │
│ You validate:                               │
│       /harness-kit:harness-evaluator        │
│       (v001 improved? ✅ approved)          │
└─────────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────────┐
│ DAY 8+: Use Improved Version                │
├─────────────────────────────────────────────┤
│ skills/tdd-orchestrator/SKILL.md            │
│   ← v001/SKILL.md (better version)          │
│                                             │
│ Next sessions already use improved version  │
│ (automatic feedback loop)                   │
└─────────────────────────────────────────────┘

RESULT: Harness improved, score increased 0.08 points
```

---

## 🚀 Get Started Now

### Step 1: Read USER-WORKFLOW.md
```
Time: 30-40 min
Goal: Understand complete flow
```

### Step 2: Read PLAYBOOK-DAILY-USE.md
```
Time: 10-15 min
Goal: Know how to execute
```

### Step 3: Run your first session
```
/harness-kit:project-memory
/harness-kit:tdd-orchestrator
/harness-kit:harness-tracer
```

### Step 4: After 5 sessions
```
/harness-kit:harness-evaluator
/harness-kit:meta-harness
```

---

## 📞 Questions?

| Question | Answer in |
|----------|-----------|
| "Where do I start?" | PLAYBOOK-DAILY-USE.md |
| "What does each skill do?" | USER-WORKFLOW.md |
| "Which skill to use now?" | PLAYBOOK-DAILY-USE.md (Matrix) |
| "How does meta-harness work?" | USER-WORKFLOW.md (Flow 2) |
| "How long does it take?" | PLAYBOOK-DAILY-USE.md (Timeline) |
| "What's the architecture?" | ARCHITECTURE-3-LAYERS.md |
| "Got an error, how to fix?" | PLAYBOOK-DAILY-USE.md (Troubleshooting) |

---

## ✅ Checklist: Ready to Go?

Your HarnessKit is ready when:

- [ ] You have `docs/README.md`, `docs/adr/ARCHITECTURE.md`, `docs/adr/TESTS.md`
- [ ] You understand the difference between skills (tools) and chains (sequences)
- [ ] You know which skill to use for your next task
- [ ] You understand how harness-tracer records sessions
- [ ] You know what Pareto frontier is
- [ ] You understand the cycle: Develop → Trace → Evaluate → Optimize
- [ ] You've read at least one of the documents above

---

## 🎓 Summary in 2 Sentences

1. **Flow**: You run skills (`project-memory` → `scope-refinement` → `tdd-orchestrator` → `the-grumpy-tech-lead`).
2. **Loop**: Each session is recorded (`harness-tracer` → `docs/harness-history/`). After 5 sessions, `meta-harness` detects patterns and proposes improvements (`harness-evaluator` → `meta-harness` → `candidates/vXXX/`).

**Result**: Skills evolve with data, not guesswork.

---

**Date**: May 2026
