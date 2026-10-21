/**
 * Flatten the main conversation into plain text.
 *
 * This is the fix for phantom tool calls. Forking the parent history replays
 * its native `tool_use` / `tool_result` blocks; a request that carries those
 * blocks but declares none of their tools is out of distribution, and the model
 * keeps calling tools it no longer has. Here every tool call and result becomes
 * a neutral sentence inside one user message, so the side request contains no
 * tool structure at all except the tools it actually declares.
 * @module dsh-btw/host/transcript
 */
import type { MessageLike } from './types.ts';
/** Budgets, in UTF-16 code units. */
export interface TranscriptLimits {
    /** Whole transcript; the oldest entries are dropped first. */
    maxChars: number;
    /** One tool call's arguments. */
    toolArgsChars: number;
    /** One tool result, or one injected context message. */
    toolResultChars: number;
}
export declare const DEFAULT_LIMITS: TranscriptLimits;
/**
 * Render the model-visible history as a transcript.
 * @param messages - `agent.session.deriveMessages()`.
 * @param limits - character budgets.
 * @returns plain text with no tool-call structure; empty for an empty history.
 */
export declare function flattenHistory(messages: readonly MessageLike[], limits?: TranscriptLimits): string;
/**
 * Shorten text to a budget, marking the cut.
 * @param text - the text.
 * @param max - the budget.
 * @returns text of at most `max` characters plus the marker.
 */
export declare function clip(text: string, max: number): string;
