/**
 * Running side questions, keyed by the command id that asked them.
 *
 * A job runs detached from the command that started it: the command returns at
 * once and the job later publishes its answer through `/btw-answer`. Deleting
 * the card aborts the job, and a deleted id never publishes.
 * @module dsh-btw/host/jobs
 */
import { JOB_TIMEOUT_MS } from "../shared/protocol.js";
export class Jobs {
    limit;
    timeoutMs;
    onError;
    running = new Map();
    /** Ids deleted while running or before they started; bounded. */
    deleted = new Set();
    disposed = false;
    /**
     * @param limit - jobs allowed at once.
     * @param timeoutMs - abort a job after this long.
     * @param onError - receives failures the work itself did not handle.
     */
    constructor(limit = 4, timeoutMs = JOB_TIMEOUT_MS, onError = console.error) {
        this.limit = limit;
        this.timeoutMs = timeoutMs;
        this.onError = onError;
    }
    get size() {
        return this.running.size;
    }
    /**
     * Start one job.
     * @param id - the asking command id.
     * @param work - the job body.
     * @returns `undefined` when started, otherwise why not (`busy`, `stopped`, `duplicate`).
     */
    start(id, work) {
        if (this.disposed)
            return 'stopped';
        if (this.running.has(id) || this.deleted.has(id))
            return 'duplicate';
        if (this.running.size >= this.limit)
            return 'busy';
        const controller = new AbortController();
        this.running.set(id, controller);
        const timer = setTimeout(() => controller.abort(new Error('timeout')), this.timeoutMs);
        timer.unref?.();
        void work(controller.signal)
            .catch((error) => { if (!controller.signal.aborted)
            this.onError(error); })
            .finally(() => {
            clearTimeout(timer);
            if (this.running.get(id) === controller)
                this.running.delete(id);
        });
        return undefined;
    }
    /**
     * Whether a job's answer may still be published.
     * @param id - the asking command id.
     * @returns false once the id was deleted or the plugin stopped.
     */
    live(id) {
        return !this.disposed && !this.deleted.has(id);
    }
    /**
     * Delete one job: abort it if running and suppress its answer.
     * @param id - the asking command id.
     */
    delete(id) {
        this.deleted.add(id);
        if (this.deleted.size > 1000)
            this.deleted.delete(this.deleted.values().next().value);
        this.running.get(id)?.abort(new Error('deleted'));
    }
    /** Abort every job; later starts are refused. */
    dispose() {
        this.disposed = true;
        for (const controller of this.running.values())
            controller.abort(new Error('stopped'));
        this.running.clear();
    }
}
