import { describe, it, expect, afterEach } from 'vitest'
import http from 'node:http'
import { HttpServer } from '../HttpServer'
import { InMemoryJobStore, WorkspaceLockManager, JobQueue } from '../adapters'

describe('HttpServer', () => {
  let server: HttpServer | undefined

  afterEach(async () => {
    if (server) {
      await server.stop()
      server = undefined
    }
  })

  it('UT-1.1.1: Binds port & host and starts listening', async () => {
    server = new HttpServer({ port: 0, host: '127.0.0.1' })
    expect(server.getJobStore()).toBeInstanceOf(InMemoryJobStore)
    expect(server.getLockManager()).toBeInstanceOf(WorkspaceLockManager)
    expect(server.getJobQueue()).toBeInstanceOf(JobQueue)

    await server.start()
    const boundPort = server.getPort()
    expect(boundPort).toBeGreaterThan(0)

    const statusCode = await new Promise<number>((resolve, reject) => {
      http
        .get(`http://127.0.0.1:${boundPort}/health`, (res) => {
          resolve(res.statusCode ?? 0)
        })
        .on('error', reject)
    })

    expect(statusCode).toBe(200)
  })

  it('UT-1.1.2: Gracefully stops on stop() and handles process signals', async () => {
    server = new HttpServer({ port: 0, host: '127.0.0.1' })
    await server.start()
    const boundPort = server.getPort()

    const sigtermListenersBefore = process.listenerCount('SIGTERM')
    expect(sigtermListenersBefore).toBeGreaterThan(0)

    await server.stop()

    const sigtermListenersAfter = process.listenerCount('SIGTERM')
    expect(sigtermListenersAfter).toBe(sigtermListenersBefore - 1)

    await expect(
      new Promise<number>((resolve, reject) => {
        const req = http.get(`http://127.0.0.1:${boundPort}/health`, (res) => {
          resolve(res.statusCode ?? 0)
        })
        req.on('error', reject)
      })
    ).rejects.toThrow()
  })

  it('UT-1.1.3: Handles EADDRINUSE port conflict gracefully', async () => {
    const server1 = new HttpServer({ port: 0, host: '127.0.0.1' })
    await server1.start()
    const activePort = server1.getPort()

    const server2 = new HttpServer({ port: activePort, host: '127.0.0.1' })

    await expect(server2.start()).rejects.toThrow()

    await server1.stop()
  })
})
