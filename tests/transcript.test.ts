import { describe, expect, it } from 'vitest'
import { flattenHistory } from '../src/host/transcript.ts'
import type { MessageLike } from '../src/host/types.ts'

const history: MessageLike[] = [
  { role: 'system', content: [{ type: 'text', text: 'You have bash, read_file, and edit_file.' }] },
  { role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'Fix the login bug' }] },
  {
    role: 'assistant',
    content: [
      { type: 'reasoning', text: 'secret chain of thought' },
      { type: 'text', text: 'Reading the file.' },
      { type: 'tool-call', id: 'call-1', name: 'read_file', arguments: '{"path":"src/login.ts"}' },
    ],
  },
  { role: 'tool', toolCallId: 'call-1', content: [{ type: 'text', text: 'export function login() {}' }] },
  { role: 'developer', content: [{ type: 'tool-addition', toolName: 'web_fetch' }] },
  { role: 'assistant', content: [{ type: 'tool-call', id: 'call-2', name: 'bash', arguments: '{"cmd":"npm test"}' }] },
]

describe('flattenHistory', () => {
  const text = flattenHistory(history)

  it('keeps the conversation as plain text', () => {
    expect(text).toContain('用户：\nFix the login bug')
    expect(text).toContain('Reading the file.')
    expect(text).toContain('（助手调用了工具 read_file：{"path":"src/login.ts"}）')
    expect(text).toContain('（read_file 返回：export function login() {}）')
  })

  it('marks an unanswered call as running', () => {
    expect(text).toContain('（助手调用了工具 bash（进行中）：{"cmd":"npm test"}）')
  })

  it('drops system prompts, developer updates, and reasoning', () => {
    expect(text).not.toContain('You have bash')
    expect(text).not.toContain('web_fetch')
    expect(text).not.toContain('secret chain of thought')
  })

  it('labels injected context and clips it', () => {
    const injected = flattenHistory([{ role: 'user', source: { kind: 'skill' }, content: [{ type: 'text', text: 'x'.repeat(5000) }] }])
    expect(injected.startsWith('（注入的上下文）')).toBe(true)
    expect(injected.length).toBeLessThan(1600)
  })

  it('drops the oldest entries past the budget and says so', () => {
    const many: MessageLike[] = Array.from({ length: 50 }, (_, index) => ({
      role: 'user', content: [{ type: 'text', text: `message ${index} ${'y'.repeat(100)}` }],
    }))
    const clipped = flattenHistory(many, { maxChars: 1000, toolArgsChars: 300, toolResultChars: 1500 })
    expect(clipped.startsWith('（更早的对话已省略）')).toBe(true)
    expect(clipped).toContain('message 49')
    expect(clipped).not.toContain('message 0 ')
  })

  it('returns an empty string for an empty history', () => {
    expect(flattenHistory([])).toBe('')
  })
})
