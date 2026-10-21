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

export const PLUGIN_ID = 'dsh-btw'
export const LOCALE_NS = 'dsh-btw'

export const CMD_ASK = 'btw'
export const CMD_QUOTE = 'btw-quote'
export const CMD_ANSWER = 'btw-answer'
export const CMD_DELETE = 'btw-delete'

/** Commands the slash menu never lists: they are issued by the plugin itself. */
export const INTERNAL_COMMANDS: readonly string[] = [CMD_QUOTE, CMD_ANSWER, CMD_DELETE]

/** Longest question and quote, in UTF-16 code units. */
export const MAX_QUESTION = 8000
export const MAX_QUOTE = 8000

/** A side question that has not answered by then is aborted. */
export const JOB_TIMEOUT_MS = 180_000

/** Envelope version tag; a record without it is not ours. */
const TAG = 'dshBtw'

/** One web source the answer drew on. */
export interface Source {
  readonly url: string
  readonly title?: string
}

/** The settled answer to one side question. */
export interface Answer {
  /** Command id of the `/btw` or `/btw-quote` invocation this answers. */
  readonly for: string
  /** Short title the model wrote with the answer; shown when the card is collapsed. */
  readonly title: string
  /** Markdown answer; empty when {@link error} is set. */
  readonly answer: string
  readonly sources: readonly Source[]
  /** Why there is no answer, when there is none. */
  readonly error?: string
  /** `provider/model` that answered. */
  readonly model?: string
}

/** Arguments of `/btw-quote`. */
export interface QuoteRequest {
  readonly question: string
  readonly quote: string
  /** Turn whose reply the quote was selected from; the card is drawn under it. */
  readonly anchorTurn?: number
}

/** Host-minted command ids look like `cmd-1a2b3c4d-7`; accept any short token. */
export function isCommandId(value: string): boolean {
  return /^[A-Za-z0-9_-]{4,128}$/u.test(value)
}

/**
 * Serialize an answer for a command result.
 * @param answer - the settled answer.
 * @returns the result text.
 */
export function encodeAnswer(answer: Answer): string {
  return JSON.stringify({ [TAG]: 1, ...answer })
}

/**
 * Read an answer back from a command result.
 * @param text - the result text, possibly from another plugin or version.
 * @returns the answer, or undefined when the text is not one.
 */
export function parseAnswer(text: string | undefined | null): Answer | undefined {
  const value = parseObject(text)
  if (value === undefined || value[TAG] !== 1 || typeof value.for !== 'string') return undefined
  const sources = Array.isArray(value.sources)
    ? value.sources.flatMap((item): Source[] => {
      const source = asObject(item)
      if (source === undefined || typeof source.url !== 'string') return []
      return [typeof source.title === 'string' ? { url: source.url, title: source.title } : { url: source.url }]
    })
    : []
  return {
    for: value.for,
    title: typeof value.title === 'string' ? value.title : '',
    answer: typeof value.answer === 'string' ? value.answer : '',
    sources,
    ...typeof value.error === 'string' ? { error: value.error } : {},
    ...typeof value.model === 'string' ? { model: value.model } : {},
  }
}

/**
 * Serialize `/btw-quote` arguments.
 * @param request - question, quote, and optional anchor turn.
 * @returns the argument text.
 */
export function encodeQuote(request: QuoteRequest): string {
  return JSON.stringify(request)
}

/**
 * Read `/btw-quote` arguments.
 * @param text - the raw argument text.
 * @returns the request, or undefined when malformed or out of bounds.
 */
export function parseQuote(text: string | undefined | null): QuoteRequest | undefined {
  const value = parseObject(text)
  if (value === undefined) return undefined
  const question = typeof value.question === 'string' ? value.question.trim() : ''
  const quote = typeof value.quote === 'string' ? value.quote : ''
  if (!question || question.length > MAX_QUESTION || !quote.trim() || quote.length > MAX_QUOTE) return undefined
  const anchor = value.anchorTurn
  return {
    question,
    quote,
    ...typeof anchor === 'number' && Number.isInteger(anchor) && anchor >= 0 ? { anchorTurn: anchor } : {},
  }
}

/**
 * Fallback title: the question's first line, shortened.
 * @param question - the asked question.
 * @returns at most 24 characters.
 */
export function fallbackTitle(question: string): string {
  const line = question.trim().split('\n')[0]?.trim() ?? ''
  return line.length > 24 ? `${line.slice(0, 23)}…` : line
}

function parseObject(text: string | undefined | null): Record<string, unknown> | undefined {
  if (typeof text !== 'string' || !text.trimStart().startsWith('{')) return undefined
  try {
    return asObject(JSON.parse(text))
  } catch {
    return undefined
  }
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}
