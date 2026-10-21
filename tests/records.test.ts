import { describe, expect, it } from 'vitest'
import type { CommandNodeLike } from '../src/client/host.ts'
import { anchoredTo, deriveRecords, isStale, nodesOf } from '../src/client/records.ts'
import { JOB_TIMEOUT_MS, encodeAnswer, encodeQuote } from '../src/shared/protocol.ts'

const command = (seq: number, name: string, args: string | null, outcome: CommandNodeLike['outcome'] = { kind: 'success' }): CommandNodeLike => ({
  kind: 'command', seq, time: 1000 + seq, commandId: `cmd-t-${seq}`, name, args, outcome,
})

const nodes: CommandNodeLike[] = [
  { kind: 'user', seq: 0 } as CommandNodeLike,
  command(1, 'btw', ' 第一个问题'),
  command(2, 'btw-quote', ` ${encodeQuote({ question: '这段什么意思', quote: '原文', anchorTurn: 4 })}`),
  command(3, 'btw', ' 还在回答'),
  command(4, 'btw-answer', ' cmd-t-1', { kind: 'success', text: encodeAnswer({ for: 'cmd-t-1', title: '标题一', answer: '回答一', sources: [] }) }),
  command(5, 'btw-answer', ' cmd-t-2', { kind: 'success', text: encodeAnswer({ for: 'cmd-t-2', title: '', answer: '', sources: [], error: '失败了' }) }),
  command(6, 'btw', ' 被删掉的'),
  command(7, 'btw-delete', ' cmd-t-6'),
  command(8, 'btw', ' 没启动', { kind: 'error', text: '太多了' }),
  command(9, 'compact', ''),
]

describe('deriveRecords', () => {
  const records = deriveRecords(nodes)

  it('keeps live questions in order and drops deleted ones', () => {
    expect(records.list.map(record => record.id)).toEqual(['cmd-t-1', 'cmd-t-2', 'cmd-t-3', 'cmd-t-8'])
  })

  it('joins each answer to its question', () => {
    expect(records.byId.get('cmd-t-1')).toMatchObject({ status: 'done', question: '第一个问题', answer: { title: '标题一' } })
    expect(records.byId.get('cmd-t-2')).toMatchObject({ status: 'error', kind: 'quote', quote: '原文', anchorTurn: 4 })
    expect(records.byId.get('cmd-t-3')?.status).toBe('pending')
    expect(records.byId.get('cmd-t-8')).toMatchObject({ status: 'error', error: '太多了' })
  })

  it('is cached per node list', () => {
    expect(deriveRecords(nodes)).toBe(records)
    expect(deriveRecords([...nodes])).not.toBe(records)
  })

  it('finds the cards anchored to a turn', () => {
    expect(anchoredTo(records, 4).map(record => record.id)).toEqual(['cmd-t-2'])
    expect(anchoredTo(records, 3)).toEqual([])
  })
})

describe('helpers', () => {
  it('reads nodes defensively', () => {
    expect(nodesOf(undefined)).toEqual([])
    expect(nodesOf({ legacy: { nodes } })).toBe(nodes)
  })

  it('marks a pending question stale once no job could still answer it', () => {
    const pending = deriveRecords(nodes).byId.get('cmd-t-3')!
    expect(isStale(pending, pending.time + 1000)).toBe(false)
    expect(isStale(pending, pending.time + JOB_TIMEOUT_MS + 120_000)).toBe(true)
  })
})
