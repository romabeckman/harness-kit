import { describe, it, expect, vi } from 'vitest';
import { SteeringAnalyzer, type SteeringAction } from '../../src/orchestrator/SteeringAnalyzer';
import type { IAgentRunner } from '../../src/agent-runner/IAgentRunner';

// Value Object pattern representation for Steering Directives as per 004 spec
export interface SteeringDirective {
  readonly action: 'rollback' | 'add_rule' | 'override_score';
  readonly targetPhase?: string;
  readonly rules?: string[];
}

export function createSteeringDirective(
  action: 'rollback' | 'add_rule' | 'override_score',
  targetPhase?: string,
  rules?: string[]
): SteeringDirective {
  const validPhases = ['BOOTSTRAP', 'PLANNING', 'DEVELOPMENT', 'REVIEW', 'MEMORY'];
  if (action === 'rollback' && targetPhase && !validPhases.includes(targetPhase)) {
    throw new Error(`Invalid target phase: ${targetPhase}`);
  }
  return Object.freeze({
    action,
    targetPhase,
    rules: rules ? Object.freeze([...rules]) as unknown as string[] : undefined,
  });
}

export function areSteeringDirectivesEqual(a: SteeringDirective, b: SteeringDirective): boolean {
  if (a.action !== b.action || a.targetPhase !== b.targetPhase) return false;
  if (!a.rules && !b.rules) return true;
  if (!a.rules || !b.rules) return false;
  if (a.rules.length !== b.rules.length) return false;
  return a.rules.every((rule, idx) => rule === b.rules![idx]);
}

describe('Steering Analyzer Unit Tests', () => {
  it('Should parse rollback directive into state mutation instruction when given rollback to PLANNING', async () => {
    const mockRunner: IAgentRunner = {
      run: vi.fn().mockResolvedValue({
        raw: '```json\n[{"type": "rollback", "targetPhase": "PLANNING"}]\n```',
        exitCode: 0,
      }),
    };

    const actions = await SteeringAnalyzer.analyze('rollback to PLANNING', mockRunner);
    expect(actions).toEqual([{ type: 'rollback', targetPhase: 'PLANNING' }]);
    expect(mockRunner.run).toHaveBeenCalledOnce();
  });

  it('Should parse rule injection directive into rule payload list when given add rule: use Zod', async () => {
    const mockRunner: IAgentRunner = {
      run: vi.fn().mockResolvedValue({
        raw: '```json\n[{"type": "add_rule", "rule": "use Zod"}]\n```',
        exitCode: 0,
      }),
    };

    const actions = await SteeringAnalyzer.analyze('add rule: use Zod', mockRunner);
    expect(actions).toEqual([{ type: 'add_rule', rule: 'use Zod' }]);
  });

  it('Should reject malformed steering directive strings without mutating state', async () => {
    const mockRunner: IAgentRunner = {
      run: vi.fn().mockResolvedValue({
        raw: 'invalid non-json output',
        exitCode: 0,
      }),
    };

    const actions = await SteeringAnalyzer.analyze('invalid string', mockRunner);
    expect(actions).toEqual([]);
  });
});

describe('Steering Directive Value Object Unit Tests', () => {
  it('Should create Steering Directive successfully when action verb and target phase are valid', () => {
    const directive = createSteeringDirective('rollback', 'PLANNING');
    expect(directive.action).toBe('rollback');
    expect(directive.targetPhase).toBe('PLANNING');
  });

  it('Should consider two Steering Directives equal when they share identical target phase and injected rules', () => {
    const d1 = createSteeringDirective('add_rule', undefined, ['use Zod']);
    const d2 = createSteeringDirective('add_rule', undefined, ['use Zod']);
    const d3 = createSteeringDirective('add_rule', undefined, ['use TypeScript']);

    expect(areSteeringDirectivesEqual(d1, d2)).toBe(true);
    expect(areSteeringDirectivesEqual(d1, d3)).toBe(false);
  });

  it('Should remain immutable after creation', () => {
    const directive = createSteeringDirective('rollback', 'PLANNING', ['use Zod']);
    expect(Object.isFrozen(directive)).toBe(true);
    expect(() => {
      (directive as any).targetPhase = 'DEVELOPMENT';
    }).toThrow();
  });
});
