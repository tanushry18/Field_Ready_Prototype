# Limitations Report

RaceGuard is a working correctness prototype, not a distributed-systems benchmark.

1. **In-process storage.** The current experiment store is in memory to keep the demo zero-setup. A restart clears experiments. The production version should use PostgreSQL or SQLite with explicit unique constraints and transaction isolation.
2. **Synthetic workload.** Generated events approximate multiplayer traffic but do not model real client SDK behavior, packet loss, payload diversity, or user timing distributions.
3. **Network failures are simulated.** Delays and transaction failures are injected in the engine. There is no actual network partition, proxy timeout, or database process kill.
4. **Single-node execution.** Worker count represents concurrent requests within one Node process. Cross-process and cross-region races require an external database and load runner.
5. **Clock synchronization.** Trace timestamps are local process timestamps; clock skew across hosts is not evaluated.
6. **Scale boundary.** The UI caps experiments at 5,000 logical events to remain comfortable on modest hardware. Extremely high-scale multiplayer traffic is outside scope.
7. **Auth and abuse controls.** The public demo route is designed for a local/internal QA workflow. Production deployment should add authentication, payload limits, rate limiting, and tenant isolation.

These limitations are visible on the Reports screen so stakeholders do not confuse the prototype's measured result with a universal production guarantee.
