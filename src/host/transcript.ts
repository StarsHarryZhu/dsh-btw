/**
 * Flatten the main conversation into plain text.
 *
 * This is the fix for phantom tool calls. Forking the parent history replays
 * its native `tool_use` / `tool_result` blocks; a request that carries those
 * blocks but declares none of their tools is out of distribution, and the model
 * keeps calling tools it no longer has. Here every tool call and result becomes
 * a neutral sentence inside one user message, so the side request contains no
 * tool structure at all except the tools it actually declares.
 * @module dsh-btw/host/transcript
 */

import type { BlockLike, MessageLike } from './types.ts'

/** Budgets, in UTF-16 code units. */
export interface TranscriptLimits {
  /** Whole transcript; the oldest entries are dropped first. */
  maxChars: number
  /** One tool call's arguments. */
  toolArgsChars: number
  /** One tool result, or one injected context message. */
  toolResultChars: number
}

export const DEFAULT_LIMITS: TranscriptLimits = { maxChars: 120_000, toolArgsChars: 300, toolResultChars: 1500 }

/**
 * Render the model-visible history as a transcript.
 * @param messages - `agent.session.deriveMessages()`.
 * @param limits - character budgets.
 * @returns plain text with no tool-call structure; empty for an empty history.
 */
export function flattenHistory(messages: readonly MessageLike[], limits: TranscriptLimits = DEFAULT_LIMITS): string {
  const toolNames = new Map<string, string>()
  const answered = new Set<string>()
  for (const message of messages) if (message.role === 'tool' && message.toolCallId) answered.add(message.toolCallId)
  const entries: string[] = []
  for (const message of messages) {
    const entry = renderMessage(message, toolNames, answered, limits)
    if (entry) entries.push(entry)
  }
  const kept: string[] = []
  let used = 0
  for (let index = entries.length - 1; index >= 0; index--) {
    const entry = entries[index] as string
    if (kept.length > 0 && used + entry.length > limits.maxChars) break
    kept.push(entry.length > limits.maxChars ? clip(entry, limits.maxChars) : entry)
    used += entry.length
  }
  kept.reverse()
  if (kept.length < entries.length) kept.unshift('（更早的对话已省略）')
  return kept.join('\n\n')
}

function renderMessage(
  message: MessageLike,
  toolNames: Map<string, string>,
  answered: ReadonlySet<string>,
  limits: TranscriptLimits,
): string {
  switch (message.role) {
    case 'user': {
      const text = userText(message.content)
      if (!text) return ''
      const human = message.source === undefined || message.source.kind === undefined || message.source.kind === 'user'
      return human ? `用户：\n${text}` : `（注入的上下文）\n${clip(text, limits.toolResultChars)}`
    }
    case 'assistant': {
      const parts: string[] = []
      for (const block of message.content) {
        if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) parts.push(block.text.trim())
        else if (isToolCall(block)) {
          toolNames.set(block.id, block.name)
          const pending = answered.has(block.id) ? '' : '（进行中）'
          parts.push(`（助手调用了工具 ${block.name}${pending}：${clip(block.arguments.trim(), limits.toolArgsChars)}）`)
        }
      }
      return parts.length > 0 ? `助手：\n${parts.join('\n')}` : ''
    }
    case 'tool': {
      const name = (message.toolCallId && toolNames.get(message.toolCallId)) || '工具'
      const text = userText(message.content) || '（无输出）'
      return `（${name} ${message.isError ? '失败' : '返回'}：${clip(text, limits.toolResultChars)}）`
    }
    default:
      // System prompts and developer updates describe the main agent's tools and
      // rules; repeating them would invite the very tool calls this avoids.
      return ''
  }
}

function userText(content: readonly BlockLike[]): string {
  const parts: string[] = []
  for (const block of content) {
    if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
    else if (block.type === 'image') parts.push('[图片]')
    else if (block.type === 'file') parts.push(`[文件${fileName(block)}]`)
  }
  return parts.join('\n').trim()
}

function fileName(block: BlockLike): string {
  const attachment = (block as { attachment?: { name?: unknown } }).attachment
  return typeof attachment?.name === 'string' ? ` ${attachment.name}` : ''
}

function isToolCall(block: BlockLike): block is { type: 'tool-call'; id: string; name: string; arguments: string } {
  return block.type === 'tool-call' && typeof block.id === 'string' && typeof block.name === 'string' && typeof block.arguments === 'string'
}

/**
 * Shorten text to a budget, marking the cut.
 * @param text - the text.
 * @param max - the budget.
 * @returns text of at most `max` characters plus the marker.
 */
export function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}…（已截断）`
}
