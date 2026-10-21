/**
 * Answer one side question with direct model calls.
 *
 * The request is built so it can never be "tool history without tool
 * declarations": the main conversation arrives flattened to text, the only
 * declared tool is `web_search` (when the web service exists), and the only
 * native tool blocks in the request are this loop's own search calls. The
 * remaining safeguards follow Claude Code's `/btw`: a reminder that the model
 * cannot act, a denial for any other tool name, a hard step cap, and a readable
 * fallback when the model produced no text.
 * @module dsh-btw/host/runner
 */
import { randomUUID } from 'node:crypto';
import { fallbackTitle } from "../shared/protocol.js";
import { splitTitle, systemPrompt, userPrompt } from "./prompt.js";
import { SEARCH_TOOL, SEARCH_TOOL_NAME, runSearch } from "./search.js";
/** Sources a card lists at most; the model still sees every search result. */
const MAX_SOURCES = 8;
/** Text the model got instead of a tool it does not have. */
const DENIED = `旁问只能使用 ${SEARCH_TOOL_NAME}，不能读文件、运行命令或调用其他工具。请直接根据已有信息回答。`;
/**
 * Run the side question to completion.
 * @param deps - the LLM and optional web services.
 * @param input - question, context, route, and step budget.
 * @param signal - aborts every model call and search.
 * @returns the title, answer, and sources, or an error message.
 */
export async function runSideQuestion(deps, input, signal) {
    const search = deps.web;
    const sources = [];
    const searchLog = [];
    const attempted = [];
    const titles = [];
    const base = { transcript: input.transcript, question: input.question, ...input.quote === undefined ? {} : { quote: input.quote } };
    const messages = [{ role: 'user', content: [{ type: 'text', text: userPrompt(base) }] }];
    let finalText;
    if (search !== undefined) {
        for (let step = 0; step < Math.max(1, input.maxSteps); step++) {
            const reply = await callModel(deps.llm, {
                ...input.route, system: systemPrompt('search'), messages, tools: [SEARCH_TOOL], signal,
            });
            if (reply.error !== undefined)
                return failure(input.question, reply.error);
            const text = textOf(reply.blocks);
            const calls = reply.blocks.filter(isToolCall);
            if (text)
                titles.push(splitTitle(text).title);
            if (calls.length === 0 || reply.finish === 'max-tokens') {
                finalText = text;
                break;
            }
            messages.push({
                id: randomUUID(),
                role: 'assistant',
                content: reply.blocks,
                source: { kind: 'model', provider: input.route.provider, model: input.route.model, ...reply.replayState === undefined ? {} : { replayState: reply.replayState } },
            });
            let searched = false;
            for (const call of calls) {
                let content;
                let isError;
                if (call.name === SEARCH_TOOL_NAME) {
                    const outcome = await runSearch(search, call.arguments, signal);
                    content = outcome.text;
                    isError = outcome.isError;
                    searched = searched || !outcome.isError;
                    if (!outcome.isError)
                        searchLog.push(outcome.text);
                    for (const source of outcome.sources) {
                        if (sources.length < MAX_SOURCES && !sources.some(known => known.url === source.url))
                            sources.push(source);
                    }
                }
                else {
                    attempted.push(call.name);
                    content = DENIED;
                    isError = true;
                }
                messages.push({
                    id: randomUUID(), role: 'tool', source: { kind: 'tool', callId: call.id }, toolCallId: call.id,
                    content: [{ type: 'text', text: content }], isError,
                });
            }
            // Only denied calls: like Claude Code's single turn, give it no second
            // chance at the same mistake; the tool-free request below decides.
            if (!searched)
                break;
        }
    }
    if (finalText === undefined || !finalText.trim()) {
        // Tool-free, structure-free final request: the gathered results ride in
        // the text, so no tool block appears without its declaration.
        const reply = await callModel(deps.llm, {
            ...input.route,
            system: systemPrompt('none'),
            messages: [{ role: 'user', content: [{ type: 'text', text: userPrompt({ ...base, searchResults: searchLog }) }] }],
            signal,
        });
        if (reply.error !== undefined)
            return failure(input.question, reply.error);
        finalText = textOf(reply.blocks);
        if (!finalText)
            attempted.push(...reply.blocks.filter(isToolCall).map(call => call.name));
    }
    const { title, body } = splitTitle(finalText ?? '');
    const chosen = title || titles.find(Boolean) || fallbackTitle(input.question);
    if (!body) {
        const error = attempted.length > 0
            ? `模型试图调用 ${[...new Set(attempted)].join('、')}，而没有直接回答。换个问法再试，或到主对话里问。`
            : '模型没有返回文字回答。';
        return { title: chosen, answer: '', sources, error };
    }
    return { title: chosen, answer: body, sources };
}
function failure(question, error) {
    return { title: fallbackTitle(question), answer: '', sources: [], error };
}
/**
 * Stream one request and assemble it, dropping nothing: the blocks (reasoning
 * included) stay aligned with the adapter's replay state when sent back.
 */
async function callModel(llm, options) {
    const partials = new Map();
    const order = [];
    const ensure = (index, type) => {
        let partial = partials.get(index);
        if (partial === undefined) {
            partial = { type, text: '', args: '' };
            partials.set(index, partial);
            order.push(index);
        }
        return partial;
    };
    let finish = 'stop';
    let replayState;
    let error;
    for await (const chunk of llm.stream(options)) {
        switch (chunk.type) {
            case 'block-start':
                ensure(chunk.index, chunk.blockType);
                break;
            case 'text-delta':
                ensure(chunk.index, 'text').text += chunk.text;
                break;
            // Reasoning is kept for replay and never shown.
            case 'reasoning-delta':
                ensure(chunk.index, 'reasoning').text += chunk.text;
                break;
            case 'tool-call-delta': {
                const partial = ensure(chunk.index, 'tool-call');
                partial.id = chunk.id;
                if (chunk.name)
                    partial.name = chunk.name;
                partial.args += chunk.argumentsDelta;
                break;
            }
            case 'block-end': {
                const partial = ensure(chunk.index, chunk.block.type);
                partial.block ??= chunk.block;
                break;
            }
            case 'finish':
                finish = chunk.reason.kind;
                replayState = chunk.replayState;
                if (finish === 'error' || finish === 'aborted')
                    error = `API 错误：${chunk.reason.failure?.message ?? finish}`;
                break;
            default: break;
        }
    }
    if (options.signal?.aborted)
        throw options.signal.reason ?? new Error('aborted');
    const blocks = order.map((index) => {
        const partial = partials.get(index);
        if (partial.block !== undefined)
            return partial.block;
        if (partial.type === 'tool-call')
            return { type: 'tool-call', id: partial.id ?? `call-${index}`, name: partial.name ?? '', arguments: partial.args };
        return { type: partial.type === 'reasoning' ? 'reasoning' : 'text', text: partial.text };
    });
    return { blocks, finish, ...replayState === undefined ? {} : { replayState }, ...error === undefined ? {} : { error } };
}
function textOf(blocks) {
    return blocks.filter(block => block.type === 'text').map(block => String(block.text ?? '')).join('').trim();
}
function isToolCall(block) {
    return block.type === 'tool-call';
}
/**
 * The route a side question runs on.
 * @param source - `custom` uses the configured route, `session` the main session's latest one.
 * @param custom - the configured route.
 * @param session - the session's latest request route, when it has one.
 * @returns the route to validate.
 */
export function chooseRoute(source, custom, session) {
    if (source === 'session' && session?.provider && session.model) {
        return { provider: session.provider, model: session.model, ...session.reasoningEffort ? { reasoningEffort: session.reasoningEffort } : {} };
    }
    return custom;
}
