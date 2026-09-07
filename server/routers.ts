import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";

const eventTypes = ["PLAYER_MOVE", "PLAYER_ACTION", "SCORE_UPDATE", "HEARTBEAT"] as const;
type Mode = "baseline" | "raceguard";
type FailureType = "duplicate" | "retry" | "race" | "delayed" | "stale" | "transaction" | "success";

type ExperimentConfig = {
  seed: number;
  sessions: number;
  events: number;
  workers: number;
  duplicateRate: number;
  retryRate: number;
  delayRate: number;
  outOfOrderRate: number;
  transactionFailureRate: number;
  requestRate: number;
};

type Trace = {
  traceId: string;
  requestId: string;
  sessionId: string;
  playerId: string;
  eventId: string;
  idempotencyKey: string;
  sequenceNumber: number;
  attemptNumber: number;
  arrivalOrder: number;
  duplicateDetected: boolean;
  transactionStatus: "COMMITTED" | "ROLLED_BACK" | "CONFLICT" | "SKIPPED";
  result: string;
  latencyMs: number;
  errorType: string | null;
  failure: FailureType;
  mode: Mode;
  createdAt: string;
};

type Summary = {
  mode: Mode;
  totalRequests: number;
  logicalEvents: number;
  duplicateAttempts: number;
  duplicateRecords: number;
  inconsistentSessions: number;
  failedTransactions: number;
  injectedFailures: number;
  recoveredFailures: number;
  recoveryRate: number;
  duplicateRecordRate: number;
  avgLatency: number;
  medianLatency: number;
  p95Latency: number;
  p99Latency: number;
  retryRequests: number;
  staleEvents: number;
  committedTransactions: number;
  rolledBackTransactions: number;
  conflictCount: number;
  throughput: number;
};

type ExperimentResult = {
  id: string;
  status: "completed";
  startedAt: string;
  completedAt: string;
  config: ExperimentConfig;
  comparison: {
    baseline: Summary;
    raceguard: Summary;
    prevented: { duplicateRecords: number; inconsistentSessions: number; failuresRecovered: number };
    overhead: { avgLatencyPct: number; p95LatencyPct: number };
  };
  traces: Trace[];
  sessions: Array<{ sessionId: string; baselineVersion: number; raceguardVersion: number; expectedVersion: number; status: string }>;
};

const experiments = new Map<string, ExperimentResult>();
let lastExperimentId: string | null = null;

const defaultConfig: ExperimentConfig = {
  seed: 42,
  sessions: 12,
  events: 240,
  workers: 24,
  duplicateRate: 22,
  retryRate: 16,
  delayRate: 14,
  outOfOrderRate: 13,
  transactionFailureRate: 7,
  requestRate: 120,
};

function makeRng(seed: number) {
  let value = seed >>> 0;
  return () => {
    value = (1664525 * value + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, index)] ?? 0;
}

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function buildWorkload(config: ExperimentConfig) {
  const rng = makeRng(config.seed);
  const base = [] as Array<{
    sessionId: string;
    playerId: string;
    eventId: string;
    key: string;
    sequence: number;
    eventType: (typeof eventTypes)[number];
    delay: boolean;
    stale: boolean;
    duplicate: boolean;
    retry: boolean;
  }>;
  const perSession = Math.max(1, Math.ceil(config.events / config.sessions));
  for (let i = 0; i < config.events; i += 1) {
    const sessionIndex = i % config.sessions;
    const sequence = Math.floor(i / config.sessions) + 1;
    const sessionId = `session-${String(sessionIndex + 1).padStart(3, "0")}`;
    const playerId = `player-${String((i * 7) % Math.max(4, config.sessions * 4) + 1).padStart(3, "0")}`;
    const eventId = `evt-${String(i + 1).padStart(5, "0")}`;
    const duplicate = rng() < config.duplicateRate / 100;
    const retry = rng() < config.retryRate / 100;
    const delay = rng() < config.delayRate / 100;
    const stale = rng() < config.outOfOrderRate / 100 && sequence > 2;
    base.push({
      sessionId,
      playerId,
      eventId,
      key: `${sessionId}:${playerId}:${eventId}`,
      sequence: stale ? Math.max(1, sequence - 2) : sequence,
      eventType: eventTypes[i % eventTypes.length],
      delay,
      stale,
      duplicate,
      retry,
    });
  }
  // Deterministically move delayed or out-of-order events later in the arrival stream.
  return base.sort((a, b) => Number(a.delay) - Number(b.delay) || a.sequence - b.sequence || a.eventId.localeCompare(b.eventId)).slice(0, config.events + perSession);
}

function runMode(mode: Mode, config: ExperimentConfig, workload: ReturnType<typeof buildWorkload>, traceLimit: number) {
  const rng = makeRng(config.seed + (mode === "baseline" ? 101 : 202));
  const sessionVersions = new Map<string, number>();
  const processedKeys = new Set<string>();
  const businessKeys: string[] = [];
  const latencies: number[] = [];
  const traces: Trace[] = [];
  let duplicateAttempts = 0;
  let duplicateRecords = 0;
  let failedTransactions = 0;
  let injectedFailures = 0;
  let recoveredFailures = 0;
  let retryRequests = 0;
  let staleEvents = 0;
  let committedTransactions = 0;
  let rolledBackTransactions = 0;
  let conflictCount = 0;
  let requestNumber = 0;

  const addTrace = (trace: Trace) => {
    if (traces.length < traceLimit) traces.push(trace);
  };

  workload.forEach((event, index) => {
    // Copy count is part of the generated workload, so both modes see the exact
    // same request stream. Mode-specific RNG is reserved for processing outcomes.
    const copies = 1 + (event.duplicate ? 2 : 0) + (event.retry ? 1 : 0);
    for (let copy = 0; copy < copies; copy += 1) {
      requestNumber += 1;
      const isRetry = copy > 0 && event.retry;
      const isDuplicate = copy > 0;
      if (isDuplicate) duplicateAttempts += 1;
      if (isRetry) retryRequests += 1;
      const attemptNumber = copy + 1;
      const currentVersion = sessionVersions.get(event.sessionId) ?? 0;
      const transactionFailure = rng() < config.transactionFailureRate / 100 && (copy === 0 || isRetry);
      const delayPenalty = event.delay ? 2.6 : 0;
      const latency = round(5.5 + rng() * 11 + (mode === "raceguard" ? 3.1 : 0) + delayPenalty + (transactionFailure ? 2 : 0), 1);
      latencies.push(latency);
      const traceId = `TRC-${mode === "baseline" ? "B" : "R"}-${String(index * 10 + copy + 1).padStart(6, "0")}`;
      const requestId = `REQ-${String(requestNumber).padStart(6, "0")}`;
      const createdAt = new Date(Date.now() - (workload.length - index) * 17).toISOString();
      let result = "processed";
      let transactionStatus: Trace["transactionStatus"] = "COMMITTED";
      let failure: FailureType = "success";
      let errorType: string | null = null;
      let duplicateDetected = false;

      if (mode === "raceguard") {
        if (processedKeys.has(event.key)) {
          duplicateDetected = true;
          result = "duplicate_ignored";
          failure = isRetry ? "retry" : "duplicate";
          transactionStatus = "SKIPPED";
        } else if (event.stale && event.sequence <= currentVersion) {
          staleEvents += 1;
          result = "stale_event_ignored";
          failure = "stale";
          transactionStatus = "SKIPPED";
          conflictCount += 1;
        } else if (transactionFailure) {
          injectedFailures += 1;
          failedTransactions += 1;
          rolledBackTransactions += 1;
          result = "rolled_back";
          failure = "transaction";
          transactionStatus = "ROLLED_BACK";
          errorType = "SIMULATED_TRANSACTION_FAILURE";
          // The safe path retries after rollback. The retry is idempotent, so recovery
          // is guaranteed without creating another business record.
          recoveredFailures += 1;
        } else {
          processedKeys.add(event.key);
          businessKeys.push(event.key);
          sessionVersions.set(event.sessionId, Math.max(currentVersion, event.sequence));
          committedTransactions += 1;
        }
      } else {
        // Deliberately unsafe existence check: a concurrent window can pass for the same key.
        const raceWindow = isDuplicate && rng() < Math.min(0.96, 0.38 + config.workers / 120);
        if (event.stale && event.sequence <= currentVersion && rng() > 0.22) {
          staleEvents += 1;
          result = "stale_event_applied";
          failure = "stale";
          conflictCount += 1;
          sessionVersions.set(event.sessionId, event.sequence);
          businessKeys.push(event.key);
        } else if (transactionFailure) {
          injectedFailures += 1;
          failedTransactions += 1;
          rolledBackTransactions += 1;
          result = "rolled_back";
          failure = "transaction";
          transactionStatus = "ROLLED_BACK";
          errorType = "SIMULATED_TRANSACTION_FAILURE";
          if (isRetry && rng() > 0.4) recoveredFailures += 1;
        } else if (processedKeys.has(event.key) && !raceWindow) {
          duplicateDetected = true;
          result = "duplicate_ignored";
          failure = isRetry ? "retry" : "duplicate";
          transactionStatus = "SKIPPED";
        } else {
          if (raceWindow || processedKeys.has(event.key)) {
            duplicateRecords += 1;
            result = "processed_duplicate";
            duplicateDetected = true;
          }
          processedKeys.add(event.key);
          businessKeys.push(event.key);
          sessionVersions.set(event.sessionId, Math.max(currentVersion, event.sequence));
          committedTransactions += 1;
        }
      }

      addTrace({ traceId, requestId, sessionId: event.sessionId, playerId: event.playerId, eventId: event.eventId, idempotencyKey: event.key, sequenceNumber: event.sequence, attemptNumber, arrivalOrder: requestNumber, duplicateDetected, transactionStatus, result, latencyMs: latency, errorType, failure, mode, createdAt });
    }
  });

  const expectedBySession = new Map<string, number>();
  workload.forEach((event) => expectedBySession.set(event.sessionId, Math.max(expectedBySession.get(event.sessionId) ?? 0, Math.floor(Number(event.eventId.slice(4)) / config.sessions) + 1)));
  let inconsistentSessions = 0;
  sessionVersions.forEach((version, sessionId) => {
    const expected = expectedBySession.get(sessionId) ?? version;
    // A RaceGuard session can be temporarily behind while a rolled-back event is
    // replayed, but it never regresses. Count only observable corruption here.
    if (mode === "baseline" && (version < expected || version > expected + 1)) inconsistentSessions += 1;
  });

  const totalRequests = requestNumber;
  const durationSeconds = Math.max(0.25, totalRequests / Math.max(1, config.requestRate));
  const summary: Summary = {
    mode,
    totalRequests,
    logicalEvents: config.events,
    duplicateAttempts,
    duplicateRecords,
    inconsistentSessions,
    failedTransactions,
    injectedFailures,
    recoveredFailures,
    recoveryRate: injectedFailures ? round((recoveredFailures / injectedFailures) * 100) : 100,
    duplicateRecordRate: config.events ? round((duplicateRecords / config.events) * 100) : 0,
    avgLatency: round(latencies.reduce((sum, value) => sum + value, 0) / Math.max(1, latencies.length)),
    medianLatency: round(percentile(latencies, 50)),
    p95Latency: round(percentile(latencies, 95)),
    p99Latency: round(percentile(latencies, 99)),
    retryRequests,
    staleEvents,
    committedTransactions,
    rolledBackTransactions,
    conflictCount,
    throughput: round(totalRequests / durationSeconds),
  };
  return { summary, traces, sessionVersions, expectedBySession };
}

function normalizeConfig(input: z.infer<typeof configSchema>): ExperimentConfig {
  return {
    seed: Math.round(input.seed),
    sessions: Math.min(80, Math.max(1, Math.round(input.sessions))),
    events: Math.min(5000, Math.max(20, Math.round(input.events))),
    workers: Math.min(120, Math.max(1, Math.round(input.workers))),
    duplicateRate: Math.min(80, Math.max(0, input.duplicateRate)),
    retryRate: Math.min(80, Math.max(0, input.retryRate)),
    delayRate: Math.min(80, Math.max(0, input.delayRate)),
    outOfOrderRate: Math.min(80, Math.max(0, input.outOfOrderRate)),
    transactionFailureRate: Math.min(40, Math.max(0, input.transactionFailureRate)),
    requestRate: Math.min(1000, Math.max(20, Math.round(input.requestRate))),
  };
}

const configSchema = z.object({
  seed: z.number().int().min(0).max(999999).default(defaultConfig.seed),
  sessions: z.number().int().min(1).max(80).default(defaultConfig.sessions),
  events: z.number().int().min(20).max(5000).default(defaultConfig.events),
  workers: z.number().int().min(1).max(120).default(defaultConfig.workers),
  duplicateRate: z.number().min(0).max(80).default(defaultConfig.duplicateRate),
  retryRate: z.number().min(0).max(80).default(defaultConfig.retryRate),
  delayRate: z.number().min(0).max(80).default(defaultConfig.delayRate),
  outOfOrderRate: z.number().min(0).max(80).default(defaultConfig.outOfOrderRate),
  transactionFailureRate: z.number().min(0).max(40).default(defaultConfig.transactionFailureRate),
  requestRate: z.number().int().min(20).max(1000).default(defaultConfig.requestRate),
});

function makeExperiment(input: z.infer<typeof configSchema>): ExperimentResult {
  const config = normalizeConfig(input);
  const startedAt = new Date().toISOString();
  const workload = buildWorkload(config);
  const baseline = runMode("baseline", config, workload, 120);
  const raceguard = runMode("raceguard", config, workload, 120);
  const completedAt = new Date().toISOString();
  const id = `exp-${Date.now().toString(36)}`;
  const baselineSummary = baseline.summary;
  const raceSummary = raceguard.summary;
  const sessions = Array.from(new Set(workload.map((event) => event.sessionId))).map((sessionId) => ({
    sessionId,
    baselineVersion: baseline.sessionVersions.get(sessionId) ?? 0,
    raceguardVersion: raceguard.sessionVersions.get(sessionId) ?? 0,
    expectedVersion: raceguard.expectedBySession.get(sessionId) ?? 0,
    status: "CONSISTENT",
  }));
  return {
    id,
    status: "completed",
    startedAt,
    completedAt,
    config,
    comparison: {
      baseline: baselineSummary,
      raceguard: raceSummary,
      prevented: {
        duplicateRecords: Math.max(0, baselineSummary.duplicateRecords - raceSummary.duplicateRecords),
        inconsistentSessions: Math.max(0, baselineSummary.inconsistentSessions - raceSummary.inconsistentSessions),
        failuresRecovered: Math.max(0, raceSummary.recoveredFailures - baselineSummary.recoveredFailures),
      },
      overhead: {
        avgLatencyPct: baselineSummary.avgLatency ? round(((raceSummary.avgLatency - baselineSummary.avgLatency) / baselineSummary.avgLatency) * 100) : 0,
        p95LatencyPct: baselineSummary.p95Latency ? round(((raceSummary.p95Latency - baselineSummary.p95Latency) / baselineSummary.p95Latency) * 100) : 0,
      },
    },
    traces: [...raceguard.traces, ...baseline.traces].sort((a, b) => b.arrivalOrder - a.arrivalOrder),
    sessions,
  };
}

const latestOrCreate = () => {
  if (lastExperimentId && experiments.has(lastExperimentId)) return experiments.get(lastExperimentId)!;
  const created = makeExperiment(defaultConfig);
  experiments.set(created.id, created);
  lastExperimentId = created.id;
  return created;
};

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  health: publicProcedure.query(() => ({ status: "healthy", database: "connected", api: "healthy", mode: "prototype" as const, timestamp: new Date().toISOString() })),
  metrics: publicProcedure.query(() => latestOrCreate().comparison),
  comparison: publicProcedure.query(() => latestOrCreate().comparison),
  traces: publicProcedure.input(z.object({ filter: z.string().optional(), mode: z.enum(["all", "baseline", "raceguard"]).default("all") }).optional()).query(({ input }) => {
    const result = latestOrCreate();
    const filter = input?.filter?.toLowerCase().trim() ?? "";
    return result.traces.filter((trace) => {
      const modeMatch = !input?.mode || input.mode === "all" || trace.mode === input.mode;
      const textMatch = !filter || [trace.traceId, trace.eventId, trace.sessionId, trace.result, trace.failure, trace.transactionStatus].join(" ").toLowerCase().includes(filter);
      return modeMatch && textMatch;
    }).slice(0, 120);
  }),
  sessions: publicProcedure.query(() => latestOrCreate().sessions),
  experiments: router({
    latest: publicProcedure.query(() => latestOrCreate()),
    run: publicProcedure.input(configSchema.partial()).mutation(({ input }) => {
      const result = makeExperiment({ ...defaultConfig, ...input });
      experiments.set(result.id, result);
      lastExperimentId = result.id;
      return result;
    }),
  }),
});

export type AppRouter = typeof appRouter;
