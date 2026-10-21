import type { Context } from '@deepseek-ai/cordis'
import { describe, expect, it, vi } from 'vitest'
import { Config, apply, hideInternalCommands, type Config as LoadedConfig } from '../src/index.ts'
import type { AgentLike, ChunkLike, CommandDefinitionLike, CommandResultLike, GenerateLike } from '../src/host/types.ts'
import { parseAnswer, type Answer } from '../src/shared/protocol.ts'

/** A model whose reply waits until released, so a test can act mid-answer. */
function gatedLlm() {
  let release: () => void = () => undefined
  const gate = new Promise<void>((resolve) => { release = resolve })
  const calls: GenerateLike[] = []
  return {
    calls,
    release: () => release(),
    async resolveCallConfig(config: GenerateLike) { return config },
    stream(options: GenerateLike): AsyncIterable<ChunkLike> {
      calls.push(options)
      return (async function* () {
        await gate
        if (options.signal?.aborted) return
        yield { type: 'text-delta', index: 0, text: '<title>标题</title>\n\n回答' } as ChunkLike
        yield { type: 'finish', reason: { kind: 'stop' } } as ChunkLike
      })()
    },
  }
}

function volatile<T>(value: T) {
  return { get: () => value }
}

function config(overrides: Partial<Record<keyof LoadedConfig, unknown>> = {}): LoadedConfig {
  return {
    modelSource: volatile(overrides.modelSource ?? 'session'),
    provider: volatile(overrides.provider ?? 'deepseek-account'),
    model: volatile(overrides.model ?? 'deepseek-flash'),
    reasoningEffort: volatile(overrides.reasoningEffort ?? 'low'),
    maxSteps: volatile(overrides.maxSteps ?? 4),
  } as LoadedConfig
}

/** `header` is the session's latest request route; `null` means the session has made no request yet. */
function setup(cfg = config(), header: { provider?: string; model?: string; reasoningEffort?: string } | null = { provider: 'deepseek-account', model: 'deepseek-v4-pro', reasoningEffort: 'high' }) {
  const llm = gatedLlm()
  const definitions = new Map<string, CommandDefinitionLike>()
  const answers: Answer[] = []
  const disposers: Array<() => void> = []
  let seq = 0
  const commands = {
    register(definition: CommandDefinitionLike) {
      definitions.set(definition.name, definition)
      return () => definitions.delete(definition.name)
    },
    list: () => [...definitions.keys()].map(name => ({ name })),
    async execute(agent: AgentLike, line: string, _attachments: readonly never[], signal: AbortSignal) {
      const [, name = '', rest = ''] = /^\/(\S+)(.*)$/su.exec(line) ?? []
      const result = await run(name, rest, agent, signal)
      if (name === 'btw-answer' && result.kind === 'success') answers.push(parseAnswer(result.text)!)
      return result
    },
  }
  const run = async (name: string, rawInput: string, agent: AgentLike, signal = new AbortController().signal): Promise<CommandResultLike> => {
    const definition = definitions.get(name)
    if (definition === undefined) throw new Error(`unknown command ${name}`)
    seq += 1
    return definition.handler({ commandId: `cmd-test-${seq}`, agent, rawInput, signal })
  }
  const agent: AgentLike = {
    options: {},
    session: {
      deriveMessages: () => [{ role: 'user', content: [{ type: 'text', text: '修复登录' }] }],
      requestHeader: () => (header === null ? undefined : { config: header }),
    },
  }
  const ctx = {
    commands,
    llm,
    agents: { withInitiator: <T>(_agent: AgentLike, operation: () => T) => operation() },
    inject: (_deps: string[], callback: (scope: unknown) => void) => {
      callback({ web: { search: async () => ({ sources: [] }) }, effect: (execute: () => () => void) => disposers.push(execute()) })
    },
    effect: (execute: () => (() => void) | void) => { const dispose = execute(); if (typeof dispose === 'function') disposers.push(dispose) },
  }
  apply(ctx as unknown as Context, cfg)
  return { llm, definitions, answers, run, agent, commands, dispose: () => { for (const dispose of disposers.reverse()) dispose() } }
}

describe('apply', () => {
  it('registers /btw and its internal commands', () => {
    const { definitions } = setup()
    expect([...definitions.keys()].sort()).toEqual(['btw', 'btw-answer', 'btw-delete', 'btw-quote'])
  })

  it('hides the internal commands from listings', () => {
    const { commands } = setup()
    expect(commands.list().map(row => row.name)).toEqual(['btw'])
  })

  it('returns at once and records the answer later through /btw-answer', async () => {
    const { run, agent, llm, answers } = setup()
    const result = await run('btw', ' 刚才改了什么？', agent)
    expect(result).toEqual({ kind: 'success' })
    expect(answers).toHaveLength(0)
    llm.release()
    await vi.waitFor(() => expect(answers).toHaveLength(1))
    expect(answers[0]).toMatchObject({ for: 'cmd-test-1', title: '标题', answer: '回答', model: 'deepseek-account/deepseek-v4-pro' })
  })

  it('follows the session route by default', async () => {
    const { run, agent, llm, answers } = setup()
    await run('btw', ' q', agent)
    llm.release()
    await vi.waitFor(() => expect(answers).toHaveLength(1))
    expect(llm.calls[0]).toMatchObject({ provider: 'deepseek-account', model: 'deepseek-v4-pro', reasoningEffort: 'high' })
  })

  it('falls back to deepseek-flash at low effort before the session has a route', async () => {
    const { run, agent, llm, answers } = setup(config(), null)
    await run('btw', ' q', agent)
    llm.release()
    await vi.waitFor(() => expect(answers).toHaveLength(1))
    expect(llm.calls[0]).toMatchObject({ provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: 'low' })
  })

  it('uses the configured route in custom mode', async () => {
    const { run, agent, llm, answers } = setup(config({ modelSource: 'custom' }))
    await run('btw', ' q', agent)
    llm.release()
    await vi.waitFor(() => expect(answers).toHaveLength(1))
    expect(llm.calls[0]).toMatchObject({ model: 'deepseek-flash', reasoningEffort: 'low' })
  })

  it('answers a quote request with the quote in the prompt', async () => {
    const { run, agent, llm, answers } = setup()
    expect(await run('btw-quote', ` ${JSON.stringify({ question: '为什么？', quote: '引用的文字', anchorTurn: 2 })}`, agent)).toEqual({ kind: 'success' })
    llm.release()
    await vi.waitFor(() => expect(answers).toHaveLength(1))
    const prompt = (llm.calls[0]?.messages[0] as { content: Array<{ text: string }> }).content[0]?.text
    expect(prompt).toContain('引用的文字')
  })

  it('deleting a running question aborts it and records no answer', async () => {
    const { run, agent, llm, answers } = setup()
    await run('btw', ' q', agent)
    expect(await run('btw-delete', ' cmd-test-1', agent)).toEqual({ kind: 'success' })
    llm.release()
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(answers).toHaveLength(0)
  })

  it('rejects empty and malformed requests', async () => {
    const { run, agent } = setup()
    expect((await run('btw', '   ', agent)).kind).toBe('error')
    expect((await run('btw-quote', ' {}', agent)).kind).toBe('error')
    expect((await run('btw-delete', ' not an id', agent)).kind).toBe('error')
    expect((await run('btw-answer', ' cmd-unknown-1', agent)).kind).toBe('error')
  })

  it('unregisters on unload and refuses a call that was already in flight', async () => {
    const { definitions, agent, dispose } = setup()
    const handler = definitions.get('btw')!.handler
    dispose()
    expect(definitions.size).toBe(0)
    const result = await handler({ commandId: 'cmd-late-1', agent, rawInput: ' q', signal: new AbortController().signal })
    expect(result.kind).toBe('error')
  })
})

describe('Config', () => {
  it('defaults to the session model, with deepseek-flash at low effort as the custom route', () => {
    const value = Config({}) as Record<string, unknown>
    expect(Object.keys(value).sort()).toEqual(['maxSteps', 'model', 'modelSource', 'provider', 'reasoningEffort'])
    const defaults = Object.fromEntries(Object.entries((Config as unknown as { dict: Record<string, { meta: { default: unknown } }> }).dict)
      .map(([key, field]) => [key, field.meta.default]))
    expect(defaults).toEqual({ modelSource: 'session', provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: 'low', maxSteps: 4 })
  })
})

describe('hideInternalCommands', () => {
  it('restores the original listing', () => {
    const commands = { list: () => [{ name: 'btw' }, { name: 'btw-answer' }] } as never as Parameters<typeof hideInternalCommands>[0]
    const restore = hideInternalCommands(commands)
    expect(commands.list().map(row => row.name)).toEqual(['btw'])
    restore()
    expect(commands.list().map(row => row.name)).toEqual(['btw', 'btw-answer'])
  })
})
