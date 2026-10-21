import { describe, expect, it } from 'vitest'
import {
  MAX_QUOTE, encodeAnswer, encodeQuote, fallbackTitle, isCommandId, parseAnswer, parseQuote,
} from '../src/shared/protocol.ts'

describe('answer envelope', () => {
  it('round-trips', () => {
    const answer = { for: 'cmd-ab12cd34-3', title: '风险', answer: '**两点**', sources: [{ url: 'https://a.test', title: 'A' }], model: 'p/m' }
    expect(parseAnswer(encodeAnswer(answer))).toEqual(answer)
  })

  it('keeps an error answer', () => {
    expect(parseAnswer(encodeAnswer({ for: 'cmd-x-1', title: 't', answer: '', sources: [], error: 'boom' }))?.error).toBe('boom')
  })

  it('rejects text that is not ours', () => {
    expect(parseAnswer(undefined)).toBeUndefined()
    expect(parseAnswer('plain text')).toBeUndefined()
    expect(parseAnswer('{"for":"x"}')).toBeUndefined()
    expect(parseAnswer('{broken')).toBeUndefined()
  })
})

describe('quote request', () => {
  it('round-trips with an anchor', () => {
    expect(parseQuote(encodeQuote({ question: ' why? ', quote: 'a\nb', anchorTurn: 3 }))).toEqual({ question: 'why?', quote: 'a\nb', anchorTurn: 3 })
  })

  it('drops an invalid anchor and rejects empty or oversized parts', () => {
    expect(parseQuote(JSON.stringify({ question: 'q', quote: 'x', anchorTurn: -1 }))).toEqual({ question: 'q', quote: 'x' })
    expect(parseQuote(JSON.stringify({ question: '', quote: 'x' }))).toBeUndefined()
    expect(parseQuote(JSON.stringify({ question: 'q', quote: '  ' }))).toBeUndefined()
    expect(parseQuote(JSON.stringify({ question: 'q', quote: 'x'.repeat(MAX_QUOTE + 1) }))).toBeUndefined()
  })
})

describe('helpers', () => {
  it('accepts host command ids only', () => {
    expect(isCommandId('cmd-1a2b3c4d-7')).toBe(true)
    expect(isCommandId('a b')).toBe(false)
    expect(isCommandId('')).toBe(false)
  })

  it('shortens a fallback title to the first line', () => {
    expect(fallbackTitle('第一行\n第二行')).toBe('第一行')
    expect(fallbackTitle('x'.repeat(40))).toHaveLength(24)
  })
})
