# AGENTS.md

## 1. Role

The wire contract between the host half and the browser half. It names the four commands, fixes the question and quote limits and the job timeout, and encodes the two payloads that travel through the Session log: the `/btw-quote` arguments and the answer envelope that `/btw-answer` returns. Both halves compile this folder, so it is the single place either side reads those shapes from.

## 2. Constraints

- No host or browser APIs: plain TypeScript only.
- Parsing must tolerate text written by other plugins or older versions and return `undefined` instead of throwing.
- Changing the envelope must stay readable for answers already in users' logs.

## 3. Contents

- `protocol.ts` — command names, limits, `Answer` and `QuoteRequest`, their encoders and parsers, and the fallback title.

## 4. Progress

- Done: protocol version 1, covered by `tests/protocol.test.ts`.
- Open: nothing.
- Goal later: an optional list of UI tool results in the envelope.
