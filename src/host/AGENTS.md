# AGENTS.md

## 1. Role

The side-question engine of the host half. Given the main agent, a question, and an optional quote, it flattens the main conversation to text, builds a prompt adapted from Claude Code's `/btw` reminder, calls the configured model directly through `ctx.llm` with `web_search` as the only tool, and returns a title, a Markdown answer, and sources. `src/index.ts` runs it as a detached job per command id.

## 2. Constraints

- No native tool blocks from the main conversation may appear in a request; only this loop's own `web_search` calls and results, always with `web_search` declared.
- Any other tool name gets an error result; a step with only denied calls ends the tool loop.
- After `maxSteps` tool-using calls the final request has no tools and carries gathered search results as text.
- Reasoning deltas are assembled for adapter replay and never returned.
- Search goes to the `web` service directly, never through the tool registry, so the main agent's approvals and logs are untouched.
- Host services are typed structurally in `types.ts`; no runtime import of harness packages.

## 3. Contents

- `transcript.ts` — flatten `deriveMessages()` into plain text with per-entry and total budgets.
- `prompt.ts` — system prompt, the single user message, and `<title>` extraction.
- `search.ts` — the `web_search` declaration and its execution over `ctx.web`.
- `runner.ts` — the model loop, stream assembly, denial, step cap, fallbacks, and route choice.
- `jobs.ts` — running jobs keyed by command id, with limit, timeout, deletion, and disposal.
- `types.ts` — structural types of the host services used.

## 4. Progress

- Done: all modules implemented and covered by `tests/runner.test.ts`, `tests/transcript.test.ts`, and `tests/host.test.ts`.
- Open: tune the transcript budget if long sessions prove slow on the default model.
- Goal later: optional UI tools alongside `web_search`.
