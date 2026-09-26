import { get } from 'node:https'
import type { ClientRequest } from 'node:http'

const PACKAGE_URL = 'https://raw.githubusercontent.com/romabeckman/harness-kit/main/sdk/package.json'

// Only stable releases are advertised; never suggest downgrading a local build.
function isNewer(remote: unknown, current: string): remote is string {
  const stable = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
  if (typeof remote !== 'string' || !stable.test(remote) || !stable.test(current)) return false
  const next = remote.split('.').map(BigInt)
  const installed = current.split('.').map(BigInt)
  for (let i = 0; i < 3; i++) {
    if (next[i] !== installed[i]) return next[i] > installed[i]
  }
  return false
}

/** Best effort: neither the request socket nor its deadline keeps the CLI alive. */
export function checkForUpdates(currentVersion: string): void {
  let request: ClientRequest | undefined
  let finished = false
  let deadline: NodeJS.Timeout | undefined
  const finish = () => {
    finished = true
    clearTimeout(deadline)
    request?.destroy()
  }

  try {
    // Absolute deadline also bounds DNS, TLS, and a response that trickles forever.
    deadline = setTimeout(finish, 1500)
    deadline.unref()
    request = get(PACKAGE_URL, response => {
      response.on('error', finish)
      response.on('aborted', finish)
      if (finished || response.statusCode !== 200) {
        response.destroy()
        finish()
        return
      }
      response.setEncoding('utf8')
      let body = ''
      response.on('data', (chunk: string) => {
        if (finished) return
        body += chunk
        if (body.length > 65536) finish()
      })
      response.on('end', () => {
        if (finished) return
        finish()
        try {
          const remote: unknown = JSON.parse(body)?.version
          if (isNewer(remote, currentVersion)) {
            console.error(`Update available: @romabeckman/hrns ${currentVersion} → ${remote}. Run: npm install -g @romabeckman/hrns@latest`)
          }
        } catch { /* Invalid responses must never affect the command. */ }
      })
    })
    request.on('socket', socket => socket.unref())
    request.on('error', finish)
  } catch {
    finish()
  }
}
