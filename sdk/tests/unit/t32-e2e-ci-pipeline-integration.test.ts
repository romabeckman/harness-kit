import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT_DIR = path.resolve(__dirname, '../../');

describe('F004 — E2E CI Pipeline Integration Specs', () => {
  describe('Section 1.1 — Configuration Objects (vitest.e2e.config.ts)', () => {
    it('should validate root vitest.e2e.config.ts exists and options', async () => {
      const configPath = path.join(ROOT_DIR, 'vitest.e2e.config.ts');
      expect(fs.existsSync(configPath)).toBe(true);

      const configContent = fs.readFileSync(configPath, 'utf8');
      expect(configContent).toContain('fileParallelism: false');
      expect(configContent).toContain('testTimeout: 30000');
      expect(configContent).toContain("tests/e2e/**/*.test.ts");
    });
  });

  describe('Section 1.2 — NPM Scripts Definition (package.json)', () => {
    it('should contain test:e2e and test:e2e:clean scripts in package.json', () => {
      const pkgPath = path.join(ROOT_DIR, 'package.json');
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

      expect(pkg.scripts['test:e2e']).toBe('vitest run --config vitest.e2e.config.ts');
      expect(pkg.scripts['test:e2e:clean']).toBeDefined();
      expect(pkg.scripts['test:e2e:clean']).toContain('tests/e2e/.temp');
    });
  });

  describe('Section 3.1 & 3.2 — CI Workflow Pipeline Integration (.github/workflows/ci.yml)', () => {
    it('should execute E2E test step and cleanup in CI pipeline', () => {
      const ciPath = path.join(ROOT_DIR, '.github/workflows/ci.yml');
      expect(fs.existsSync(ciPath)).toBe(true);

      const ciContent = fs.readFileSync(ciPath, 'utf8');
      expect(ciContent).toContain('Run E2E Tests');
      expect(ciContent).toContain('npm run test:e2e');
      expect(ciContent).toContain('test:e2e:clean');
    });
  });
});
