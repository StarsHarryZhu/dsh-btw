/**
 * dsh-btw host half.
 *
 * Registers `/btw` and its three internal commands. A question command returns
 * immediately; the answer is produced by direct model calls (see
 * `host/runner.ts`) and recorded later through `/btw-answer`, so the composer is
 * never held and every card can be rebuilt from the Session log. Nothing here
 * runs inside the main agent: no fork, no tool registry, no turn.
 * @module dsh-btw
 */
import z from '@deepseek-ai/schemastery';
import { Jobs } from "./host/jobs.js";
import { chooseRoute, runSideQuestion } from "./host/runner.js";
import { flattenHistory } from "./host/transcript.js";
import { CMD_ANSWER, CMD_ASK, CMD_DELETE, CMD_QUOTE, INTERNAL_COMMANDS, MAX_QUESTION, PLUGIN_ID, encodeAnswer, fallbackTitle, isCommandId, parseQuote, } from "./shared/protocol.js";
export const name = PLUGIN_ID;
export const inject = ['commands', 'llm', 'agents'];
/** Live settings; the plugin's settings page edits them. */
export const Config = z.object({
    modelSource: z.union(['custom', 'session']).default('custom')
        .description('custom: the route below; session: the main session\'s current model').volatile(),
    provider: z.string().default('deepseek-account').description('Provider route for custom mode').volatile(),
    model: z.string().default('deepseek-flash').description('Model for custom mode').volatile(),
    reasoningEffort: z.string().default('low').description('Reasoning effort for custom mode; empty uses the model default').volatile(),
    maxSteps: z.natural().min(1).max(8).default(4).description('Model calls that may search before the final answer').volatile(),
});
/**
 * Register the commands.
 * @param ctx - the plugin context; `commands`, `llm`, and `agents` are injected.
 * @param config - live settings.
 */
export function apply(ctx, config) {
    const host = ctx;
    const { commands, llm, agents } = host;
    let web;
    ctx.inject(['web'], (scope) => {
        const service = scope.web;
        web = service;
        scope.effect(() => () => { if (web === service)
            web = undefined; });
    });
    const jobs = new Jobs(4, undefined, error => console.warn(`${PLUGIN_ID}:`, error));
    ctx.effect(() => () => jobs.dispose());
    ctx.effect(() => hideInternalCommands(commands));
    /** Answers waiting for their `/btw-answer` record. */
    const ready = new Map();
    const publish = async (agent, answer) => {
        ready.set(answer.for, answer);
        try {
            await commands.execute(agent, `/${CMD_ANSWER} ${answer.for}`, [], new AbortController().signal);
        }
        catch (error) {
            console.warn(`${PLUGIN_ID}: the answer to ${answer.for} could not be recorded`, error);
        }
        finally {
            ready.delete(answer.for);
        }
    };
    const answer = async (agent, id, question, quote, signal) => {
        let output;
        let model;
        try {
            output = await agents.withInitiator(agent, async () => {
                const custom = {
                    provider: config.provider.get(),
                    model: config.model.get(),
                    ...config.reasoningEffort.get() ? { reasoningEffort: config.reasoningEffort.get() } : {},
                };
                const session = agent.session.requestHeader?.()?.config ?? agent.options;
                const route = await llm.resolveCallConfig(chooseRoute(config.modelSource.get(), custom, session), signal);
                model = `${route.provider}/${route.model}`;
                const transcript = flattenHistory(agent.session.deriveMessages());
                return runSideQuestion({ llm, web }, { question, ...quote === undefined ? {} : { quote }, transcript, route, maxSteps: config.maxSteps.get() }, signal);
            });
        }
        catch (error) {
            const reason = signal.aborted ? signal.reason : error;
            const text = reason instanceof Error && reason.message === 'timeout'
                ? '旁问超时，已取消。'
                : signal.aborted ? '旁问已取消。' : `旁问失败：${reason instanceof Error ? reason.message : String(reason)}`;
            output = { title: fallbackTitle(question), answer: '', sources: [], error: text };
        }
        if (!jobs.live(id))
            return;
        await publish(agent, { for: id, ...output, ...model === undefined ? {} : { model } });
    };
    const start = (invocation, question, quote) => {
        const refused = jobs.start(invocation.commandId, signal => answer(invocation.agent, invocation.commandId, question, quote, signal));
        if (refused === 'busy')
            return { kind: 'error', text: '正在回答的旁问太多，请稍后再试。' };
        if (refused !== undefined)
            return { kind: 'error', text: '旁问插件已停止，请重新加载后再试。' };
        return { kind: 'success' };
    };
    ctx.effect(() => commands.register({
        name: CMD_ASK,
        description: '旁问：根据当前对话回答，不打断主任务',
        input: { hint: '旁问内容' },
        handler: (invocation) => {
            const question = invocation.rawInput.trim();
            if (!question)
                return { kind: 'error', text: '请输入旁问内容，例如 /btw 刚才的方案有什么风险' };
            if (question.length > MAX_QUESTION)
                return { kind: 'error', text: `旁问最多 ${MAX_QUESTION} 个字符。` };
            return start(invocation, question);
        },
    }));
    ctx.effect(() => commands.register({
        name: CMD_QUOTE,
        description: 'BTW: side question about selected text (internal)',
        handler: (invocation) => {
            const request = parseQuote(invocation.rawInput.trim());
            if (request === undefined)
                return { kind: 'error', text: '划词旁问的请求无效。' };
            return start(invocation, request.question, request.quote);
        },
    }));
    ctx.effect(() => commands.register({
        name: CMD_ANSWER,
        description: 'BTW: record a finished answer (internal)',
        handler: (invocation) => {
            const found = ready.get(invocation.rawInput.trim());
            return found === undefined
                ? { kind: 'error', text: '没有待记录的旁问回答。' }
                : { kind: 'success', text: encodeAnswer(found) };
        },
    }));
    ctx.effect(() => commands.register({
        name: CMD_DELETE,
        description: 'BTW: delete a side question (internal)',
        handler: (invocation) => {
            const id = invocation.rawInput.trim();
            if (!isCommandId(id))
                return { kind: 'error', text: '旁问标识无效。' };
            jobs.delete(id);
            return { kind: 'success' };
        },
    }));
}
/**
 * Keep the internal commands out of the slash menu. The registry has no
 * hidden flag, so its `list` is filtered while this plugin runs.
 * @param commands - the command registry.
 * @returns the restorer.
 */
export function hideInternalCommands(commands) {
    const descriptor = Object.getOwnPropertyDescriptor(commands, 'list');
    const original = commands.list;
    let active = true;
    const filtered = function (agent) {
        const rows = original.call(this, agent);
        return active ? Object.freeze(rows.filter(row => !INTERNAL_COMMANDS.includes(row.name))) : rows;
    };
    Object.defineProperty(commands, 'list', { configurable: true, writable: true, value: filtered });
    return () => {
        active = false;
        if (Object.getOwnPropertyDescriptor(commands, 'list')?.value !== filtered)
            return;
        if (descriptor)
            Object.defineProperty(commands, 'list', descriptor);
        else
            Reflect.deleteProperty(commands, 'list');
    };
}
