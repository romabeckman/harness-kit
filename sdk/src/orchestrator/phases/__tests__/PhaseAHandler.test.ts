
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PhaseAHandler } from '../PhaseAHandler';
import { Phase } from '../../types';
import { Context } from '../../context/Context';
import { ContextFSM } from '../../context-fsm/ContextFSM';

describe('PhaseAHandler', () => {
    let handler: PhaseAHandler;
    let mockContext: Context;
    let mockFsm: ContextFSM;

    beforeEach(() => {
        mockFsm = {
            loadBacklog: vi.fn().mockReturnValue([{ id: 'F001', domain: 'hello_world_cli', dependencies: [] }]),
            updateFeatureStatus: vi.fn(),
            loadDevelopmentState: vi.fn().mockReturnValue([]),
            appendTasks: vi.fn(),
            loadBootstrapConfig: vi.fn().mockReturnValue({ steeringRules: [] }),
            saveBootstrapConfig: vi.fn(),
        } as unknown as ContextFSM; // Cast to unknown to allow partial mock

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
        } as unknown as Context; // Cast to unknown to allow partial mock

        handler = new PhaseAHandler();
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
            mockFsm.loadDevelopmentState.mockReturnValueOnce(mockTasks.map(t => ({
                featureId: 'F001',
                taskId: t.taskId,
                project: 'project',
                description: t.description,
                domain: 'hello_world_cli',
                currentPhase: '-' as const,
                status: 'NOT_STARTED' as const,
            })));
            return undefined; // simulate invokeAgent resolving
        });

        const result = await handler.handle(Phase.PHASE_A, mockContext);

        expect(result).not.toBe(Phase.HALTED); // Should not halt

        expect(mockContext.extractTasksFromTacticalDesign).toHaveBeenCalledTimes(1);
        expect(mockContext.invokeAgent).toHaveBeenCalledTimes(1);
        expect(mockFsm.appendTasks).toHaveBeenCalledWith([
            expect.objectContaining({ taskId: 'T001', description: 'Task 1', featureId: 'F001', domain: 'hello_world_cli', project: '-', status: 'NOT_STARTED' }),
            expect.objectContaining({ taskId: 'T002', description: 'Task 2', featureId: 'F001', domain: 'hello_world_cli', project: '-', status: 'NOT_STARTED' }),
        ]);
    });

    // Test to ensure it does not append tasks if already existing
    it('should not append tasks if existing tasks are found for the feature', async () => {
        mockFsm.loadDevelopmentState.mockReturnValueOnce([
            { featureId: 'F001', taskId: 'T001', description: 'Existing Task', domain: 'hello_world_cli', project: 'project', status: 'NOT_STARTED' }
        ]);

        const result = await handler.handle(Phase.PHASE_A, mockContext);

        expect(result).not.toBe(Phase.HALTED);
        expect(mockContext.extractTasksFromTacticalDesign).not.toHaveBeenCalled();
        expect(mockFsm.appendTasks).not.toHaveBeenCalled();
    });

    // Test to ensure it halts if no active feature is found
    it('should halt if no active feature is found', async () => {
        mockContext.getActiveFeature.mockReturnValueOnce(null);

        const result = await handler.handle(Phase.PHASE_A, mockContext);

        expect(result).toBe(Phase.HALTED);
        expect(mockFsm.appendTasks).not.toHaveBeenCalled();
    });

});
