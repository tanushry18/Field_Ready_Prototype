# API / Integration Stub

The project uses FastAPI-style behavior through the scaffold's typed Express/tRPC gateway. The browser calls the procedures below through `client/src/lib/trpc.ts`, while the engine lives in `server/routers.ts`.

## Health

`health` returns API status, prototype database status, mode, and timestamp.

## Run experiment

`experiments.run` accepts:

```json
{
  "seed": 42,
  "sessions": 12,
  "events": 240,
  "workers": 24,
  "duplicateRate": 22,
  "retryRate": 16,
  "delayRate": 14,
  "outOfOrderRate": 13,
  "transactionFailureRate": 7,
  "requestRate": 120
}
```

It returns an experiment ID, normalized configuration, baseline summary, RaceGuard summary, prevented counts, latency overhead, session versions, and request traces.

## Trace search

`traces` accepts `{ filter?: string, mode?: "all" | "baseline" | "raceguard" }` and returns up to 120 matching traces. Search covers trace ID, event ID, session ID, result, failure type, and transaction status.

## Session state

`sessions` returns the final baseline version, RaceGuard version, expected version, and consistency status for every session in the latest run.

## Production adapter mapping

A production FastAPI adapter can preserve this contract with:

- `POST /api/session/events`
- `GET /api/sessions/{session_id}`
- `GET /api/traces`
- `GET /api/metrics`
- `POST /api/tests/run`
- `POST /api/tests/stop`
- `GET /api/tests/{test_id}`
- `GET /api/health`

The UI intentionally consumes a typed local stub so the demo does not need secrets or an external load service.
