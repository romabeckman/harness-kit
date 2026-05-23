# HarnessKit: 3-Layer Architecture

**Continuous Development Optimization System**

```
┌─────────────────────────────────────────────────────────────────────────────┐
                          DEVELOPER (You)                                    
├─────────────────────────────────────────────────────────────────────────────┤
                                                                             
  Day 1: Coupon Feature                                                      
  ├─ /harness-kit:project-memory          → docs/adr/ created                
  ├─ /harness-kit:scope-refinement        → docs/specs/coupon-sys/           
  ├─ /harness-kit:tdd-orchestrator        → code + tests ✅                  
  ├─ /harness-kit:the-grumpy-tech-lead    → 5 open-points resolved           
  └─ [automatic] /harness-kit:harness-tracer → session-2026-05-22-001/        
                                                                             
  Day 2: Validation Bug                                                      
  ├─ /harness-kit:tdd-orchestrator        → test + fix                       
  ├─ /harness-kit:the-grumpy-tech-lead    → 3 open-points                    
  └─ [automatic] harness-tracer → session-2026-05-22-002/                   
                                                                             
  Day 3: Coupon Cache                                                        
  ├─ /harness-kit:project-memory          → REDIS-COUPON-CACHE.md            
  ├─ /harness-kit:tdd-orchestrator        → implementation                   
  ├─ /harness-kit:the-grumpy-tech-lead    → 7 open-points                    
  └─ [automatic] harness-tracer → session-2026-05-22-003/                    
                                                                             
  [... 2 more sessions ... ]                                                 
                                                                             
  Day 8: Analyze What We Learned                                             
  ├─ /harness-kit:harness-evaluator       → Analyzes 5 traces                
    Result: "early tech-lead review improves score"                         
                                                                            
  ├─ /harness-kit:meta-harness            → Proposes v001 of tdd-orch        
                                                                            
  └─ [You test v001] + harness-tracer → session-2026-05-22-006/              
     Result: Score 0.85 → 0.91 ✅ APPROVED                                   
                                                                             
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
                            SKILLS (Modules)                                 
├─────────────────────────────────────────────────────────────────────────────┤
                                                                             
  📚 project-memory                                                          
     ├─ Detects stack                                                        
     ├─ Creates/updates docs/ (README.md, ARCHITECTURE.md, TESTS.md)         
     └─ Output: Documentation structured in English                          
                                                                             
  🎯 scope-refinement                                                        
     ├─ DDD: Problem Space                                                   
     ├─ DDD: Context Map                                                     
     ├─ DDD: Tactical Design                                                 
     └─ Output: docs/specs/{domain}/ with test scenarios                     
                                                                             
  ✅ tdd-orchestrator                                                        
     ├─ RED: Writes failing tests                                            
     ├─ GREEN: Implements minimum to pass                                    
     ├─ REFACTOR: Cleans and improves                                        
     ├─ Invokes: test-driven-development (sub-skill)                         
     └─ Output: 100% tested code                                             
                                                                             
  🔍 the-grumpy-tech-lead                                                    
     ├─ Questions (Socratically)                                             
     ├─ Identifies: N+1, race conditions, SOLID violations                   
     ├─ Raises: Open Points (without providing solutions)                     
     └─ Output: "Have you considered X?"                                     
                                                                             
  📝 harness-tracer                                                          
     ├─ Records: metadata.md (which skill, agent, task)                      
     ├─ Records: steps.md (actions taken)                                    
     ├─ Records: score.md (raw metrics)                                      
     ├─ Records: verdict.md (self-evaluation)                                
     └─ Output: docs/harness-history/traces/session-*/                       
                                                                             
  📊 harness-evaluator                                                       
     ├─ Reads all traces                                                     
     ├─ Groups by skill_chain                                                
     ├─ Computes composite scores                                            
     ├─ Identifies Pareto frontier                                           
     └─ Output: docs/harness-history/pareto-frontier.md                      
                                                                             
  💡 meta-harness                                                            
     ├─ Reads complete history (filesystem 𝒟)                                
     ├─ Diagnosis: "Which skill causes sessions to fail?"                    
     ├─ Proposes: ONE focused change to the problematic skill                
     ├─ Creates: candidates/vXXX/ with rationale + modified SKILL.md         
     └─ Output: Testable candidate for improvement                           
                                                                             
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
                    FILESYSTEM 𝒟 (Harness History)                           
├─────────────────────────────────────────────────────────────────────────────┤
                                                                             
  docs/harness-history/                                                      
                                                                             
  ├─ config.md                        ← Scoring weights                      
  ├─ baseline.md                      ← Current configuration                 
  ├─ pareto-frontier.md               ← Best configs                     
                                                                          
  ├─ traces/                          ← Execution history                 
    ├─ session-2026-05-22-001/                                         
      ├─ metadata.md                skill_used: tdd-orchestrator      
      ├─ input.md                   task, starting state              
      ├─ steps.md                   actions: RED → GREEN → REFACTOR   
      ├─ score.md                   tdd_cycles: 3, iterations: 2     
      └─ verdict.md                 "Well structured, but..."         
                                                                        
    ├─ session-2026-05-22-002/                                         
      └─ [same structure]                                             
                                                                        
    └─ ... 3 more sessions ...                                         
                                                                          
  └─ candidates/                      ← Improvement proposals             
     ├─ v001/                                                             
       ├─ rationale.md               "Why did we change skill X?"      
       └─ SKILL.md                   Modified version of tdd-orch     
                                                                         
     └─ v002/                         [if v001 is rejected]              
        ├─ rationale.md               Different hypothesis              
        └─ SKILL.md                   Another variation                 
                                                                             
  Example score metric:                                                    
  ──────────────────────────────────────────────────────────────────────   
  session-2026-05-22-001:                                                 
    tdd_cycles = 3          (3 times RED→GREEN→REFACTOR)                 
    iterations = 2          (2 runs until everything passes)             
    grumpy_points = 5       (5 open-points raised)                       
    context_docs = 3        (3 docs read)                                
    deviations = 0          (0 steps skipped)                            
                                                                             
    composite_score = (3 + 2*5 + 3) / (1 + 5 + 3) = 0.82                
                                                                             
  Pareto frontier (after evaluator):                                       
  ──────────────────────────────────────────────────────────────────────   
  Chain 1: project-memory → tdd → tech-lead                               
           mean_score: 0.82, best: 0.91, consistency: σ=0.8              
           → Recommended for next session                                 
                                                                             
  Chain 2: scope-refinement → tdd → tech-lead                             
           mean_score: 0.71, best: 0.84, consistency: σ=1.2              
           → Alternative if context is architectural                      
                                                                             
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Feedback Loop (Feedback Loop)

```
PHASE 1: Normal Development
┌──────────────────────────────────────────────────────┐
 You run tdd-orchestrator (+ other skills)           
         ↓                                            
 harness-tracer records everything in traces/session-*
         ↓                                            
 File created with score.md (raw metrics)            
└──────────────────────────────────────────────────────┘
                         ↓
PHASE 2: Analysis (every 5-10 sessions)
┌──────────────────────────────────────────────────────┐
 You run harness-evaluator                           
         ↓                                            
 Reads all traces/ and computes composites           
         ↓                                            
 Generates pareto-frontier.md (config ranking)       
         ↓                                            
 Identifies: "Which skill caused worst sessions?"   
└──────────────────────────────────────────────────────┘
                         ↓
PHASE 3: Optimization
┌──────────────────────────────────────────────────────┐
 meta-harness reads history (filesystem 𝒟)           
         ↓                                            
 Diagnosis: "Problem is in tdd-orchestrator"        
            (late tech-lead review hurts score)     
         ↓                                            
 Proposes: candidates/v001/SKILL.md (new version)   
         ↓                                            
 You test v001 in practice                          
         ↓                                            
 harness-tracer records result                       
└──────────────────────────────────────────────────────┘
                         ↓
PHASE 4: Validation
┌──────────────────────────────────────────────────────┐
 harness-evaluator runs again                        
         ↓                                            
 Score of v001 vs baseline:                         
   Baseline: 0.82                                    
   v001: 0.91                                        
         ↓                                            
 ✅ APPROVED → v001 becomes new baseline            
                                                     
 (or ❌ REJECTED → meta-harness proposes v002)     
└──────────────────────────────────────────────────────┘
                         ↓
Next development session already uses v001 (improved)
```

---

## Correspondence: Concepts ↔ Implementation

| Concept | HarnessKit |
|---|---|
| **Goal**: Find optimal configuration | **Goal**: Find skill_chain with best mean_score |
| **Proposer (agent)** | `meta-harness` skill |
| **Filesystem (history)** | `docs/harness-history/` |
| **Selective history reading** | `meta-harness` reads filesystem in phases |
| **Execution trace** | `steps.md` in each session |
| **Score** | `score.md` (composite score) |
| **Configuration** | SKILL.md (file with instructions) |
| **Population of candidates** | Baseline skills + candidates/vXXX/ |
| **Pareto frontier** | `pareto-frontier.md` |
| **Initialization** | harness-tracer creates folder structure |
| **Evaluated execution** | You run skill, record trace |
| **Result storage** | harness-tracer persists session-* |
| **Iterations** | You run skill multiple times |
| **Proposals** | meta-harness proposes v001, v002, ... |

---

## Complete Cycle Example (8 Days)

```
DAY 1 - FEATURE: Discount Coupon
─────────────────────────────────
You: /harness-kit:project-memory
      /harness-kit:scope-refinement (DDD coupon context)
      /harness-kit:tdd-orchestrator (RED → GREEN → REFACTOR: 3 cycles)
      /harness-kit:the-grumpy-tech-lead (5 open-points)
      [automatic] harness-tracer
      
Score recorded: tdd_cycles=3, iterations=2, grumpy_points=5
mean_score: 0.82 ✅

DAY 2 - BUG: Validation allows expired coupon
──────────────────────────────────────────────
You: /harness-kit:tdd-orchestrator (RED → GREEN: 1 cycle)
      /harness-kit:the-grumpy-tech-lead (3 open-points: cache, TTL, sync)
      [automatic] harness-tracer

Score: tdd_cycles=1, iterations=1, grumpy_points=3
mean_score: 0.85 ✅

DAY 3 - FEATURE: Redis Cache
──────────────────────────────
You: /harness-kit:project-memory (creates REDIS-COUPON-CACHE.md ADR)
      /harness-kit:tdd-orchestrator (RED → GREEN → REFACTOR: 4 cycles)
      /harness-kit:the-grumpy-tech-lead (7 open-points: fallback, sync, TTL)
      [automatic] harness-tracer

Score: tdd_cycles=4, iterations=3, grumpy_points=7
mean_score: 0.78 (more complex, but expected)

DAY 4-6 - More sessions...
────────────────────────────
[3 more sessions with small features]

average 5 sessions: 0.81

DAY 7 - ANALYSIS (Optimization)
────────────────────────────────
You: /harness-kit:harness-evaluator

Result:
  Chain: project-memory → tdd-orchestrator → the-grumpy-tech-lead
  n=5, mean=0.81, best=0.85, worst=0.78

  Hypothesis from verdict.md:
  - Session with grumpy_points=7 (day 3) took longer
  - Session with grumpy_points=3 (day 2) was fast
  
  → Problem: Late review makes session drag

You: /harness-kit:meta-harness

Proposal v001:
  Modify tdd-orchestrator to invoke the-grumpy-tech-lead
  AFTER first cycle (not at the end)
  
You test v001:
  /harness-kit:tdd-orchestrator [uses v001/SKILL.md]
  Result: Resolved points earlier, cycles were more focused
  [automatic] harness-tracer

v001 test score:
  tdd_cycles=3, iterations=1 (more efficient!), grumpy_points=4
  mean_score: 0.89 ✅ (improvement of 0.08 points)

DAY 8 - VALIDATION
──────────────────
You: /harness-kit:harness-evaluator [runs again with 6 sessions]

Result:
  Baseline chain: mean=0.81
  v001 chain: mean=0.89 ← WINNER
```
