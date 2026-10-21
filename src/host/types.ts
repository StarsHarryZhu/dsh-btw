/**
 * The slices of host services the host half reads, as structural types.
 *
 * The plugin imports no harness package at runtime besides cordis and
 * schemastery, so these mirror only the fields it uses: `@deepseek-ai/dsh-llm`
 * for messages and stream chunks, `@deepseek-ai/dsh-web` for search, and the
 * agent and command registries.
 * @module dsh-btw/host/types
 */

/** A content block as the LLM layer carries it. */
export type BlockLike =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'tool-call'; id: string; name: string; arguments: string }
  | { type: string; [key: string]: unknown }

/** A durable conversation message (`deriveMessages()` element). */
export interface MessageLike {
  readonly id?: string
  readonly role: string
  readonly content: readonly BlockLike[]
  readonly source?: { readonly kind?: string; readonly [key: string]: unknown }
  readonly toolCallId?: string
  readonly isError?: boolean
}

/** One raw stream chunk (`StreamChunk`). */
export type ChunkLike =
  | { type: 'block-start'; index: number; blockType: string }
  | { type: 'text-delta'; index: number; text: string }
  | { type: 'reasoning-delta'; index: number; text: string }
  | { type: 'tool-call-delta'; index: number; id: string; name?: string; argumentsDelta: string }
  | { type: 'block-end'; index: number; block: BlockLike }
  | { type: 'usage'; usage: unknown }
  | { type: 'finish'; reason: { kind: string; failure?: { message?: string; code?: string } }; replayState?: unknown }

/** A model-facing tool declaration (`ToolSchema`). */
export interface ToolSchemaLike {
  name: string
  description: string
  parameters: Record<string, unknown>
}

/** Provider, model, and effort of one call. */
export interface Route {
  provider: string
  model: string
  reasoningEffort?: string
}

/** One request as `ctx.llm.stream` takes it (`GenerateOptions`). */
export interface GenerateLike extends Route {
  system?: string
  messages: unknown[]
  tools?: ToolSchemaLike[]
  signal?: AbortSignal
}

/** `ctx.llm`. */
export interface LlmLike {
  stream(options: GenerateLike): AsyncIterable<ChunkLike>
  resolveCallConfig(config: Route, signal?: AbortSignal): Promise<Route>
}

/** `ctx.web`. */
export interface WebLike {
  search(
    request: { query: string; maxResults?: number },
    signal?: AbortSignal,
  ): Promise<{ content?: string; sources: { url: string; title?: string; snippet?: string; publishedAt?: string }[]; truncated?: boolean }>
}

/** The receiving Agent of a command. */
export interface AgentLike {
  readonly id?: string
  readonly options?: { provider?: string; model?: string; reasoningEffort?: string }
  readonly session: {
    deriveMessages(): readonly MessageLike[]
    requestHeader?(): { config?: { provider?: string; model?: string; reasoningEffort?: string } } | undefined
  }
}

/** `ctx.agents`. */
export interface AgentsLike {
  withInitiator<T>(agent: AgentLike, operation: () => T): T
}

/** One command invocation (`CommandInvocation`). */
export interface InvocationLike {
  readonly commandId: string
  readonly agent: AgentLike
  readonly rawInput: string
  readonly signal: AbortSignal
}

/** A command result (`CommandResult`). */
export type CommandResultLike = { kind: 'success'; text?: string } | { kind: 'error'; text: string }

/** One command registration (`CommandDefinition`). */
export interface CommandDefinitionLike {
  name: string
  description: string
  input?: { hint: string }
  recordInput?: boolean
  handler(invocation: InvocationLike): CommandResultLike | Promise<CommandResultLike>
}

/** `ctx.commands`. */
export interface CommandsLike {
  register(definition: CommandDefinitionLike): () => void
  execute(agent: AgentLike, line: string, attachments: readonly never[], signal: AbortSignal): Promise<unknown>
  list(agent?: unknown): readonly { name: string }[]
}

/** A `.volatile()` config field as the loader hands it over. */
export interface VolatileLike<T> {
  get(): T
}
