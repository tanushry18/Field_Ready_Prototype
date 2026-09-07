# RaceGuard Requirements Specification

## Problem

Multiplayer clients retry when acknowledgements are delayed. At the same time, concurrent writes, duplicated messages, delayed events, and out-of-order arrivals can create duplicate business records or corrupt the latest session state. RaceGuard exists to make those failure modes reproducible and measurable.

## Users

The primary user is a backend developer or QA engineer validating retry safety, race safety, ordering, rollback, and trace coverage. The secondary user is a technical lead who needs a compact comparison of correctness and performance cost.

## Functional requirements

| Area | Requirement | Prototype status |
| --- | --- | --- |
| Workload | Generate seeded sessions, players, events, retries, duplicates, delays, and stale events. | Implemented in `server/routers.ts` |
| Processing | Compare an unsafe baseline and RaceGuard path against the same workload. | Implemented |
| Idempotency | Process a logical request once and trace all duplicate attempts. | Implemented |
| Ordering | Ignore stale sequence numbers instead of regressing state. | Implemented |
| Transactions | Model commit, rollback, conflict, and safe recovery outcomes. | Implemented |
| Observability | Capture trace and transaction fields for each request. | Implemented |
| Metrics | Calculate duplicate rate, prevention, inconsistency, recovery, latency percentiles, and throughput. | Implemented |
| Dashboard | Provide Overview, Test Runner, Live Experiment, Comparison, Request Traces, Failure Analysis, Reports, and Settings. | Implemented |
| Export | Download the latest experiment as JSON. | Implemented |

## Non-functional requirements

The prototype is responsive, bounded for modest hardware, deterministic by seed, and uses framework-managed environment variables rather than hardcoded secrets. It is intentionally deployable as one Node service with no mandatory queue, cache, or cluster.

## Assumptions

The experiment engine is the reference model for the database implementation. A future persistent adapter must preserve the unique constraint on `idempotency_key`, the session version check, and the transaction boundary. The baseline is intentionally unsafe and should never be copied into a production service.

## Acceptance evidence

The Comparison screen provides measured baseline and RaceGuard values from the same experiment object. The Request Traces screen exposes duplicate attempts and rollback records. The Failure Analysis screen maps injected conditions to the RaceGuard control that handles them. The Reports screen states targets, observed values, reproducibility fields, and known limitations.
