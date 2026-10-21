import { describe, expect, it } from 'vitest'
import { chooseRoute, runSideQuestion } from '../src/host/runner.ts'
import type { ChunkLike, GenerateLike, LlmLike, WebLike } from '../src/host/types.ts'

type Script = ChunkLike[]

const route = { provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: 'low' }

function text(value: string, index = 0): ChunkLike[] {
  return [{ type: 'block-start', index, blockType: 'text' }, { type: 'text-delta', index, text: value }]
}

function call(name: string, args: unknown, index = 1, id = `call-${index}`): ChunkLike[] {
  return [{ type: 'tool-call-delta', index, id, name, argumentsDelta: JSON.stringify(args) }]
}

const stop: ChunkLike = { type: 'finish', reason: { kind: 'stop' } }
const toolStop: ChunkLike = { type: 'finish', reason: { kind: 'tool-calls' }, replayState: { response: {}, blocks: [] } }

/** A model that plays one script per call and records every request. */
function fakeLlm(scripts: Script[]): LlmLike & { calls: GenerateLike[] } {
  const calls: GenerateLike[] = []
  return {
    calls,
    async resolveCallConfig(config) { return config },
    stream(options) {
      calls.push(options)
      const script = scripts.shift() ?? [...text('<title>兜底</title>\n\n兜底回答'), stop]
      return (async function* () { yield* script })()
    },
  }
}

const web: WebLike = {
  async search(request) {
    return { content: `summary for ${request.query}`, sources: [{ url: `https://example.test/${encodeURIComponent(request.query)}`, title: request.query }] }
  },
}

const input = { question: '刚才改了哪些文件？', transcript: '用户：\n修复登录', route, maxSteps: 4 }

describe('runSideQuestion', () => {
  it('answers directly and splits off the title', async () => {
    const llm = fakeLlm([[...text('<title>改动文件</title>\n\n改了 `login.ts`。'), stop]])
    const out = await runSideQuestion({ llm, web }, input, new AbortController().signal)
    expect(out).toEqual({ title: '改动文件', answer: '改了 `login.ts`。', sources: [] })
    expect(llm.calls).toHaveLength(1)
    expect(llm.calls[0]?.tools?.map(tool => tool.name)).toEqual(['web_search'])
    expect(llm.calls[0]?.reasoningEffort).toBe('low')
  })

  it('sends no tool structure from the main conversation', async () => {
    const llm = fakeLlm([[...text('<title>t</title>\n\nok'), stop]])
    await runSideQuestion({ llm, web }, input, new AbortController().signal)
    const messages = llm.calls[0]?.messages as Array<{ role: string; content: Array<{ type: string; text?: string }> }>
    expect(messages).toHaveLength(1)
    expect(messages[0]?.role).toBe('user')
    expect(messages[0]?.content.every(block => block.type === 'text')).toBe(true)
    expect(messages[0]?.content[0]?.text).toContain('<conversation_history>\n用户：\n修复登录')
  })

  it('denies a tool it does not have, then answers without tools', async () => {
    const llm = fakeLlm([
      [...call('bash', { cmd: 'git diff' }), toolStop],
      [...text('<title>改动文件</title>\n\n根据记录，改了 login.ts。'), stop],
    ])
    const out = await runSideQuestion({ llm, web }, input, new AbortController().signal)
    expect(out.answer).toBe('根据记录，改了 login.ts。')
    expect(llm.calls).toHaveLength(2)
    // The final request declares no tools and carries no tool blocks.
    expect(llm.calls[1]?.tools).toBeUndefined()
    expect(llm.calls[1]?.messages).toHaveLength(1)
    expect(llm.calls[1]?.system).toContain('你现在没有任何工具')
  })

  it('searches, feeds the results back, and keeps the sources', async () => {
    const llm = fakeLlm([
      [...text('<title>今日新闻</title>', 0), ...call('web_search', { queries: ['今日新闻'] }), toolStop],
      [...text('今天的要闻是…… [来源](https://example.test/x)'), stop],
    ])
    const out = await runSideQuestion({ llm, web }, input, new AbortController().signal)
    expect(out.title).toBe('今日新闻')
    expect(out.answer).toContain('今天的要闻')
    expect(out.sources).toEqual([{ url: 'https://example.test/%E4%BB%8A%E6%97%A5%E6%96%B0%E9%97%BB', title: '今日新闻' }])
    const second = llm.calls[1]?.messages as Array<{ role: string; toolCallId?: string; content: Array<{ text?: string }>; source?: { replayState?: unknown } }>
    expect(second.map(message => message.role)).toEqual(['user', 'assistant', 'tool'])
    expect(second[1]?.source?.replayState).toBeDefined()
    expect(second[2]?.toolCallId).toBe('call-1')
    expect(second[2]?.content[0]?.text).toContain('summary for 今日新闻')
  })

  it('stops searching at the step cap and answers from the gathered results', async () => {
    const searching = (n: number) => [...call('web_search', { queries: [`q${n}`] }, 0, `c${n}`), toolStop]
    const llm = fakeLlm([searching(1), searching(2), [...text('<title>汇总</title>\n\n汇总回答'), stop]])
    const out = await runSideQuestion({ llm, web }, { ...input, maxSteps: 2 }, new AbortController().signal)
    expect(llm.calls).toHaveLength(3)
    expect(llm.calls[2]?.tools).toBeUndefined()
    const final = (llm.calls[2]?.messages[0] as { content: Array<{ text: string }> }).content[0]?.text ?? ''
    expect(final).toContain('<search_results>')
    expect(final).toContain('summary for q1')
    expect(final).toContain('summary for q2')
    expect(out.answer).toBe('汇总回答')
  })

  it('declares no tools at all without a web service', async () => {
    const llm = fakeLlm([[...text('<title>t</title>\n\nok'), stop]])
    await runSideQuestion({ llm }, input, new AbortController().signal)
    expect(llm.calls[0]?.tools).toBeUndefined()
    expect(llm.calls[0]?.system).toContain('你现在没有任何工具')
  })

  it('explains a reply that only tried to call tools', async () => {
    const llm = fakeLlm([
      [...call('read_file', { path: 'a' }), toolStop],
      [...call('read_file', { path: 'a' }), toolStop],
    ])
    const out = await runSideQuestion({ llm, web }, input, new AbortController().signal)
    expect(out.answer).toBe('')
    expect(out.error).toContain('模型试图调用 read_file')
    expect(out.title).toBe('刚才改了哪些文件？')
  })

  it('reports an API error', async () => {
    const llm = fakeLlm([[{ type: 'finish', reason: { kind: 'error', failure: { message: 'quota' } } }]])
    const out = await runSideQuestion({ llm, web }, input, new AbortController().signal)
    expect(out.error).toBe('API 错误：quota')
  })

  it('never streams reasoning into the answer', async () => {
    const llm = fakeLlm([[
      { type: 'reasoning-delta', index: 0, text: '思考中' },
      ...text('<title>t</title>\n\n答案', 1),
      stop,
    ]])
    const out = await runSideQuestion({ llm, web }, input, new AbortController().signal)
    expect(out.answer).toBe('答案')
  })

  it('throws when aborted', async () => {
    const controller = new AbortController()
    controller.abort(new Error('deleted'))
    const llm = fakeLlm([[...text('x'), stop]])
    await expect(runSideQuestion({ llm, web }, input, controller.signal)).rejects.toThrow('deleted')
  })
})

describe('chooseRoute', () => {
  const custom = { provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: 'low' }

  it('uses the configured route in custom mode', () => {
    expect(chooseRoute('custom', custom, { provider: 'x', model: 'y' })).toBe(custom)
  })

  it('follows the session in session mode', () => {
    expect(chooseRoute('session', custom, { provider: 'deepseek-account', model: 'deepseek-v4-pro', reasoningEffort: 'high' }))
      .toEqual({ provider: 'deepseek-account', model: 'deepseek-v4-pro', reasoningEffort: 'high' })
  })

  it('falls back to the configured route when the session has none yet', () => {
    expect(chooseRoute('session', custom, {})).toBe(custom)
  })
})
