import { ProjectStateService } from '../ProjectStateService';
import * as fs from 'fs';
import * as path from 'path';

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
vi.mock('fs');

const MOCK_TDD_FILE_CONTENT = `
# 003 — Tactical Design: temp-test
**Domain:** \`hello_world_cli\`
**Project:** \`temp-test\`
**Date:** 2026-06-30

---

## Section 5 — Constraints

- No third-party packages — stdlib only
- No CLI argument parsing
- No configuration files
- Single file: \`main.py\`
- Python 3.x compatible

---

## Section 6 — Ordered Development Tasks

\`\`\`json
[
  {
    "id": 1,
    "title": "Create main.py with failing test hook",
    "description": "Create main.py containing only a stub main() function that does nothing. Write test_main.py that imports main and asserts print was called with 'Hello, World!'. Test must FAIL at this stage.",
    "tdd_phase": "RED",
    "files_affected": ["main.py", "test_main.py"],
    "acceptance": "pytest test_main.py exits non-zero"
  },
  {
    "taskId": 2,
    "title": "Implement greeting in main()",
    "description": "Add print('Hello, World!') inside main(). Add if __name__ == '__main__': main() guard. Test must PASS.",
    "tdd_phase": "GREEN",
    "files_affected": ["main.py"],
    "acceptance": "pytest test_main.py exits zero; python main.py outputs 'Hello, World!'"
  },
  {
    "task_id": 3,
    "title": "Implement new feature in main()",
    "description": "Add a new feature to main() that prints 'Feature implemented!'. Test must PASS.",
    "tdd_phase": "GREEN",
    "files_affected": ["main_new.py"],
    "acceptance": ""
  }
]
\`\`\`
`;

describe('ProjectStateService', () => {
    let service: ProjectStateService;
    const workingDir = '/fake/dir';

    beforeEach(() => {
        service = new ProjectStateService(workingDir);
        // Garante que a implementação original do spy seja restaurada entre os testes
        vi.restoreAllMocks();
    });

    describe('extractTasksFromTacticalDesign', () => {
        it('should extract tasks from a valid tactical design file', () => {
            const expectedDir = path.join(workingDir, 'docs', 'specs', 'my-domain');
            const expectedFile = path.join(expectedDir, '003-tactical-design.md');

            (fs.existsSync as Mock).mockReturnValue(true);
            (fs.readdirSync as Mock).mockReturnValue(['003-tactical-design.md']);

            const parseSpy = vi.spyOn(ProjectStateService, '_parseTasksFromMarkdown');
            parseSpy.mockReturnValue([
                { taskId: 'T01', description: 'Mocked task 1', file: '003-tactical-design.md' },
                { taskId: 'T02', description: 'Mocked task 2', file: '003-tactical-design.md' },
            ]);
            (fs.readFileSync as Mock).mockReturnValue(MOCK_TDD_FILE_CONTENT);

            const tasks = service.extractTasksFromTacticalDesign('my-domain');

            // Usando caminhos compatíveis com OS
            expect(fs.existsSync).toHaveBeenCalledWith(expectedDir);
            expect(fs.readdirSync).toHaveBeenCalledWith(expectedDir);
            expect(fs.readFileSync).toHaveBeenCalledWith(expectedFile, 'utf8');
            expect(parseSpy).toHaveBeenCalledWith(MOCK_TDD_FILE_CONTENT, '003-tactical-design.md');
            expect(tasks).toEqual([
                { taskId: 'T01', description: 'Mocked task 1', file: '003-tactical-design.md' },
                { taskId: 'T02', description: 'Mocked task 2', file: '003-tactical-design.md' },
            ]);
        });
    });

    describe('_parseTasksFromMarkdown', () => {
        it('should return an empty array if section 6 is not found', () => {
            const tasks = ProjectStateService._parseTasksFromMarkdown('## Section 5', "003-tactical-design.md");
            expect(tasks).toEqual([]);
        });

        it('should return an empty array for invalid JSON', () => {
            const content = '## Section 6\n```json\n{ not json }\n```';
            const tasks = ProjectStateService._parseTasksFromMarkdown(content, "003-tactical-design.md");
            expect(tasks).toEqual([]);
        });

        it('should correctly parse tasks from valid markdown', () => {
            const tasks = ProjectStateService._parseTasksFromMarkdown(MOCK_TDD_FILE_CONTENT, "003-tactical-design.md");
            expect(tasks).toEqual([
                { taskId: 'T01', description: 'Create main.py with failing test hook', file: '' },
                { taskId: 'T02', description: 'Implement greeting in main()', file: '' },
                { taskId: 'T03', description: 'Implement new feature in main()', file: '' },
            ]);
        });

        it('should extract component name from structured filename', () => {
            const tasksBackend = ProjectStateService._parseTasksFromMarkdown(MOCK_TDD_FILE_CONTENT, "003-backend-tactical-design.md");
            expect(tasksBackend[0].file).toBe('backend');

            const tasksFrontend = ProjectStateService._parseTasksFromMarkdown(MOCK_TDD_FILE_CONTENT, "003-frontend-tactical-design.md");
            expect(tasksFrontend[0].file).toBe('frontend');
        });
    });
});