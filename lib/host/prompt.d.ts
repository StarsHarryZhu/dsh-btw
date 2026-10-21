/**
 * The side question's prompt.
 *
 * Adapted from Claude Code's `/btw` reminder: the model is a separate,
 * lightweight helper; the main agent keeps working; the history is background,
 * not a task to continue; it never announces actions it cannot take. Two
 * additions: web search is the one tool it may have, and the reply opens with a
 * `<title>` line so the card has a collapsed title from the same request.
 * @module dsh-btw/host/prompt
 */
/** What the model may use in this request. */
export type ToolMode = 'search' | 'none';
/**
 * The system prompt.
 * @param mode - `search` when `web_search` is declared, `none` for a tool-free request.
 * @returns the prompt text.
 */
export declare function systemPrompt(mode: ToolMode): string;
/** Inputs of the user message. */
export interface QuestionParts {
    /** Flattened main conversation; may be empty. */
    transcript: string;
    question: string;
    /** Text the user selected in a reply, when asked from a selection. */
    quote?: string;
    /** Search results gathered so far, for the final tool-free request. */
    searchResults?: readonly string[];
}
/**
 * The single user message of a side request.
 * @param parts - transcript, question, optional quote and gathered search results.
 * @returns the message text.
 */
export declare function userPrompt(parts: QuestionParts): string;
/**
 * Split the model's reply into its title line and answer body.
 * @param text - the reply.
 * @returns the title (empty when absent) and the body without the title tag.
 */
export declare function splitTitle(text: string): {
    title: string;
    body: string;
};
