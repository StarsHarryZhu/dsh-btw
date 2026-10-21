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
import type { Context } from '@deepseek-ai/cordis';
import z from '@deepseek-ai/schemastery';
import type { CommandsLike, VolatileLike } from './host/types.ts';
export declare const name = "dsh-btw";
export declare const inject: string[];
/** Live settings; the plugin's settings page edits them. */
export declare const Config: z<Schemastery.ObjectS<NoInfer<{
    modelSource: z<"session" | "custom", "session" | "custom", "volatile-defined">;
    provider: z<string, string, "volatile-defined">;
    model: z<string, string, "volatile-defined">;
    reasoningEffort: z<string, string, "volatile-defined">;
    maxSteps: z<number, number, "volatile-defined">;
}>>, Schemastery.ObjectT<NoInfer<{
    modelSource: z<"session" | "custom", "session" | "custom", "volatile-defined">;
    provider: z<string, string, "volatile-defined">;
    model: z<string, string, "volatile-defined">;
    reasoningEffort: z<string, string, "volatile-defined">;
    maxSteps: z<number, number, "volatile-defined">;
}>>, "plain">;
/** The loaded config: every field is live. */
export interface Config {
    modelSource: VolatileLike<string>;
    provider: VolatileLike<string>;
    model: VolatileLike<string>;
    reasoningEffort: VolatileLike<string>;
    maxSteps: VolatileLike<number>;
}
/**
 * Register the commands.
 * @param ctx - the plugin context; `commands`, `llm`, and `agents` are injected.
 * @param config - live settings.
 */
export declare function apply(ctx: Context, config: Config): void;
/**
 * Keep the internal commands out of the slash menu. The registry has no
 * hidden flag, so its `list` is filtered while this plugin runs.
 * @param commands - the command registry.
 * @returns the restorer.
 */
export declare function hideInternalCommands(commands: CommandsLike): () => void;
