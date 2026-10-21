/**
 * The side question's only tool: `web_search`.
 *
 * The declaration matches the host's own `web_search` (name and `{ queries }`
 * argument) so the model sees a familiar tool. Execution goes straight to the
 * `web` service instead of the tool registry: the registry would run the main
 * agent's approval and logging pipeline, and the side question must not touch
 * the main agent's state.
 * @module dsh-btw/host/search
 */
import type { Source } from '../shared/protocol.ts';
import type { ToolSchemaLike, WebLike } from './types.ts';
export declare const SEARCH_TOOL_NAME = "web_search";
export declare const SEARCH_TOOL: ToolSchemaLike;
/** One executed search, as text for the model plus its sources for the card. */
export interface SearchOutcome {
    text: string;
    sources: Source[];
    isError: boolean;
}
/**
 * Run one `web_search` call.
 * @param web - the web service.
 * @param rawArguments - the model's JSON arguments.
 * @param signal - cancellation.
 * @returns the tool result text and the sources found.
 */
export declare function runSearch(web: WebLike, rawArguments: string, signal: AbortSignal): Promise<SearchOutcome>;
