/**
 * Running side questions, keyed by the command id that asked them.
 *
 * A job runs detached from the command that started it: the command returns at
 * once and the job later publishes its answer through `/btw-answer`. Deleting
 * the card aborts the job, and a deleted id never publishes.
 * @module dsh-btw/host/jobs
 */
/** Work for one job; it receives the job's abort signal. */
export type JobWork = (signal: AbortSignal) => Promise<void>;
export declare class Jobs {
    private readonly limit;
    private readonly timeoutMs;
    private readonly onError;
    private readonly running;
    /** Ids deleted while running or before they started; bounded. */
    private readonly deleted;
    private disposed;
    /**
     * @param limit - jobs allowed at once.
     * @param timeoutMs - abort a job after this long.
     * @param onError - receives failures the work itself did not handle.
     */
    constructor(limit?: number, timeoutMs?: number, onError?: (error: unknown) => void);
    get size(): number;
    /**
     * Start one job.
     * @param id - the asking command id.
     * @param work - the job body.
     * @returns `undefined` when started, otherwise why not (`busy`, `stopped`, `duplicate`).
     */
    start(id: string, work: JobWork): 'busy' | 'stopped' | 'duplicate' | undefined;
    /**
     * Whether a job's answer may still be published.
     * @param id - the asking command id.
     * @returns false once the id was deleted or the plugin stopped.
     */
    live(id: string): boolean;
    /**
     * Delete one job: abort it if running and suppress its answer.
     * @param id - the asking command id.
     */
    delete(id: string): void;
    /** Abort every job; later starts are refused. */
    dispose(): void;
}
