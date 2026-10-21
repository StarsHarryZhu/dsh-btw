/**
 * Per-viewer card state: which cards are collapsed, and which deletions are in
 * flight. Collapse is a reading preference of this browser, kept in
 * localStorage; a deletion is hidden at once and becomes durable when its
 * `/btw-delete` record arrives.
 * @module dsh-btw/client/prefs
 */

import { useCallback, useSyncExternalStore } from 'react'

const STORAGE_KEY = 'dsh-btw.collapsed.v1'
const MAX_REMEMBERED = 500

/** A tiny observable set of ids. */
export class IdSet {
  private ids: ReadonlySet<string>
  private readonly listeners = new Set<() => void>()

  constructor(initial: Iterable<string> = [], private readonly persist?: (ids: readonly string[]) => void) {
    this.ids = new Set(initial)
  }

  has(id: string): boolean {
    return this.ids.has(id)
  }

  snapshot = (): ReadonlySet<string> => this.ids

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  set(id: string, present: boolean): void {
    if (this.ids.has(id) === present) return
    const next = new Set(this.ids)
    if (present) next.add(id)
    else next.delete(id)
    this.ids = next
    this.persist?.([...next].slice(-MAX_REMEMBERED))
    for (const listener of this.listeners) listener()
  }
}

function readStored(): string[] {
  try {
    const value: unknown = JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function writeStored(ids: readonly string[]): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(ids))
  } catch {
    // Private windows and blocked storage keep the state for this page only.
  }
}

/** Collapsed cards, remembered across reloads. */
export const collapsed = new IdSet(readStored(), writeStored)

/** Deletions sent but not yet recorded. */
export const deleting = new IdSet()

/**
 * Read and toggle one card's collapsed state.
 * @param id - the card's command id.
 * @returns whether it is collapsed, and its toggle.
 */
export function useCollapsed(id: string): [boolean, () => void] {
  const ids = useSyncExternalStore(collapsed.subscribe, collapsed.snapshot)
  const toggle = useCallback(() => { collapsed.set(id, !collapsed.has(id)) }, [id])
  return [ids.has(id), toggle]
}

/**
 * Observe the in-flight deletions.
 * @returns the ids being deleted.
 */
export function useDeleting(): ReadonlySet<string> {
  return useSyncExternalStore(deleting.subscribe, deleting.snapshot)
}
