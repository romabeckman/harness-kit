import { join, dirname } from 'node:path'
import { existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { HarnessSettings } from '../../settings/HarnessSettings'
import { DEFAULT_SETTINGS } from '../../settings/DefaultSettings'
import { AnsiHelpers } from '../../ui/AnsiHelpers'

export async function cmdSettings(cwd: string, args: string[] = []): Promise<void> {
  const { select } = await import('@inquirer/prompts')
  let subcommand = args[0];

  if (!subcommand) {
    subcommand = await select({
      message: 'Which action do you want to perform?',
      choices: [
        { name: 'Edit', value: 'edit', description: 'Open settings.json in the default text editor' },
        { name: 'Renew', value: 'renew', description: 'Recreate settings.json with default values' },
        { name: 'Delete', value: 'delete', description: 'Delete settings.json' }
      ],
      default: 'edit'
    });
  }

  if (!['edit', 'renew', 'delete'].includes(subcommand)) {
    console.error(`${AnsiHelpers.red('Error:')} Unknown settings subcommand: ${subcommand}`);
    console.error(`Valid subcommands are: edit, renew, delete`);
    process.exit(1);
  }

  const target = await select({
    message: `Which settings.json do you want to ${subcommand}?`,
    choices: [
      { name: 'Global (default)', value: 'global' },
      { name: 'Local (.harness-kit/settings.json)', value: 'local' }
    ],
    default: 'global'
  });


  let settingsPath = '';
  if (target === 'global') {
    settingsPath = HarnessSettings.getGlobalSettingsPath();
  } else {
    settingsPath = join(cwd, '.harness-kit', 'settings.json');
  }

  console.log(`\n${AnsiHelpers.cyan('Settings File:')} ${settingsPath}\n`);

  if (subcommand === 'delete') {
    if (existsSync(settingsPath)) {
      rmSync(settingsPath);
      console.log(`${AnsiHelpers.green('✓')} Deleted ${settingsPath}`);
    } else {
      console.log(`${AnsiHelpers.blue('i')} File does not exist, nothing to delete.`);
    }
    return;
  }

  if (subcommand === 'renew') {
    mkdirSync(dirname(settingsPath), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf-8');
    console.log(`${AnsiHelpers.green('✓')} Settings renewed (recreated) at ${settingsPath}`);
    return;
  }

  // subcommand === 'edit'
  if (!existsSync(settingsPath)) {
    mkdirSync(dirname(settingsPath), { recursive: true });
    writeFileSync(settingsPath, JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf-8');
    console.log(`${AnsiHelpers.green('✓')} Settings created at ${settingsPath}`);
  }

  console.log(`${AnsiHelpers.blue('►')} Opening in the default text editor...`);
  try {
    const isWindows = process.platform === 'win32';

    let hasVsCode = false;
    try {
      execSync('code -v', { stdio: 'ignore' });
      hasVsCode = true;
    } catch (e) {
      // VS Code not available
    }

    if (hasVsCode) {
      execSync(`code "${settingsPath}"`);
    } else if (isWindows) {
      execSync(`start "" "${settingsPath}"`);
    } else {
      const editor = process.env.EDITOR || process.env.VISUAL || 'nano';
      execSync(`${editor} "${settingsPath}"`, { stdio: 'inherit' });
    }
  } catch (err: any) {
    console.error(`Failed to open the editor. Please open the file manually: ${settingsPath}`);
  }
}
