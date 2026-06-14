---
name: motel-debug
description: Use when debugging with local OpenTelemetry traces or logs through motel, or when runtime evidence is needed before changing code.
---

# Motel Debug

## Runtime

- URL: `http://127.0.0.1:27686`
- Start:

```bash
motel start
```

- Fallback:

```bash
vpx @kitlangton/motel start
```

## Endpoints

```text
GET /api/health
GET /api/services
GET /api/traces/search
GET /api/spans/search
GET /api/logs/search
GET /api/ai/calls
GET /openapi.json
```

## Workflow

1. Runtime check
2. Start if missing
3. 3 to 5 concrete hypotheses
4. Minimal temporary instrumentation
5. Reproduce
6. Query traces, spans, logs, or OpenAPI
7. Mark each hypothesis confirmed, rejected, or inconclusive
8. Fix after evidence, not before
9. Verify same path
10. Remove instrumentation

## Instrumentation

- Region: `#region motel debug` / `#endregion motel debug`
- Attributes: `debug.session`, `debug.hypothesis`, `debug.step`, `debug.label`
- Existing tracing/logging path
- No secrets, tokens, passwords, raw private data

## Queries

```bash
curl "http://127.0.0.1:27686/api/services"
curl "http://127.0.0.1:27686/api/traces/search?service=<service>&attr.debug.session=<session>"
curl "http://127.0.0.1:27686/api/spans/search?service=<service>&attr.debug.hypothesis=<id>"
curl "http://127.0.0.1:27686/api/logs/search?service=<service>&attr.debug.session=<session>"
curl "http://127.0.0.1:27686/api/ai/calls?text=<text>"
```

## Constraints

- Evidence-first; code reading alone is insufficient when runtime evidence is available
- Delete speculative changes from rejected hypotheses
- No sleeps/delays as fixes
- Instrumentation removed only after fix verification
