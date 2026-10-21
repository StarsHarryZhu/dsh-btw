# AGENTS.md

## 1. Role

The vitest specs. Host specs drive the engine and the command wiring with fake LLM, web, agent, and command services; the client spec loads the built `lib/client.js` the way the page does and renders the registered components with real React in jsdom; one spec checks this documentation set. `npm test` builds first, so the client spec always runs against the current bundle.

## 2. Constraints

- Never call a real model or the network; fakes play scripted stream chunks.
- The client spec must go through the bundle's `__ModuleLoader__` registration and `apply(ctx)`, not import components directly, except for pure helpers.
- Fakes must honor host contracts that matter to React, such as stable snapshot references.

## 3. Contents

- `transcript.test.ts` — history flattening: no tool structure, budgets, dropped system and reasoning text.
- `protocol.test.ts` — envelope and quote encodings, id and title helpers.
- `runner.test.ts` — the model loop: direct answers, denial, search, step cap, fallbacks, route choice.
- `host.test.ts` — command registration, immediate return, deferred `/btw-answer`, deletion, config defaults.
- `records.test.ts` — folding command nodes into records, anchoring, staleness.
- `client.test.tsx` — cards, collapse, deletion, quoted cards in turn tails, history tab, settings, and the selection bar.
- `manifest.test.ts` — package name, version, engine range, Plugins-page title, bundle row, and bundle banner.
- `agents-md.test.ts` — every folder carries a four-section English AGENTS.md whose Contents list is true.

## 4. Progress

- Done: all specs pass.
- Open: selection positioning depends on real layout and is verified by hand in the real app.
- Goal later: nothing planned.
