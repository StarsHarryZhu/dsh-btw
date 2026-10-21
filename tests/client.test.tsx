// @vitest-environment jsdom
/**
 * The browser half through its real registration path: the built bundle is
 * loaded as the page loads it (a `__ModuleLoader__` registration whose factory
 * receives the module table's `require`), `apply(ctx)` runs as cordis runs it,
 * and the registered components render with real React.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as React from 'react'
import * as JsxRuntime from 'react/jsx-runtime'
import * as ReactDom from 'react-dom'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { encodeAnswer, encodeQuote } from '../src/shared/protocol.ts'
import { appendQuote } from '../src/client/selection.tsx'
import { readValues } from '../src/client/settings.tsx'

type Component = (props: Record<string, unknown>) => React.ReactNode

function loadClient(execute?: (session: string, line: string) => Promise<unknown>) {
  const source = readFileSync(join(import.meta.dirname, '..', 'lib', 'client.js'), 'utf8')
  let registration: { id: string; factory: (require: (request: string) => unknown) => Record<string, unknown> } | undefined
  new Function('window', source)({ __ModuleLoader__: { load: (value: never) => { registration = value } } })
  if (registration === undefined) throw new Error('the bundle did not register itself')
  const exports = registration.factory((request) => {
    if (request === 'react') return React
    if (request === 'react/jsx-runtime') return JsxRuntime
    if (request === 'react-dom') return ReactDom
    // The host markdown renderer is optional; the card falls back to plain text.
    throw new Error(`no module ${request}`)
  })
  const registrations: Array<Record<string, unknown>> = []
  const executed: string[] = []
  const services: Record<string, unknown> = {
    slots: {
      inject: (_name: string, callback: () => unknown) => { callback() },
      register: (options: Record<string, unknown>, component: unknown) => {
        registrations.push({ ...options, component })
        return () => undefined
      },
    },
    locale: { register: () => () => undefined },
    remote: { commands: { execute: execute ?? (async (_session: string, line: string) => { executed.push(line); return { ok: true, value: { result: { kind: 'success' } } } }) } },
    'remote.commands': {},
    'remote.session': {},
    sidebarRightTabs: { register: () => () => undefined },
    configForms: {
      get: () => {
        // A real form keeps its snapshot reference stable until the next change.
        const snapshot = { status: 'ready', value: { modelSource: 'custom', model: 'deepseek-flash', reasoningEffort: 'low' }, writable: true, revision: 1 }
        return { getSnapshot: () => snapshot, subscribe: () => () => undefined, mutate: async () => true }
      },
    },
  }
  const ctx = {
    get: (name: string) => services[name],
    effect: (execute: () => unknown) => { execute() },
    // Like cordis: a scope only runs once every dependency it names is present.
    inject: (deps: string[], callback: (scope: unknown) => void) => { if (deps.every(dep => services[dep] !== undefined)) callback(ctx) },
  }
  ;(exports.apply as (ctx: unknown) => void)(ctx)
  const find = (name: string, key?: string) => registrations.find(entry => entry.name === name && (key === undefined || entry.key === key))?.component as Component
  return { find, executed }
}

const command = (seq: number, name: string, args: string | null, outcome: Record<string, unknown> | null = { kind: 'success' }) => ({
  kind: 'command', seq, time: Date.now(), commandId: `cmd-t-${seq}`, name, args, outcome,
})

function chatOf(nodes: unknown[], closedTurns: number[] = []) {
  const snapshot = {
    legacy: { nodes },
    timeline: { turns: { get: (turn: number) => (closedTurns.includes(turn) ? { status: 'closed' } : undefined) } },
  }
  return <S,>(selector: (value: typeof snapshot) => S) => selector(snapshot)
}

afterEach(() => {
  cleanup()
  localStorage.clear()
})

describe('command rows', () => {
  const { find, executed } = loadClient()
  const Row = find('conversation.chat.commandview', 'btw')
  const ask = command(1, 'btw', ' 刚才改了什么？')
  const answered = command(2, 'btw-answer', ' cmd-t-1', {
    kind: 'success',
    text: encodeAnswer({ for: 'cmd-t-1', title: '改动文件', answer: '改了 login.ts', sources: [{ url: 'https://a.test', title: 'A' }], model: 'deepseek-account/deepseek-flash' }),
  })

  it('shows a spinner and no answer while pending', () => {
    render(<Row node={ask} sessionId="s1" useChat={chatOf([ask])} />)
    expect(screen.getByRole('status').textContent).toContain('正在回答')
    expect(document.querySelector('.dsh-btw-title')?.textContent).toBe('刚才改了什么？')
    expect(document.querySelector('.dsh-btw-answer')).toBeNull()
  })

  it('shows the title, answer, and sources once answered', () => {
    render(<Row node={ask} sessionId="s1" useChat={chatOf([ask, answered])} />)
    expect(screen.getByText('改动文件')).toBeTruthy()
    expect(screen.getByText('改了 login.ts')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'A' }).getAttribute('href')).toBe('https://a.test')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('collapses to the title row and remembers it', () => {
    const { unmount } = render(<Row node={ask} sessionId="s1" useChat={chatOf([ask, answered])} />)
    fireEvent.click(screen.getByRole('button', { name: /改动文件/u }))
    expect(screen.queryByText('改了 login.ts')).toBeNull()
    expect(screen.getByText('改动文件')).toBeTruthy()
    unmount()
    render(<Row node={ask} sessionId="s1" useChat={chatOf([ask, answered])} />)
    expect(screen.queryByText('改了 login.ts')).toBeNull()
    expect(localStorage.getItem('dsh-btw.collapsed.v1')).toContain('cmd-t-1')
  })

  it('deletes through /btw-delete and hides at once', async () => {
    render(<Row node={ask} sessionId="s1" useChat={chatOf([ask, answered])} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '删除' })) })
    expect(executed).toContain('/btw-delete cmd-t-1')
    expect(screen.queryByText('改动文件')).toBeNull()
  })

  it('restores the card when the transport throws synchronously', async () => {
    const broken = loadClient(() => { throw new Error('cannot get property "remote.commands" without inject') })
    const BrokenRow = broken.find('conversation.chat.commandview', 'btw')
    const own = command(9, 'btw', ' 会删不掉吗')
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    render(<BrokenRow node={own} sessionId="s1" useChat={chatOf([own])} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: '停止并删除' })) })
    expect(document.querySelector('.dsh-btw-title')?.textContent).toBe('会删不掉吗')
    expect(screen.getByRole('alert').textContent).toBe('删除失败，请重试。')
  })

  it('renders nothing once a deletion is recorded', () => {
    const other = command(5, 'btw', ' 另一个')
    const { container } = render(<Row node={other} sessionId="s1" useChat={chatOf([other, command(6, 'btw-delete', ' cmd-t-5')])} />)
    expect(container.innerHTML).toBe('')
  })

  it('renders nothing for the internal rows', () => {
    const Answer = find('conversation.chat.commandview', 'btw-answer')
    const { container } = render(<Answer node={answered} />)
    expect(container.innerHTML).toBe('')
  })

  it('shows the error of an answer that failed', () => {
    const failed = command(7, 'btw', ' x')
    const answer = command(8, 'btw-answer', ' cmd-t-7', { kind: 'success', text: encodeAnswer({ for: 'cmd-t-7', title: 't', answer: '', sources: [], error: 'API 错误：quota' }) })
    render(<Row node={failed} sessionId="s1" useChat={chatOf([failed, answer])} />)
    expect(screen.getByRole('alert').textContent).toBe('API 错误：quota')
  })
})

describe('quoted cards', () => {
  const { find } = loadClient()
  const Quote = find('conversation.chat.commandview', 'btw-quote')
  const Tail = find('conversation.chat.turnTail')
  const quote = command(3, 'btw-quote', ` ${encodeQuote({ question: '这段什么意思', quote: '被选中的原文', anchorTurn: 2 })}`)

  it('sits under the quoted reply once its turn has closed', () => {
    const chat = chatOf([quote], [2])
    const { container } = render(<Quote node={quote} sessionId="s1" useChat={chat} />)
    expect(container.innerHTML).toBe('')
    render(<Tail turn={{ turn: 2 }} sessionId="s1" useChat={chat} />)
    expect(document.querySelector('.dsh-btw-title')?.textContent).toBe('这段什么意思')
    expect(screen.getByText('被选中的原文')).toBeTruthy()
    cleanup()
    render(<Tail turn={{ turn: 1 }} sessionId="s1" useChat={chat} />)
    expect(document.querySelector('.dsh-btw-card')).toBeNull()
  })

  it('stays at its command while the turn is open', () => {
    render(<Quote node={quote} sessionId="s1" useChat={chatOf([quote])} />)
    expect(document.querySelector('.dsh-btw-title')?.textContent).toBe('这段什么意思')
  })
})

describe('history tab', () => {
  const { find } = loadClient()
  const History = find('sidebar.right.pane.tab', 'dsh-btw/history')

  it('lists live questions newest first, collapsed, without deleted ones', () => {
    const nodes = [command(1, 'btw', ' 旧问题'), command(2, 'btw', ' 新问题'), command(3, 'btw', ' 删掉的'), command(4, 'btw-delete', ' cmd-t-3')]
    render(<History sessionId="s1" useChat={chatOf(nodes)} />)
    const titles = [...document.querySelectorAll('.dsh-btw-title')].map(node => node.textContent)
    expect(titles).toEqual(['新问题', '旧问题'])
    expect(document.querySelector('.dsh-btw-body')).toBeNull()
  })

  it('says so when there is nothing yet', () => {
    render(<History sessionId="s1" useChat={chatOf([])} />)
    expect(screen.getByText(/还没有旁问/u)).toBeTruthy()
  })

  it('locates the inline card', () => {
    const nodes = [command(1, 'btw', ' 问题')]
    const target = document.createElement('section')
    target.setAttribute('data-dsh-btw-id', 'cmd-t-1')
    target.setAttribute('data-variant', 'inline')
    target.scrollIntoView = vi.fn()
    document.body.appendChild(target)
    render(<History sessionId="s1" useChat={chatOf(nodes)} />)
    fireEvent.click(screen.getByRole('button', { name: '定位' }))
    expect(target.scrollIntoView).toHaveBeenCalled()
    target.remove()
  })
})

describe('settings page', () => {
  const { find } = loadClient()
  const Settings = find('plugins.bundle.config', 'dsh-btw')

  it('summarizes the model', () => {
    render(<Settings view="summary" />)
    expect(document.body.textContent).toContain('deepseek-flash · low')
  })

  it('reads stored values with defaults', () => {
    expect(readValues({ modelSource: 'session', maxSteps: 99 })).toEqual({
      modelSource: 'session', provider: 'deepseek-account', model: 'deepseek-flash', reasoningEffort: 'low', maxSteps: 4,
    })
  })
})

describe('appendQuote', () => {
  it('appends a block quote to the draft', () => {
    expect(appendQuote('', 'a\nb')).toBe('> a\n> b\n\n')
    expect(appendQuote('hello  ', 'x')).toBe('hello\n\n> x\n\n')
  })
})
