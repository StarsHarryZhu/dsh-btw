/**
 * Running side questions, keyed by the command id that asked them.
 *
 * A job runs detached from the command that started it: the command returns at
 * once and the job later publishes its answer through `/btw-answer`. Deleting
 * the card aborts the job, and a deleted id never publishes.
 * @module dsh-btw/host/jobs
 */

import { JOB_TIMEOUT_MS } from '../shared/protocol.ts'

/** Work for one job; it receives the job's abort signal. */
export type JobWork = (signal: AbortSignal) => Promise<void>

export class Jobs {
  private readonly running = new Map<string, AbortController>()
  /** Ids deleted while running or before they started; bounded. */
  private readonly deleted = new Set<string>()
  private disposed = false

  /**
   * @param limit - jobs allowed at once.
   * @param timeoutMs - abort a job after this long.
   * @param onError - receives failures the work itself did not handle.
   */
  constructor(
    private readonly limit = 4,
    private readonly timeoutMs = JOB_TIMEOUT_MS,
    private readonly onError: (error: unknown) => void = console.error,
  ) {}

  get size(): number {
    return this.running.size
  }

  /**
   * Start one job.
   * @param id - the asking command id.
   * @param work - the job body.
   * @returns `undefined` when started, otherwise why not (`busy`, `stopped`, `duplicate`).
   */
  start(id: string, work: JobWork): 'busy' | 'stopped' | 'duplicate' | undefined {
    if (this.disposed) return 'stopped'
    if (this.running.has(id) || this.deleted.has(id)) return 'duplicate'
    if (this.running.size >= this.limit) return 'busy'
    const controller = new AbortController()
    this.running.set(id, controller)
    const timer = setTimeout(() => controller.abort(new Error('timeout')), this.timeoutMs)
    timer.unref?.()
    void work(controller.signal)
      .catch((error: unknown) => { if (!controller.signal.aborted) this.onError(error) })
      .finally(() => {
        clearTimeout(timer)
        if (this.running.get(id) === controller) this.running.delete(id)
      })
    return undefined
  }

  /**
   * Whether a job's answer may still be published.
   * @param id - the asking command id.
   * @returns false once the id was deleted or the plugin stopped.
   */
  live(id: string): boolean {
    return !this.disposed && !this.deleted.has(id)
  }

  /**
   * Delete one job: abort it if running and suppress its answer.
   * @param id - the asking command id.
   */
  delete(id: string): void {
    this.deleted.add(id)
    if (this.deleted.size > 1000) this.deleted.delete(this.deleted.values().next().value as string)
    this.running.get(id)?.abort(new Error('deleted'))
  }

  /** Abort every job; later starts are refused. */
  dispose(): void {
    this.disposed = true
    for (const controller of this.running.values()) controller.abort(new Error('stopped'))
    this.running.clear()
  }
}
