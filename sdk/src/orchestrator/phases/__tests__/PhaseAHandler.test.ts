
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
        });

        it('includes HIGH override rule when config.complexity is HIGH', async () => {
            mockContext.config = { ...mockContext.config, complexity: 'HIGH' };

            await handler.handle(Phase.PLANNING, mockContext);

            const invokedPrompt = mockContext.invokeAgent.mock.calls[0][0].prompt as string;
            expect(invokedPrompt).toContain("COMPLEXITY OVERRIDE: Classify as 'HIGH'");
        });

        it('omits COMPLEXITY OVERRIDE rule when config.complexity is undefined (AUTO)', async () => {
            mockContext.config = { ...mockContext.config, complexity: undefined };

            await handler.handle(Phase.PLANNING, mockContext);

            const invokedPrompt = mockContext.invokeAgent.mock.calls[0][0].prompt as string;
            expect(invokedPrompt).not.toContain('Evaluate scope complexity between \'LOW\' and \'HIGH\'');
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
    });

});
