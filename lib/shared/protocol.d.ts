/**
 * The wire contract between the two halves.
 *
 * Every side question lives in the Session log as ordinary command records, so
 * a reload, a second window, or the sidebar all read the same history:
 * - `/btw <question>` and `/btw-quote <json>` record the question and return at
 *   once, so the composer is never held while the model works;
 * - `/btw-answer <commandId>` is executed by the host half when the answer is
 *   ready; its result text is the {@link Answer} envelope;
 * - `/btw-delete <commandId>` records a deletion and stops a running answer.
 * @module dsh-btw/shared/protocol
 */
export declare const PLUGIN_ID = "dsh-btw";
export declare const LOCALE_NS = "dsh-btw";
export declare const CMD_ASK = "btw";
export declare const CMD_QUOTE = "btw-quote";
export declare const CMD_ANSWER = "btw-answer";
export declare const CMD_DELETE = "btw-delete";
/** Commands the slash menu never lists: they are issued by the plugin itself. */
export declare const INTERNAL_COMMANDS: readonly string[];
/** Longest question and quote, in UTF-16 code units. */
export declare const MAX_QUESTION = 8000;
export declare const MAX_QUOTE = 8000;
/** A side question that has not answered by then is aborted. */
export declare const JOB_TIMEOUT_MS = 180000;
/** One web source the answer drew on. */
export interface Source {
    readonly url: string;
    readonly title?: string;
}
/** The settled answer to one side question. */
export interface Answer {
    /** Command id of the `/btw` or `/btw-quote` invocation this answers. */
    readonly for: string;
    /** Short title the model wrote with the answer; shown when the card is collapsed. */
    readonly title: string;
    /** Markdown answer; empty when {@link error} is set. */
    readonly answer: string;
    readonly sources: readonly Source[];
    /** Why there is no answer, when there is none. */
    readonly error?: string;
    /** `provider/model` that answered. */
    readonly model?: string;
}
/** Arguments of `/btw-quote`. */
export interface QuoteRequest {
    readonly question: string;
    readonly quote: string;
    /** Turn whose reply the quote was selected from; the card is drawn under it. */
    readonly anchorTurn?: number;
}
/** Host-minted command ids look like `cmd-1a2b3c4d-7`; accept any short token. */
export declare function isCommandId(value: string): boolean;
/**
 * Serialize an answer for a command result.
 * @param answer - the settled answer.
 * @returns the result text.
 */
export declare function encodeAnswer(answer: Answer): string;
/**
 * Read an answer back from a command result.
 * @param text - the result text, possibly from another plugin or version.
 * @returns the answer, or undefined when the text is not one.
 */
export declare function parseAnswer(text: string | undefined | null): Answer | undefined;
/**
 * Serialize `/btw-quote` arguments.
 * @param request - question, quote, and optional anchor turn.
 * @returns the argument text.
 */
export declare function encodeQuote(request: QuoteRequest): string;
/**
 * Read `/btw-quote` arguments.
 * @param text - the raw argument text.
 * @returns the request, or undefined when malformed or out of bounds.
 */
export declare function parseQuote(text: string | undefined | null): QuoteRequest | undefined;
/**
 * Fallback title: the question's first line, shortened.
 * @param question - the asked question.
 * @returns at most 24 characters.
 */
export declare function fallbackTitle(question: string): string;
