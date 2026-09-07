# Core Algorithm

## RaceGuard processing contract

Each logical operation is assigned:

```text
idempotency_key = session_id + ":" + player_id + ":" + event_id
```

The key is unique across the event store. A request can be retried any number of times; the first successful claim owns the business write and subsequent attempts return the recorded result.

## Transaction boundary

```text
BEGIN
  validate payload and maximum size
  derive idempotency key
  INSERT idempotency record with UNIQUE(idempotency_key)
  if key already exists:
      record duplicate trace
      return duplicate_ignored
  read current session version
  if incoming sequence <= current version:
      record stale trace
      commit trace only
      return stale_event_ignored
  update session state and version
  insert event business record
  insert committed request trace
COMMIT
```

Any failure after validation and before commit rolls back the session update, business event, and idempotency claim. The client can safely retry because no committed idempotency record exists for the failed attempt.

## Why the baseline fails

The baseline simulates this unsafe pattern:

```text
if not exists(idempotency_key):
    insert(event)
```

Under concurrency, two requests can pass the check before either insert completes. A duplicate business record is then created. The baseline also permits stale events to write older versions, producing inconsistent final session state.

## Database adapter contract

A persistent adapter should create these tables and indexes:

- `sessions(session_id UNIQUE, version, state, updated_at)`
- `events(event_id UNIQUE, session_id, player_id, sequence_number, payload, created_at)`
- `idempotency_records(idempotency_key UNIQUE, event_id, status, response, created_at)`
- `request_traces(trace_id UNIQUE, request_id, event_id, session_id, attempt_number, duplicate_detected, transaction_status, latency_ms, error_type, created_at)`

The critical correctness mechanism is the unique idempotency constraint enforced by the database, not an application-level existence check.

## Ordering rule

For a session with current version `v`, an event is valid only when `incoming.sequence_number > v`. A stale event is retained in trace history but cannot mutate the session state.
