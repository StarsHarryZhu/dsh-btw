/**
 * Side questions as the Session log records them.
 *
 * Every view — the inline card, the card under a quoted reply, the sidebar
 * history — derives from the same command nodes in the Chat snapshot, so they
 * agree without any shared client state. The derivation is cached per node
 * list, so all views pay for it once per change.
 * @module dsh-btw/client/records
 */

import {
  CMD_ANSWER, CMD_ASK, CMD_DELETE, CMD_QUOTE, JOB_TIMEOUT_MS, parseAnswer, parseQuote, type Answer,
} from '../shared/protocol.ts'
import type { ChatSnapshotLike, CommandNodeLike } from './host.ts'

/** One side question and whatever is known about its answer. */
export interface BtwRecord {
  /** Command id of the asking command. */
  readonly id: string
  readonly kind: 'ask' | 'quote'
  readonly seq: number
  /** Unix epoch ms of the question. */
  readonly time: number
  readonly question: string
  readonly quote?: string
  readonly anchorTurn?: number
  readonly status: 'pending' | 'done' | 'error'
  readonly answer?: Answer
  /** Why the question never started (the asking command itself failed). */
  readonly error?: string
}

/** Every live side question of one session. */
export interface BtwRecords {
  /** Not deleted, oldest first. */
  readonly list: readonly BtwRecord[]
  readonly byId: ReadonlyMap<string, BtwRecord>
}

const EMPTY: BtwRecords = { list: [], byId: new Map() }
const NO_NODES: readonly CommandNodeLike[] = []
const cache = new WeakMap<readonly CommandNodeLike[], BtwRecords>()

/**
 * The command nodes of a Chat snapshot.
 * @param snapshot - the Chat snapshot, possibly from an older host.
 * @returns its node list, or an empty one.
 */
export function nodesOf(snapshot: ChatSnapshotLike | undefined): readonly CommandNodeLike[] {
  const nodes = snapshot?.legacy?.nodes
  return Array.isArray(nodes) ? nodes : NO_NODES
}

/**
 * Fold command nodes into side questions.
 * @param nodes - the conversation's nodes in seq order.
 * @returns the live records; the same object for the same node list.
 */
export function deriveRecords(nodes: readonly CommandNodeLike[]): BtwRecords {
  if (nodes.length === 0) return EMPTY
  const cached = cache.get(nodes)
  if (cached !== undefined) return cached
  const asked: BtwRecord[] = []
  const answers = new Map<string, Answer>()
  const deleted = new Set<string>()
  for (const node of nodes) {
    if (node.kind !== 'command' || typeof node.commandId !== 'string') continue
    const base = { id: node.commandId, seq: node.seq ?? 0, time: node.time ?? 0 }
    const failed = node.outcome?.kind === 'error' ? node.outcome.text ?? '' : undefined
    switch (node.name) {
      case CMD_ASK: {
        const question = node.args?.trim() ?? ''
        if (!question) break
        asked.push({ ...base, kind: 'ask', question, ...failed === undefined ? { status: 'pending' } : { status: 'error', error: failed } })
        break
      }
      case CMD_QUOTE: {
        const request = parseQuote(node.args)
        if (request === undefined) break
        asked.push({
          ...base, kind: 'quote', question: request.question, quote: request.quote,
          ...request.anchorTurn === undefined ? {} : { anchorTurn: request.anchorTurn },
          ...failed === undefined ? { status: 'pending' } : { status: 'error', error: failed },
        })
        break
      }
      case CMD_ANSWER: {
        const answer = node.outcome?.kind === 'success' ? parseAnswer(node.outcome.text) : undefined
        if (answer !== undefined) answers.set(answer.for, answer)
        break
      }
      case CMD_DELETE: {
        const id = node.args?.trim()
        if (id) deleted.add(id)
        break
      }
      default: break
    }
  }
  const list = asked
    .filter(record => !deleted.has(record.id))
    .map((record): BtwRecord => {
      const answer = answers.get(record.id)
      if (answer === undefined || record.status === 'error') return record
      return { ...record, answer, status: answer.error === undefined ? 'done' : 'error' }
    })
  const records: BtwRecords = { list, byId: new Map(list.map(record => [record.id, record])) }
  cache.set(nodes, records)
  return records
}

/**
 * Whether a pending question has outlived any job that could still answer it
 * (the host restarted or the plugin was reloaded mid-answer).
 * @param record - the record.
 * @param now - the current time.
 * @returns true when it will never answer.
 */
export function isStale(record: BtwRecord, now = Date.now()): boolean {
  return record.status === 'pending' && record.time > 0 && now - record.time > JOB_TIMEOUT_MS + 60_000
}

/**
 * Records drawn under one turn's reply.
 * @param records - the session's records.
 * @param turn - the turn.
 * @returns quote records anchored to that turn.
 */
export function anchoredTo(records: BtwRecords, turn: number): readonly BtwRecord[] {
  return records.list.filter(record => record.kind === 'quote' && record.anchorTurn === turn)
}

/** Compare two record lists by identity of their members. */
export function sameList(a: readonly BtwRecord[], b: readonly BtwRecord[]): boolean {
  return a.length === b.length && a.every((record, index) => record === b[index])
}
