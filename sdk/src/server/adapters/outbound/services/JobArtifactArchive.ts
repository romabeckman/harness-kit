import { copyFile, lstat, mkdir, mkdtemp, readdir, realpath, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'

async function statIfPresent(path: string) {
  try {
    return await lstat(path)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    return undefined
  }
}

async function inspectDirectory(path: string): Promise<boolean> {
  const stat = await statIfPresent(path)
  if (stat && !stat.isDirectory()) throw new Error('Expected a real directory for job artifacts.')
  return !!stat
}

async function createDirectory(path: string): Promise<void> {
  if (await inspectDirectory(path)) return
  await mkdir(path, { mode: 0o700 })
}

export async function archiveJobArtifacts(worktree: string, workspace: string, jobId: string): Promise<void> {
  const docs = join(await realpath(worktree), 'docs')
  const product = join(docs, 'product')
  if (!await inspectDirectory(docs) || !await inspectDirectory(product)) return

  const paths: string[] = []
  const sessions = 'diagnose-sessions.jsonl'
  const sessionStat = await statIfPresent(join(product, sessions))
  if (sessionStat && !sessionStat.isFile()) throw new Error('Expected a regular diagnostic session file.')
  if (sessionStat) paths.push(sessions)

  const dreaming = join(product, 'project-dreaming')
  if (await inspectDirectory(dreaming)) {
    for (const folder of ['episodes', 'handoffs']) {
      const directory = join(dreaming, folder)
      if (!await inspectDirectory(directory)) continue
      const entries = await readdir(directory, { withFileTypes: true })
      for (const entry of entries) {
        if (entry.isFile() && entry.name.endsWith('.json')) paths.push(join('project-dreaming', folder, entry.name))
      }
    }
  }
  if (!paths.length) return

  if (!/^[a-zA-Z0-9_-]+$/.test(jobId)) throw new Error('Invalid artifact archive job ID.')
  const harness = join(await realpath(workspace), '.harness-kit')
  const archive = join(harness, 'job-artifacts')
  await createDirectory(harness)
  await createDirectory(archive)
  const staging = await mkdtemp(join(archive, '.pending-'))
  try {
    for (const path of paths) {
      if (path !== sessions) await mkdir(dirname(join(staging, path)), { recursive: true, mode: 0o700 })
      await copyFile(join(product, path), join(staging, path))
    }
    await rename(staging, join(archive, jobId))
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}
