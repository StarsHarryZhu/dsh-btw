/**
 * Answer one side question with direct model calls.
 *
 * The request is built so it can never be "tool history without tool
 * declarations": the main conversation arrives flattened to text, the only
 * declared tool is `web_search` (when the web service exists), and the only
 * native tool blocks in the request are this loop's own search calls. The
 * remaining safeguards follow Claude Code's `/btw`: a reminder that the model
 * cannot act, a denial for any other tool name, a hard step cap, and a readable
 * fallback when the model produced no text.
 * @module dsh-btw/host/runner
 */
import { type Source } from '../shared/protocol.ts';
import type { LlmLike, Route, WebLike } from './types.ts';
/** Services one run uses; `web` is absent when the host composes no web service. */
export interface RunnerDeps {
    llm: LlmLike;
    web?: WebLike | undefined;
}
/** One side question. */
export interface RunInput {
    question: string;
    quote?: string;
    /** Flattened main conversation. */
    transcript: string;
    /** Validated model route. */
    route: Route;
    /** Model calls allowed to use tools before the final tool-free call. */
    maxSteps: number;
}
/** The settled result, before it is tied to a command id. */
export interface RunOutput {
    title: string;
    answer: string;
    sources: Source[];
    error?: string;
}
/**
 * Run the side question to completion.
 * @param deps - the LLM and optional web services.
 * @param input - question, context, route, and step budget.
 * @param signal - aborts every model call and search.
 * @returns the title, answer, and sources, or an error message.
 */
export declare function runSideQuestion(deps: RunnerDeps, input: RunInput, signal: AbortSignal): Promise<RunOutput>;
/**
 * The route a side question runs on.
 * @param source - `custom` uses the configured route, `session` the main session's latest one.
 * @param custom - the configured route.
 * @param session - the session's latest request route, when it has one.
 * @returns the route to validate.
 */
export declare function chooseRoute(source: string, custom: Route, session: Partial<Route> | undefined): Route;
