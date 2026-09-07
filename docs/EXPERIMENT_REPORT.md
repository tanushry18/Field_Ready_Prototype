# RaceGuard Experiment Report

## Experiment design

The dashboard runs one seeded request stream through an unsafe baseline and RaceGuard. The default run uses seed **42**, 12 sessions, 240 logical events, 24 workers, 22% duplicate attempts, 16% retries, 14% delayed events, 13% out-of-order events, and 7% transaction-failure injection.

## Targets

| Metric | Target |
| --- | --- |
| Duplicate business records in RaceGuard | 0 |
| Inconsistent final sessions in RaceGuard | 0 |
| Recovery after injected rollback | 100% eventual recovery |
| Retry safety | No additional business record |
| Race safety | One winning idempotency claim |
| P95 overhead | Below 50% for the bounded prototype run |

## Where measured results come from

The live report is generated from the `experiments.run` response. The Comparison screen shows the two summaries, the Request Traces screen shows the evidence behind them, and the Reports screen exposes the target-versus-observed table. Use **Export JSON** to archive an exact run for review.

## Error analysis

When the baseline reports duplicate records, the cause is the deliberate check-then-insert race: concurrent requests can pass a non-atomic existence check before a write is visible. When baseline sessions are inconsistent, the cause is a stale event being allowed to write an older sequence number. RaceGuard removes both failure paths with an atomic key claim and a monotonic session-version check.

## Demonstration sequence

1. Normal event: the first request commits a session update.
2. Duplicate request: the duplicate is traced and returns `duplicate_ignored`.
3. Concurrent race: the unique claim determines one winner.
4. Retry storm: replays return the original logical result.
5. Delayed event: arrival delay is visible in traces.
6. Out-of-order event: a stale sequence is ignored.
7. Transaction failure: the write rolls back.
8. Recovery: the safe retry commits without a duplicate business record.
9. Comparison: baseline failures are shown beside RaceGuard results.

## Validation note

The current implementation is intentionally transparent about its scope. It proves the algorithmic behavior with real generated requests and stored trace objects inside the running service. It does not claim that an in-process demo substitutes for a PostgreSQL isolation test, cross-region load test, or production network-partition exercise.
