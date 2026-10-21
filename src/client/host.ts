/**
 * The slice of host slot props and services the browser half reads, as
 * structural types. The browser half imports no harness package, not even for
 * types; every field is optional because an older host or another composition
 * may leave any of them out, and the views must degrade, not throw.
 * @module dsh-btw/client/host
 */

/** Bound translator for this plugin's namespace. */
export type Translate = (key: string, params?: Record<string, unknown>) => string

/** One folded `command/run` + `command/done` pair (`CommandNode`). */
export interface CommandNodeLike {
  readonly kind?: string
  readonly seq?: number
  readonly time?: number
  readonly commandId?: string
  readonly name?: string | null
  readonly args?: string | null
  readonly outcome?: { readonly kind?: string; readonly text?: string } | null
}

/** The fields of the Chat snapshot this plugin reads. */
export interface ChatSnapshotLike {
  readonly legacy?: { readonly nodes?: readonly CommandNodeLike[] }
  readonly timeline?: { readonly turns?: { get(turn: number): { readonly status?: string } | undefined } }
}

/** Selector hook over the Chat snapshot (`useChat`). */
export type UseChat = <S>(selector: (snapshot: ChatSnapshotLike) => S, equal?: (a: S, b: S) => boolean) => S

/** Standard props every session-scope slot component receives. */
export interface SessionKit {
  sessionId?: string
  t?: Translate
  useChat?: UseChat
}

/** Props of a `conversation.chat.commandview` entry. */
export interface CommandRowProps extends SessionKit {
  node?: CommandNodeLike
}

/** Props of a `conversation.chat.turnTail` entry. */
export interface TurnTailProps extends SessionKit {
  turn?: { readonly turn?: number; readonly status?: string }
}

/** Props of a `plugins.bundle.config` entry. */
export interface ConfigViewProps {
  view?: 'summary' | 'page'
  t?: Translate
}

/** A settings path edit (`SettingsPathOpView`). */
export type PathOp = { op: 'set'; path: string[]; value: unknown } | { op: 'unset'; path: string[] }

/** One snapshot of a settings form (`ConfigFormSnapshot`). */
export interface FormSnapshotLike {
  readonly status?: 'loading' | 'ready' | 'unavailable'
  readonly value?: Record<string, unknown>
  readonly revision?: number
  readonly writable?: boolean
}

/** One settings form (`ConfigForm`). */
export interface ConfigFormLike {
  getSnapshot(): FormSnapshotLike
  subscribe(listener: () => void): () => void
  mutate(ops: readonly PathOp[], expectedRevision?: number): Promise<boolean>
}

/** A remote call result (`RemoteResult`). */
export interface RemoteResultLike<T> {
  readonly ok: boolean
  readonly value?: T
  readonly error?: { readonly code?: string; readonly message?: string }
}

/** One model of the catalog (`ModelCatalogModel`). */
export interface CatalogModel {
  readonly id: string
  readonly name?: string
  readonly reasoning?: { readonly efforts?: readonly { id: string; name?: string }[]; readonly defaultEffort?: string }
}

/** One provider group of the catalog. */
export interface CatalogGroup {
  readonly id: string
  readonly name?: string
  readonly models: readonly CatalogModel[]
}

/** `ctx.remote`, reduced to the calls this plugin makes. */
export interface RemoteLike {
  commands: {
    execute(sessionId: string, line: string, attachments: readonly never[], signal?: AbortSignal): Promise<RemoteResultLike<unknown>>
  }
  session?: { modelCatalog(): Promise<RemoteResultLike<{ groups: readonly CatalogGroup[] }>> }
}

/** The client context services the browser half uses. */
export interface ClientContextLike {
  get?(name: string): unknown
  effect?(execute: () => (() => void) | void, label?: string): unknown
  inject?(deps: string[], callback: (scope: ClientContextLike) => void): unknown
}

/** The slot registry service. */
export interface SlotsLike {
  inject(name: string, callback: () => (() => void) | void): unknown
  register(options: Record<string, unknown>, component: unknown): () => void
}

/** The locale service. */
export interface LocaleLike {
  register(namespace: string, dictionaries: Record<string, Record<string, string>>): () => void
  bind?(namespace: string): Translate
}

/** The right sidebar's tab-type registry. */
export interface SidebarTabsLike {
  register(definition: Record<string, unknown>): () => void
}

/** The settings forms service. */
export interface ConfigFormsLike {
  get(entryId: string): ConfigFormLike
}
