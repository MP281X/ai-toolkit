---
name: motel-debug
description: Use when debugging with local OpenTelemetry traces or logs through motel, or when runtime evidence is needed before changing code.
---

# Motel Debug

Debug with runtime evidence.

## Server

Default motel URL:

```text
http://127.0.0.1:27686
```

Useful endpoints:

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

1. Check `GET /api/health`
2. Start motel if it is not running
3. Generate 3 to 5 concrete hypotheses
4. Add the minimum temporary instrumentation needed to prove or reject the hypotheses
5. Reproduce the issue
6. Query traces or logs
7. Mark each hypothesis confirmed, rejected, or inconclusive
8. Fix only after evidence identifies the cause
9. Verify with the same reproduction path
10. Remove temporary instrumentation after the fix is verified

## Start

Use the installed binary when available:

```bash
motel start
```

Use `vpx` when the binary is not installed:

```bash
vpx @kitlangton/motel start
```

## Instrumentation

- Wrap temporary instrumentation in `#region motel debug` and `#endregion motel debug`
- Add `debug.session`
- Add `debug.hypothesis`
- Add `debug.step`
- Add `debug.label`
- Use existing tracing or logging infrastructure
- Do not log secrets, tokens, passwords, or raw private data

## Queries

```bash
curl "http://127.0.0.1:27686/api/services"
curl "http://127.0.0.1:27686/api/traces/search?service=<service>&attr.debug.session=<session>"
curl "http://127.0.0.1:27686/api/spans/search?service=<service>&attr.debug.hypothesis=<id>"
curl "http://127.0.0.1:27686/api/logs/search?service=<service>&attr.debug.session=<session>"
curl "http://127.0.0.1:27686/api/ai/calls?text=<text>"
```

## Constraints

- Do not fix from code reading alone when runtime evidence is available
- Do not keep speculative fixes from rejected hypotheses
- Do not use sleeps or delays as fixes
- Do not remove instrumentation before verifying the fix
