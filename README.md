# RaceGuard — Idempotency & Concurrency Test Harness

RaceGuard is a field-ready prototype for testing multiplayer session-state backends under retries, duplicate requests, concurrent races, delayed events, out-of-order events, and transaction failures. It replays one deterministic workload through two processing paths:

- **Unsafe baseline:** deliberately allows the check-then-insert race and stale state regression.
- **RaceGuard:** models an atomic idempotency-key claim, transaction boundaries, version checks, trace capture, rollback, and replay-safe responses.

The dashboard reports measured results from the experiment engine. It does not use hardcoded KPI fixtures.

## Run locally

The managed development command is:

```bash
pnpm install
pnpm dev
```

Then open the preview URL from the dev server. The app works without authentication and uses the seeded in-process experiment store for a zero-setup demonstration. Run the project with Docker using:

```bash
docker compose up --build
```

The managed WebDev scaffold exposes the application as a single Node process. The prototype therefore uses React + Vite on the client and Express + tRPC on the server rather than a separate Python service. The processing API is intentionally kept behind typed tRPC procedures so the UI and engine share a contract.

## Demonstration path

1. Open **Overview** and inspect the latest measured comparison.
2. Open **Test Runner**, adjust workers or failure probabilities, and press **Run baseline + RaceGuard**.
3. Open **Live Experiment** to inspect phases, throughput, rollback counts, and recovery.
4. Open **Comparison** to see the metric ledger and latency profile.
5. Open **Request Traces** and search for `duplicate`, `stale`, or `rolled_back`.
6. Open **Failure Analysis** to map each injected condition to its RaceGuard control.
7. Open **Reports** to export the complete experiment JSON and review limitations.

## Core behavior

For each logical event, the experiment engine derives an idempotency key:

```text
session_id : player_id : event_id
```

The RaceGuard path processes the key exactly once. Duplicate attempts still create request traces but do not create another business record. A stale event is ignored when its sequence is not newer than the current session version. An injected transaction failure records a rollback and can be safely replayed. The baseline path includes a deterministic race window so the same workload creates observable duplicate records and inconsistent final sessions.

## API surface

The prototype uses public tRPC procedures at `/api/trpc`:

| Procedure | Purpose |
| --- | --- |
| `health` | Reports API and prototype database status. |
| `experiments.latest` | Returns the latest experiment, comparison, sessions, and traces. |
| `experiments.run` | Runs a seeded workload and returns the measured comparison. |
| `traces` | Searches traces by free text and processing mode. |
| `sessions` | Returns final baseline and RaceGuard session versions. |
| `metrics` / `comparison` | Returns the latest side-by-side summaries. |

The generated API contract is available through the framework's API tooling in development.

## Configuration limits

The runner accepts a seed, session count, logical event count, worker count, request rate, duplicate rate, retry rate, delay rate, out-of-order rate, and transaction-failure rate. To keep the prototype safe on modest hardware, the UI caps experiments at 5,000 logical events and 120 workers.

## Requirements specification

### Functional requirements

- Generate a reproducible synthetic workload.
- Replay the same workload through baseline and RaceGuard implementations.
- Inject duplicate, retry, concurrent, delayed, out-of-order, and transaction-failure conditions.
- Capture trace IDs, request IDs, attempt numbers, idempotency keys, transaction status, result, error type, and latency.
- Measure duplicate records, inconsistent sessions, recovery rate, retry safety, race safety, average latency, median latency, P95, P99, and throughput.
- Present overview, runner, live, comparison, traces, failure analysis, reports, and settings screens.
- Export the latest experiment as JSON.

### Non-functional requirements

- Deterministic results from a user-visible seed.
- Responsive dashboard layout with accessible status labels.
- No secrets hardcoded in the source.
- Bounded workload size suitable for 2 CPU cores and 2–4 GB RAM.
- Clear production limitations rather than implied guarantees.

## Validation dataset

The default seed is **42**. It produces 12 sessions, 240 logical events, 24 workers, duplicates at 22%, retries at 16%, delays at 14%, out-of-order events at 13%, and simulated transaction failures at 7%. Re-running the same configuration produces the same logical workload shape and comparable measured output.

## Deployment notes

The included Docker artifacts run the project as a Node service. For a production backend, replace the in-process experiment store with PostgreSQL or SQLite-backed tables for `sessions`, `events`, `idempotency_records`, `request_traces`, and `experiments`. The algorithm documentation in `docs/ALGORITHM.md` defines the transaction boundary and uniqueness constraint that must be preserved during that migration.

## Limitations

The current prototype deliberately keeps its persistence layer in process so it can run with no external service. This makes the demo portable but does not claim to be a distributed database benchmark. SQLite write concurrency, PostgreSQL isolation levels, network partitions, clock skew, cross-region replication, authentication, and 25,000-event stress testing require a production database and a separate load runner. The failure injector simulates these conditions at the processing layer; it does not create real network partitions.

See [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md), [`docs/ALGORITHM.md`](docs/ALGORITHM.md), [`docs/API.md`](docs/API.md), and [`docs/LIMITATIONS.md`](docs/LIMITATIONS.md) for the full project handoff.
