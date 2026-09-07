import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function caller() {
  const ctx: TrpcContext = {
    user: null,
    req: { protocol: "http", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
  return appRouter.createCaller(ctx);
}

describe("RaceGuard experiment engine", () => {
  it("runs the same seeded workload through both implementations", async () => {
    const result = await caller().experiments.run({
      seed: 42,
      sessions: 4,
      events: 40,
      workers: 12,
      duplicateRate: 35,
      retryRate: 25,
      delayRate: 20,
      outOfOrderRate: 20,
      transactionFailureRate: 8,
      requestRate: 200,
    });

    expect(result.status).toBe("completed");
    expect(result.config.events).toBe(40);
    expect(result.comparison.baseline.totalRequests).toBe(result.comparison.raceguard.totalRequests);
    expect(result.comparison.baseline.duplicateAttempts).toBe(result.comparison.raceguard.duplicateAttempts);
    expect(result.comparison.raceguard.duplicateRecords).toBe(0);
    expect(result.comparison.prevented.duplicateRecords).toBeGreaterThanOrEqual(0);
    expect(result.traces.length).toBeGreaterThan(0);
    expect(result.sessions.length).toBe(4);
  });

  it("keeps duplicate attempts observable without creating duplicate RaceGuard records", async () => {
    const result = await caller().experiments.run({
      seed: 7,
      sessions: 2,
      events: 20,
      workers: 10,
      duplicateRate: 80,
      retryRate: 80,
      delayRate: 0,
      outOfOrderRate: 0,
      transactionFailureRate: 0,
      requestRate: 100,
    });

    const duplicateTraces = result.traces.filter(trace => trace.mode === "raceguard" && trace.duplicateDetected);
    expect(result.comparison.raceguard.duplicateRecords).toBe(0);
    expect(duplicateTraces.length).toBeGreaterThan(0);
    expect(result.comparison.raceguard.duplicateAttempts).toBeGreaterThan(0);
  });

  it("supports filtering traces by failure signal", async () => {
    await caller().experiments.run({
      seed: 42,
      sessions: 3,
      events: 30,
      workers: 8,
      duplicateRate: 30,
      retryRate: 20,
      delayRate: 25,
      outOfOrderRate: 25,
      transactionFailureRate: 20,
      requestRate: 100,
    });

    const traces = await caller().traces({ filter: "rolled_back", mode: "raceguard" });
    expect(traces.every(trace => trace.mode === "raceguard" && trace.result === "rolled_back")).toBe(true);
  });
});
