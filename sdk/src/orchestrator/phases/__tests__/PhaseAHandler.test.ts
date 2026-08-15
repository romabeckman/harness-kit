
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PlanningHandler } from '../PlanningHandler';
import { Phase } from '../../types';

describe('PlanningHandler', () => {
    let handler: PlanningHandler;
    let mockContext: any;
    let mockFsm: any;

    beforeEach(() => {
        mockFsm = {
            loadBacklog: vi.fn().mockReturnValue([{ id: 'F001', domain: 'hello_world_cli', dependencies: [] }]),
            updateFeatureStatus: vi.fn(),
            loadDevelopmentState: vi.fn().mockReturnValue([]),
            appendTasks: vi.fn(),
            loadBootstrapConfig: vi.fn().mockReturnValue({ steeringRules: [] }),
            saveBootstrapConfig: vi.fn(),
            appendDecision: vi.fn(),
            existScope: vi.fn().mockReturnValue(true),
            loadScope: vi.fn().mockReturnValue('test scope'),
            existRefinement: vi.fn().mockReturnValue(false),
            loadRefinement: vi.fn().mockReturnValue(''),
        };


        mockContext = {
            workingDir: '/test/working-dir',
            fsm: mockFsm,
            getActiveFeature: vi.fn().mockReturnValue({ id: 'F001', domain: 'hello_world_cli', dependencies: [] }),
            config: {
                projectPaths: ['/test/project'],
                scope: 'test scope',
            },
            extractTasksFromTacticalDesign: vi.fn(),
            invokeAgent: vi.fn().mockResolvedValue(undefined),
            updateState: vi.fn(),
            checkSpecFilesPresent: vi.fn().mockReturnValue(true),
        };

        handler = new PlanningHandler();
    });

    it('should successfully append tasks after recovery via agent if initial extraction fails', async () => {
        const mockTasks = [
            { taskId: 'T001', description: 'Task 1' },
            { taskId: 'T002', description: 'Task 2' },
        ];

        // First call to extractTasksFromTacticalDesign returns empty, simulating initial failure
        mockContext.extractTasksFromTacticalDesign.mockReturnValueOnce([]);

        // When invokeAgent is called, it simulates the agent writing to DEVELOPMENT-STATE.md
        // so that the next call to loadDevelopmentState returns the mock tasks.
        mockContext.invokeAgent.mockImplementationOnce(async () => {
            mockFsm.loadDevelopmentState.mockReturnValueOnce(mockTasks.map((t: any) => ({
                featureId: 'F001',
                taskId: t.taskId,
                project: 'project',
                description: t.description,
                domain: 'hello_world_cli',
                currentPhase: '-' as const,
                status: 'NOT_STARTED' as const,
            })));
            return undefined;
        });

        const result = await handler.handle(Phase.PLANNING, mockContext);

        expect(result).not.toBe(Phase.HALTED);

        expect(mockContext.extractTasksFromTacticalDesign).toHaveBeenCalledTimes(1);
        expect(mockContext.invokeAgent).toHaveBeenCalledTimes(1);
        // Recovery path: agent writes directly to DEVELOPMENT-STATE.md, appendTasks is not called
        expect(mockFsm.appendTasks).not.toHaveBeenCalled();
    });

    it('should not append tasks if existing tasks are found for the feature', async () => {
        mockFsm.loadDevelopmentState.mockReturnValueOnce([
            { featureId: 'F001', taskId: 'T001', description: 'Existing Task', domain: 'hello_world_cli', project: 'project', status: 'NOT_STARTED' }
        ]);

        const result = await handler.handle(Phase.PLANNING, mockContext);

        expect(result).not.toBe(Phase.HALTED);
        expect(mockContext.extractTasksFromTacticalDesign).not.toHaveBeenCalled();
        expect(mockFsm.appendTasks).not.toHaveBeenCalled();
    });

    it('should halt if no active feature is found', async () => {
        mockContext.getActiveFeature.mockReturnValueOnce(null);

        const result = await handler.handle(Phase.PLANNING, mockContext);

        expect(result).toBe(Phase.HALTED);
        expect(mockFsm.appendTasks).not.toHaveBeenCalled();
    });

    describe('complexity override in scope-refinement prompt', () => {
        beforeEach(() => {
            mockContext.checkSpecFilesPresent = vi.fn().mockReturnValue(false);
            mockContext.extractTasksFromTacticalDesign = vi.fn().mockReturnValue([
                { taskId: 'T001', description: 'Task', file: 'project' },
            ]);
        });

        it('includes LOW override rule when config.complexity is LOW', async () => {
            mockContext.config = { ...mockContext.config, complexity: 'LOW' };

            await handler.handle(Phase.PLANNING, mockContext);

            const invokedPrompt = mockContext.invokeAgent.mock.calls[0][0].prompt as string;
            expect(invokedPrompt).toContain("COMPLEXITY OVERRIDE: Classify as 'LOW'");
            expect(invokedPrompt).toContain('all required 001–004 artifacts');
            expect(invokedPrompt).not.toContain('the-grumpy-tech-lead');
            expect(mockContext.invokeAgent.mock.calls[0][0].phaseKey).toBe('planning');
        });

        it('includes HIGH override rule when config.complexity is HIGH', async () => {
            mockContext.config = { ...mockContext.config, complexity: 'HIGH' };

            await handler.handle(Phase.PLANNING, mockContext);

            const invokedPrompt = mockContext.invokeAgent.mock.calls[0][0].prompt as string;
            expect(invokedPrompt).toContain("COMPLEXITY OVERRIDE: Classify as 'HIGH'");
            expect(invokedPrompt).toContain('integrations, failure modes, security boundaries, concurrency, and compatibility risks');
            expect(invokedPrompt).not.toContain('the-grumpy-tech-lead');
        });

        it('uses AUTO complexity evaluation when config.complexity is undefined', async () => {
            mockContext.config = { ...mockContext.config, complexity: undefined };

            await handler.handle(Phase.PLANNING, mockContext);

            const invokedPrompt = mockContext.invokeAgent.mock.calls[0][0].prompt as string;
            expect(invokedPrompt).toContain('Evaluate scope complexity between \'LOW\' and \'HIGH\'');
            expect(invokedPrompt).not.toContain('COMPLEXITY OVERRIDE');
        });

        it('limits only 001 and 002 output documents to INLINE_THRESHOLD characters', async () => {
            mockContext.checkSpecFilesPresent = vi.fn().mockReturnValue(false);
            mockContext.extractTasksFromTacticalDesign = vi.fn().mockReturnValue([
                { taskId: 'T001', description: 'Task', file: 'project' },
            ]);

            await handler.handle(Phase.PLANNING, mockContext);

            const invokedPrompt = mockContext.invokeAgent.mock.calls[0][0].prompt as string;
            const outputLines = invokedPrompt.split('\n');
            const problemSpaceLine = outputLines.find((line) => line.includes('001-problem-space.md'));
            const contextMapLine = outputLines.find((line) => line.includes('002-context-map.md'));
            const tacticalDesignLine = outputLines.find((line) => line.includes('003-${PROJECT_NAME}-tactical-design.md'));
            const testScenariosLine = outputLines.find((line) => line.includes('004-${PROJECT_NAME}-test-scenarios.md'));

            expect(problemSpaceLine).toContain('maximum 5000 characters');
            expect(contextMapLine).toContain('maximum 5000 characters');
            expect(tacticalDesignLine).not.toContain('maximum 5000 characters');
            expect(testScenariosLine).not.toContain('maximum 5000 characters');
        });

        it('reloads latest scope from SCOPE.md via fsm.loadScope', async () => {
            mockFsm.existScope.mockReturnValue(true);
            mockFsm.loadScope.mockReturnValue('updated scope from SCOPE.md');

            await handler.handle(Phase.PLANNING, mockContext);

            expect(mockContext.config.scope).toBe('updated scope from SCOPE.md');
        });

        it('throws error if SCOPE.md does not exist', async () => {
            mockFsm.existScope.mockReturnValue(false);

            await expect(handler.handle(Phase.PLANNING, mockContext)).rejects.toThrow('Scope file (SCOPE.md) does not exist');
        });

        it('throws error if SCOPE.md is empty', async () => {
            mockFsm.existScope.mockReturnValue(true);
            mockFsm.loadScope.mockReturnValue('');

            await expect(handler.handle(Phase.PLANNING, mockContext)).rejects.toThrow('Scope file (SCOPE.md) is empty');
        });

        it('injects refinement_context in prompt when existRefinement is true', async () => {
            mockFsm.existRefinement = vi.fn().mockReturnValue(true);
            mockFsm.loadRefinement = vi.fn().mockReturnValue('# Refinement Content\n- Decision 1');

            await handler.handle(Phase.PLANNING, mockContext);

            const invokedPrompt = mockContext.invokeAgent.mock.calls[0][0].prompt as string;
            expect(invokedPrompt).toContain('<refinement_context>');
            expect(invokedPrompt).toContain('# Refinement Content\n- Decision 1');
        });
    });

    describe('developer session management', () => {
        beforeEach(() => {
            mockContext.checkSpecFilesPresent = vi.fn().mockReturnValue(false);
            mockContext.extractTasksFromTacticalDesign = vi.fn().mockReturnValue([
                { taskId: 'T001', description: 'Task', file: 'project' },
            ]);
            mockContext.getDeveloperSession = vi.fn();
            mockContext.setDeveloperSession = vi.fn();
        });

        it('queries session ignoring featureId (passing empty string / no specific feature) and uses full prompt when no session exists', async () => {
            mockContext.getDeveloperSession.mockReturnValue(undefined);
            mockContext.invokeAgent.mockResolvedValue({
                success: true,
                session: { id: 'PLANNING-SESSION-1' },
                raw: '',
            });

            await handler.handle(Phase.PLANNING, mockContext);

            expect(mockContext.getDeveloperSession).toHaveBeenCalledWith(
                'harness-kit:software-architect',
                undefined,
                Phase.PLANNING
            );

            const invokeCall = mockContext.invokeAgent.mock.calls[0][0];
            expect(invokeCall.session).toBeUndefined();
            expect(invokeCall.prompt).toContain('<scope>');
            expect(invokeCall.prompt).toContain('test scope');
            expect(invokeCall.prompt).toContain('<project_paths>');

            expect(mockContext.setDeveloperSession).toHaveBeenCalledWith({
                featureId: '',
                agent: 'harness-kit:software-architect',
                session: { id: 'PLANNING-SESSION-1' },
                phase: Phase.PLANNING,
            });
        });

        it('uses feature-focused prompt and passes session when developer session exists', async () => {
            const existingSession = { id: 'PLANNING-SESSION-1' };
            mockContext.getDeveloperSession.mockReturnValue(existingSession);
            mockContext.invokeAgent.mockResolvedValue({
                success: true,
                session: { id: 'PLANNING-SESSION-2' },
                raw: '',
            });

            await handler.handle(Phase.PLANNING, mockContext);

            expect(mockContext.getDeveloperSession).toHaveBeenCalledWith(
                'harness-kit:software-architect',
                undefined,
                Phase.PLANNING
            );

            const invokeCall = mockContext.invokeAgent.mock.calls[0][0];
            expect(invokeCall.session).toEqual(existingSession);
            // Feature-focused prompt should contain target feature and outputs but not full scope markdown dump
            expect(invokeCall.prompt).toContain('<target_feature>');
            expect(invokeCall.prompt).toContain('ID: F001');
            expect(invokeCall.prompt).toContain('<project_paths>');
            expect(invokeCall.prompt).toContain('PROJECT NAME RULE');
            expect(invokeCall.prompt).not.toContain('<scope>');

            expect(mockContext.setDeveloperSession).toHaveBeenCalledWith({
                featureId: '',
                agent: 'harness-kit:software-architect',
                session: { id: 'PLANNING-SESSION-2' },
                phase: Phase.PLANNING,
            });
        });

        it('supports buildFeatureScopeRefinementPrompt with LOW complexity override', async () => {
            mockContext.config = { ...mockContext.config, complexity: 'LOW' };
            mockContext.getDeveloperSession.mockReturnValue({ id: 'PREV-SESSION' });

            await handler.handle(Phase.PLANNING, mockContext);

            const invokedPrompt = mockContext.invokeAgent.mock.calls[0][0].prompt as string;
            expect(invokedPrompt).toContain("COMPLEXITY OVERRIDE: Classify as 'LOW'");
            expect(invokedPrompt).toContain('<target_feature>');
            expect(invokedPrompt).toContain('PROJECT NAME RULE');
            expect(invokedPrompt).not.toContain('<scope>');
        });
    });

});
