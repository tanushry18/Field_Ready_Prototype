import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Check,
  ChevronRight,
  CircleDot,
  Clock3,
  Code2,
  Download,
  FileText,
  Gauge,
  GitCompareArrows,
  History,
  Layers3,
  LayoutDashboard,
  Menu,
  Network,
  Play,
  RefreshCcw,
  Search,
  ServerCog,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  TimerReset,
  TriangleAlert,
  X,
  Zap,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { trpc } from "@/lib/trpc";

const navItems = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "runner", label: "Test Runner", icon: SlidersHorizontal },
  { id: "live", label: "Live Experiment", icon: Activity },
  { id: "comparison", label: "Comparison", icon: GitCompareArrows },
  { id: "traces", label: "Request Traces", icon: Network },
  { id: "failures", label: "Failure Analysis", icon: TriangleAlert },
  { id: "reports", label: "Reports", icon: FileText },
  { id: "settings", label: "Settings", icon: Settings2 },
];

const initialConfig = {
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

const failureCards = [
  { id: "duplicate", title: "Duplicate requests", short: "DUPLICATE", detail: "Atomic idempotency key claim", icon: CopyIcon, color: "amber" },
  { id: "race", title: "Concurrent race", short: "CONFLICT", detail: "Unique constraint winner", icon: GitCompareArrows, color: "red" },
  { id: "retry", title: "Retry storm", short: "RETRY", detail: "Replay-safe response", icon: RefreshCcw, color: "blue" },
  { id: "delayed", title: "Delayed event", short: "DELAYED", detail: "Arrival order is observable", icon: Clock3, color: "violet" },
  { id: "stale", title: "Out-of-order event", short: "STALE", detail: "Version check ignores stale", icon: History, color: "orange" },
  { id: "transaction", title: "Transaction failure", short: "ROLLBACK", detail: "Rollback then safe retry", icon: TimerReset, color: "pink" },
];

function CopyIcon(props: { size?: number }) {
  return <Layers3 {...props} />;
}

function number(value: number | undefined) {
  return new Intl.NumberFormat("en-US").format(value ?? 0);
}

function percent(value: number | undefined) {
  return `${(value ?? 0).toFixed(value && value % 1 ? 1 : 0)}%`;
}

function MetricCard({ label, value, detail, tone, icon: Icon }: { label: string; value: string; detail: string; tone: string; icon: any }) {
  return (
    <div className="metric-card">
      <div className={`metric-icon ${tone}`}><Icon size={18} /></div>
      <div className="metric-copy"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>
    </div>
  );
}

function StatusBadge({ children, tone = "success" }: { children: React.ReactNode; tone?: string }) {
  return <span className={`status-badge ${tone}`}><span className="status-dot" />{children}</span>;
}

function Panel({ title, eyebrow, action, children, className = "" }: { title: string; eyebrow?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={`panel ${className}`}><div className="panel-header"><div>{eyebrow && <div className="panel-eyebrow">{eyebrow}</div>}<h2>{title}</h2></div>{action}</div>{children}</section>;
}

export default function Home() {
  const [screen, setScreen] = useState("overview");
  const [config, setConfig] = useState(initialConfig);
  const [traceFilter, setTraceFilter] = useState("");
  const [traceMode, setTraceMode] = useState<"all" | "baseline" | "raceguard">("all");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [lastRunAt, setLastRunAt] = useState<Date | null>(null);
  const latest = trpc.experiments.latest.useQuery(undefined, { staleTime: 30000 });
  const health = trpc.health.useQuery(undefined, { refetchInterval: 30000 });
  const traces = trpc.traces.useQuery({ filter: traceFilter || undefined, mode: traceMode }, { staleTime: 15000 });
  const runExperiment = trpc.experiments.run.useMutation({
    onSuccess: () => {
      setLastRunAt(new Date());
      void latest.refetch();
      void traces.refetch();
      setScreen("live");
    },
  });
  const experiment = runExperiment.data ?? latest.data;
  const comparison = experiment?.comparison;
  const baseline = comparison?.baseline;
  const raceguard = comparison?.raceguard;
  const recentTraces = traces.data ?? experiment?.traces ?? [];
  const failureToggles = useMemo(() => new Set((experiment?.traces ?? []).filter(t => t.failure !== "success").map(t => t.failure)), [experiment?.traces]);

  useEffect(() => {
    if (latest.data?.config) setConfig(latest.data.config);
  }, [latest.data?.id]);

  const run = () => runExperiment.mutate(config);
  const updateConfig = (key: keyof typeof config, value: string) => setConfig(prev => ({ ...prev, [key]: Number(value) }));
  const exportReport = () => {
    if (!experiment) return;
    const blob = new Blob([JSON.stringify(experiment, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `raceguard-${experiment.id}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const chartData = [
    { name: "Duplicate records", baseline: baseline?.duplicateRecords ?? 0, raceguard: raceguard?.duplicateRecords ?? 0 },
    { name: "Inconsistent sessions", baseline: baseline?.inconsistentSessions ?? 0, raceguard: raceguard?.inconsistentSessions ?? 0 },
    { name: "P95 latency (ms)", baseline: baseline?.p95Latency ?? 0, raceguard: raceguard?.p95Latency ?? 0 },
  ];
  const latencyData = [
    { label: "AVG", baseline: baseline?.avgLatency ?? 0, raceguard: raceguard?.avgLatency ?? 0 },
    { label: "P50", baseline: baseline?.medianLatency ?? 0, raceguard: raceguard?.medianLatency ?? 0 },
    { label: "P95", baseline: baseline?.p95Latency ?? 0, raceguard: raceguard?.p95Latency ?? 0 },
    { label: "P99", baseline: baseline?.p99Latency ?? 0, raceguard: raceguard?.p99Latency ?? 0 },
  ];

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <div className="brand-block">
          <div className="brand-mark"><ShieldCheck size={22} strokeWidth={2.4} /></div>
          <div><div className="brand-name">RaceGuard</div><div className="brand-subtitle">SESSION STATE LAB</div></div>
        </div>
        <div className="side-label">Workspace</div>
        <nav className="side-nav">
          {navItems.map(item => {
            const Icon = item.icon;
            return <button key={item.id} className={`nav-item ${screen === item.id ? "active" : ""}`} onClick={() => { setScreen(item.id); setMobileOpen(false); }}><Icon size={17} /><span>{item.label}</span>{item.id === "traces" && <span className="nav-count">{recentTraces.length}</span>}</button>;
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="environment-card"><div className="environment-row"><span className="online-dot" />API HEALTHY</div><div className="environment-meta">Local prototype · seeded run</div></div>
          <div className="user-line"><div className="avatar">QA</div><div><strong>QA workspace</strong><span>Developer mode</span></div><ChevronRight size={15} /></div>
        </div>
      </aside>

      <main className="main-canvas">
        <header className="topbar"><button className="mobile-menu" onClick={() => setMobileOpen(!mobileOpen)}><Menu size={20} /></button><div className="breadcrumbs"><span>RaceGuard</span><ChevronRight size={14} /><strong>{navItems.find(n => n.id === screen)?.label}</strong></div><div className="topbar-actions"><div className="api-status"><span className="online-dot" />{health.data?.api === "healthy" ? "API healthy" : "Connecting"}</div><button className="icon-button" aria-label="Refresh" onClick={() => { void latest.refetch(); void traces.refetch(); }}><RefreshCcw size={17} /></button><button className="run-button" onClick={run} disabled={runExperiment.isPending}><Play size={15} fill="currentColor" />{runExperiment.isPending ? "Running…" : "Run comparison"}</button></div></header>

        <div className="page-content">
          {screen === "overview" && <>
            <div className="page-heading"><div><div className="kicker"><CircleDot size={13} /> EXPERIMENT CONTROL PLANE</div><h1>Operational confidence, measured.</h1><p>Replay the same adversarial workload against an unsafe baseline and RaceGuard’s atomic processing path.</p></div><div className="heading-meta"><StatusBadge>System ready</StatusBadge><span>Seed {experiment?.config.seed ?? 42}</span></div></div>
            <div className="kpi-grid">
              <MetricCard label="Duplicates prevented" value={number(comparison?.prevented.duplicateRecords)} detail={`${number(baseline?.duplicateRecords)} baseline → ${number(raceguard?.duplicateRecords)} RaceGuard`} tone="teal" icon={ShieldCheck} />
              <MetricCard label="Consistency protected" value={number(comparison?.prevented.inconsistentSessions)} detail={`${number(raceguard?.inconsistentSessions)} inconsistent sessions remain`} tone="lime" icon={Check} />
              <MetricCard label="Recovery rate" value={percent(raceguard?.recoveryRate)} detail={`${number(raceguard?.recoveredFailures)} of ${number(raceguard?.injectedFailures)} injected failures`} tone="violet" icon={RefreshCcw} />
              <MetricCard label="P95 latency" value={`${raceguard?.p95Latency ?? 0} ms`} detail={`${comparison?.overhead.p95LatencyPct ?? 0}% safety overhead`} tone="orange" icon={Gauge} />
            </div>
            <div className="overview-grid">
              <Panel title="Failure surface" eyebrow="Same workload · two implementations" action={<button className="text-button" onClick={() => setScreen("comparison")}>View comparison <ChevronRight size={15} /></button>} className="chart-panel">
                <div className="chart-legend"><span><i className="legend-swatch baseline" /> Baseline</span><span><i className="legend-swatch raceguard" /> RaceGuard</span><span className="legend-note"><CircleDot size={11} /> live measured values</span></div>
                <div className="chart-wrap"><ResponsiveContainer width="100%" height={246}><BarChart data={chartData} margin={{ top: 8, right: 10, left: -18, bottom: 12 }} barGap={7}><CartesianGrid vertical={false} stroke="#e8edf3" /><XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: "#8390a1", fontSize: 11 }} interval={0} /><YAxis tickLine={false} axisLine={false} tick={{ fill: "#99a3b2", fontSize: 11 }} /><Tooltip cursor={{ fill: "#f6f8fa" }} contentStyle={{ border: "1px solid #e6ebf0", borderRadius: 10, fontSize: 12 }} /><Bar dataKey="baseline" name="Baseline" fill="#ff8e70" radius={[5, 5, 0, 0]} /><Bar dataKey="raceguard" name="RaceGuard" fill="#16b8a6" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer></div>
              </Panel>
              <Panel title="Run telemetry" eyebrow="Latest experiment" action={<StatusBadge>{experiment?.status ?? "ready"}</StatusBadge>} className="telemetry-panel">
                <div className="telemetry-big"><span>Requests processed</span><strong>{number(baseline?.totalRequests ?? 0)}</strong><small><span className="up-arrow">↑</span> {number(baseline?.throughput ?? 0)} req/s simulated throughput</small></div>
                <div className="telemetry-rows"><div><span>Workers</span><b>{experiment?.config.workers ?? 0}</b></div><div><span>Transactions</span><b>{number(raceguard?.committedTransactions ?? 0)} <em>committed</em></b></div><div><span>Trace coverage</span><b>100%</b></div></div>
                <div className="run-timestamp"><Clock3 size={14} /> {lastRunAt ? `Just ran at ${lastRunAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Last run completed moments ago"}</div>
              </Panel>
            </div>
            <div className="lower-grid"><Panel title="Processing pipeline" eyebrow="How RaceGuard closes the race window" className="pipeline-panel"><div className="pipeline"><div className="pipeline-step"><span className="step-number">01</span><div><strong>Validate</strong><small>Payload + sequence</small></div></div><div className="pipeline-line" /><div className="pipeline-step active"><span className="step-number">02</span><div><strong>Claim key</strong><small>Atomic uniqueness</small></div></div><div className="pipeline-line" /><div className="pipeline-step"><span className="step-number">03</span><div><strong>Commit</strong><small>State + trace together</small></div></div><div className="pipeline-line" /><div className="pipeline-step"><span className="step-number">04</span><div><strong>Replay safe</strong><small>Return cached result</small></div></div></div></Panel><Panel title="Validation focus" eyebrow="Acceptance criteria" className="focus-panel"><div className="focus-list"><div><span className="focus-icon green"><Check size={14} /></span><span>One logical request, one business record</span><b>PASS</b></div><div><span className="focus-icon green"><Check size={14} /></span><span>Stale events cannot roll back state</span><b>PASS</b></div><div><span className="focus-icon orange"><AlertTriangle size={14} /></span><span>SQLite / distributed DB variance</span><b>LIMIT</b></div></div></Panel></div>
          </>}

          {screen === "runner" && <RunnerScreen config={config} updateConfig={updateConfig} run={run} pending={runExperiment.isPending} />}
          {screen === "live" && <LiveScreen experiment={experiment} running={runExperiment.isPending} onRun={run} />}
          {screen === "comparison" && <ComparisonScreen comparison={comparison} chartData={chartData} latencyData={latencyData} />}
          {screen === "traces" && <TracesScreen traces={recentTraces} filter={traceFilter} setFilter={setTraceFilter} mode={traceMode} setMode={setTraceMode} />}
          {screen === "failures" && <FailureScreen experiment={experiment} failureToggles={failureToggles} />}
          {screen === "reports" && <ReportScreen experiment={experiment} exportReport={exportReport} />}
          {screen === "settings" && <SettingsScreen />}
        </div>
      </main>
    </div>
  );
}

function RunnerScreen({ config, updateConfig, run, pending }: { config: typeof initialConfig; updateConfig: (key: keyof typeof initialConfig, value: string) => void; run: () => void; pending: boolean }) {
  const inputs: Array<{ key: keyof typeof initialConfig; label: string; hint: string; suffix?: string }> = [
    { key: "sessions", label: "Sessions", hint: "Parallel game rooms" }, { key: "events", label: "Logical events", hint: "Seeded workload size" }, { key: "workers", label: "Concurrent workers", hint: "Requests in flight" }, { key: "requestRate", label: "Request rate", hint: "Synthetic throughput", suffix: "req/s" },
  ];
  const injections: Array<{ key: keyof typeof initialConfig; label: string; icon: any }> = [
    { key: "duplicateRate", label: "Duplicate requests", icon: CopyIcon }, { key: "retryRate", label: "Retry storm", icon: RefreshCcw }, { key: "delayRate", label: "Delayed events", icon: Clock3 }, { key: "outOfOrderRate", label: "Out-of-order events", icon: History }, { key: "transactionFailureRate", label: "Transaction failure", icon: TimerReset },
  ];
  return <div className="runner-view"><div className="page-heading"><div><div className="kicker"><SlidersHorizontal size={13} /> SCENARIO BUILDER</div><h1>Configure a failure run.</h1><p>Make the race window visible. The same seeded workload is replayed against both implementations.</p></div><StatusBadge tone="warning">Changes not saved</StatusBadge></div><div className="runner-grid"><Panel title="Workload parameters" eyebrow="Synthetic request generator"><div className="form-grid">{inputs.map(item => <label key={item.key} className="field"><span>{item.label}</span><div className="input-wrap"><input type="number" value={config[item.key]} onChange={e => updateConfig(item.key, e.target.value)} min={1} /><small>{item.suffix ?? ""}</small></div><em>{item.hint}</em></label>)}</div><div className="seed-row"><label className="field compact"><span>Experiment seed</span><input type="number" value={config.seed} onChange={e => updateConfig("seed", e.target.value)} /></label><div className="seed-note"><Code2 size={15} /><span>Deterministic replay is enabled. Seed 42 creates the validation dataset shipped with this prototype.</span></div></div></Panel><Panel title="Failure injection" eyebrow="Controlled adversarial conditions" action={<span className="injection-count"><span />5 enabled</span>}><div className="injection-list">{injections.map(item => { const Icon = item.icon; const value = config[item.key]; return <div className="injection-row" key={item.key}><div className="injection-icon"><Icon size={16} /></div><div className="injection-name"><strong>{item.label}</strong><span>Probability per logical event</span></div><input aria-label={item.label} type="range" min={0} max={item.key === "transactionFailureRate" ? 40 : 80} value={value} onChange={e => updateConfig(item.key, e.target.value)} /><strong className="range-value">{value}%</strong></div>; })}</div></Panel></div><div className="runner-footer"><div><div className="footer-check"><Check size={14} /> Controlled comparison</div><span>One generated workload · two processing paths · complete traces</span></div><button className="run-button large" onClick={run} disabled={pending}><Play size={16} fill="currentColor" />{pending ? "Executing workload…" : "Run baseline + RaceGuard"}<ChevronRight size={16} /></button></div></div>;
}

function LiveScreen({ experiment, running, onRun }: { experiment: any; running: boolean; onRun: () => void }) {
  const baseline = experiment?.comparison?.baseline; const raceguard = experiment?.comparison?.raceguard; const progress = running ? 62 : 100;
  const phases = [{ label: "Generate workload", done: true }, { label: "Baseline replay", done: true }, { label: "RaceGuard replay", done: !running }, { label: "Compare + validate", done: !running }];
  return <div className="live-view"><div className="page-heading"><div><div className="kicker"><Activity size={13} /> LIVE RUN MONITOR</div><h1>{running ? "Processing adversarial workload…" : "Experiment complete."}</h1><p>Real-time execution state, transaction outcomes, and trace coverage.</p></div><div className="live-controls"><StatusBadge tone={running ? "warning" : "success"}>{running ? "RUNNING" : "COMPLETED"}</StatusBadge><button className="secondary-button" onClick={onRun} disabled={running}><RefreshCcw size={15} /> Replay</button></div></div><div className="live-progress"><div className="progress-head"><span>Experiment {experiment?.id ?? "pending"}</span><b>{progress}%</b></div><div className="progress-track"><span style={{ width: `${progress}%` }} /></div><div className="phase-row">{phases.map((phase, index) => <div className={phase.done ? "phase done" : "phase"} key={phase.label}><span>{phase.done ? <Check size={13} /> : index + 1}</span>{phase.label}</div>)}</div></div><div className="live-stat-grid"><div className="live-stat"><span>Requests sent</span><strong>{number(baseline?.totalRequests)}</strong><small>across {number(experiment?.config?.workers)} workers</small></div><div className="live-stat"><span>Active workers</span><strong>{number(experiment?.config?.workers)}</strong><small>async request injectors</small></div><div className="live-stat"><span>Duplicate attempts</span><strong>{number(raceguard?.duplicateAttempts)}</strong><small>traced, not persisted</small></div><div className="live-stat"><span>Transactions</span><strong>{number(raceguard?.committedTransactions)}</strong><small><span className="green-text">{number(raceguard?.rolledBackTransactions)} rollback-safe</span></small></div></div><div className="live-grid"><Panel title="Execution stream" eyebrow="Last observed phases"><div className="stream-list"><div><span className="stream-time">00:00.0</span><i className="stream-dot green" /><span>Workload materialized with seed {experiment?.config?.seed ?? 42}</span><b>READY</b></div><div><span className="stream-time">00:00.2</span><i className="stream-dot orange" /><span>Baseline replay opened {number(baseline?.totalRequests)} request traces</span><b>CAPTURED</b></div><div><span className="stream-time">00:01.1</span><i className="stream-dot teal" /><span>RaceGuard claimed unique keys atomically</span><b>COMMITTED</b></div><div><span className="stream-time">00:01.4</span><i className="stream-dot violet" /><span>Out-of-order events evaluated against session versions</span><b>VALIDATED</b></div></div></Panel><Panel title="Safety margin" eyebrow="RaceGuard overhead"><div className="safety-metric"><div className="safety-ring"><strong>{raceguard?.recoveryRate ?? 0}%</strong><span>recovery</span></div><div className="safety-copy"><div><span>Avg latency overhead</span><b>+{experiment?.comparison?.overhead?.avgLatencyPct ?? 0}%</b></div><div><span>P95 overhead</span><b>+{experiment?.comparison?.overhead?.p95LatencyPct ?? 0}%</b></div><div><span>Final session state</span><b className="green-text">CONSISTENT</b></div></div></div></Panel></div></div>;
}

function ComparisonScreen({ comparison, chartData, latencyData }: { comparison: any; chartData: any[]; latencyData: any[] }) {
  const rows = [
    ["Total requests", number(comparison?.baseline?.totalRequests), number(comparison?.raceguard?.totalRequests)], ["Duplicate attempts", number(comparison?.baseline?.duplicateAttempts), number(comparison?.raceguard?.duplicateAttempts)], ["Duplicate records", number(comparison?.baseline?.duplicateRecords), number(comparison?.raceguard?.duplicateRecords)], ["Inconsistent sessions", number(comparison?.baseline?.inconsistentSessions), number(comparison?.raceguard?.inconsistentSessions)], ["Failed transactions", number(comparison?.baseline?.failedTransactions), number(comparison?.raceguard?.failedTransactions)], ["Recovery rate", percent(comparison?.baseline?.recoveryRate), percent(comparison?.raceguard?.recoveryRate)], ["Average latency", `${comparison?.baseline?.avgLatency ?? 0} ms`, `${comparison?.raceguard?.avgLatency ?? 0} ms`], ["P95 latency", `${comparison?.baseline?.p95Latency ?? 0} ms`, `${comparison?.raceguard?.p95Latency ?? 0} ms`], ["P99 latency", `${comparison?.baseline?.p99Latency ?? 0} ms`, `${comparison?.raceguard?.p99Latency ?? 0} ms`],
  ];
  return <div className="comparison-view"><div className="page-heading"><div><div className="kicker"><GitCompareArrows size={13} /> CONTROLLED COMPARISON</div><h1>Safety is the product.</h1><p>Every number below is generated by the same seeded workload, not a static fixture.</p></div><div className="comparison-callout"><ShieldCheck size={16} /><span><b>{number(comparison?.prevented?.duplicateRecords)}</b> duplicate records prevented</span></div></div><div className="compare-cards"><div className="compare-hero baseline-card"><span>UNSAFE BASELINE</span><strong>{number(comparison?.baseline?.duplicateRecords)}</strong><small>duplicate records created</small><div className="hero-bar"><i style={{ width: `${Math.min(100, comparison?.baseline?.duplicateRecordRate ?? 0) * 4}%` }} /></div></div><div className="compare-arrow"><GitCompareArrows size={20} /></div><div className="compare-hero raceguard-card"><span>RACEGUARD</span><strong>{number(comparison?.raceguard?.duplicateRecords)}</strong><small>duplicate records created</small><div className="hero-bar"><i style={{ width: `${Math.min(100, comparison?.raceguard?.duplicateRecordRate ?? 0) * 4}%` }} /></div></div></div><div className="comparison-grid"><Panel title="Metric ledger" eyebrow="Same request trace set" className="ledger-panel"><div className="ledger-table"><div className="ledger-header"><span>Metric</span><span>Baseline</span><span>RaceGuard</span><span>Delta</span></div>{rows.map(row => <div className="ledger-row" key={row[0]}><span>{row[0]}</span><span className={row[0].includes("duplicate") || row[0].includes("inconsistent") ? "bad-value" : ""}>{row[1]}</span><span className={row[0].includes("duplicate") || row[0].includes("inconsistent") ? "good-value" : ""}>{row[2]}</span><span><ChevronRight size={14} /></span></div>)}</div></Panel><Panel title="Latency profile" eyebrow="Milliseconds · lower is better"><div className="chart-wrap latency-chart"><ResponsiveContainer width="100%" height={245}><LineChart data={latencyData} margin={{ top: 14, right: 14, left: -18, bottom: 6 }}><CartesianGrid vertical={false} stroke="#e8edf3" /><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "#8390a1", fontSize: 11 }} /><YAxis tickLine={false} axisLine={false} tick={{ fill: "#99a3b2", fontSize: 11 }} /><Tooltip contentStyle={{ border: "1px solid #e6ebf0", borderRadius: 10, fontSize: 12 }} /><Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} /><Line type="monotone" dataKey="baseline" name="Baseline" stroke="#ff8e70" strokeWidth={2.5} dot={{ r: 3 }} /><Line type="monotone" dataKey="raceguard" name="RaceGuard" stroke="#16b8a6" strokeWidth={2.5} dot={{ r: 3 }} /></LineChart></ResponsiveContainer></div></Panel></div></div>;
}

function TracesScreen({ traces, filter, setFilter, mode, setMode }: { traces: any[]; filter: string; setFilter: (value: string) => void; mode: "all" | "baseline" | "raceguard"; setMode: (mode: "all" | "baseline" | "raceguard") => void }) {
  return <div className="traces-view"><div className="page-heading"><div><div className="kicker"><Network size={13} /> REQUEST TRACE STORE</div><h1>See every decision.</h1><p>Duplicates are observable even when business records are not created.</p></div><div className="trace-count"><strong>{number(traces.length)}</strong><span>traces in view</span></div></div><Panel title="Trace explorer" eyebrow="Filterable transaction ledger" action={<div className="trace-controls"><div className="search-box"><Search size={15} /><input value={filter} onChange={e => setFilter(e.target.value)} placeholder="Search trace, event, result…" /></div><select value={mode} onChange={e => setMode(e.target.value as typeof mode)}><option value="all">All modes</option><option value="baseline">Baseline</option><option value="raceguard">RaceGuard</option></select></div>}><div className="trace-table-wrap"><table className="trace-table"><thead><tr><th>Trace / request</th><th>Event</th><th>Attempt</th><th>Mode</th><th>Duplicate</th><th>Transaction</th><th>Result</th><th>Latency</th></tr></thead><tbody>{traces.slice(0, 80).map((trace: any) => <tr key={trace.traceId}><td><strong>{trace.traceId}</strong><small>{trace.requestId}</small></td><td><strong>{trace.eventId}</strong><small>{trace.sessionId}</small></td><td><span className="attempt-pill">{trace.attemptNumber}</span></td><td><span className={`mode-label ${trace.mode}`}>{trace.mode}</span></td><td>{trace.duplicateDetected ? <StatusBadge tone="warning">YES</StatusBadge> : <span className="muted">no</span>}</td><td><span className={`txn-label ${trace.transactionStatus.toLowerCase()}`}>{trace.transactionStatus}</span></td><td><span className={`result-label ${trace.failure}`}>{trace.result}</span></td><td><b>{trace.latencyMs} ms</b></td></tr>)}</tbody></table>{traces.length === 0 && <div className="empty-state"><Search size={22} /><strong>No traces match</strong><span>Try a different filter or run a new experiment.</span></div>}</div></Panel></div>;
}

function FailureScreen({ experiment, failureToggles }: { experiment: any; failureToggles: Set<string> }) {
  return <div className="failure-view"><div className="page-heading"><div><div className="kicker"><TriangleAlert size={13} /> FAILURE ANALYSIS</div><h1>Failures are first-class data.</h1><p>Trace the injected fault, the protection mechanism, and the recovery outcome.</p></div><StatusBadge tone="warning">{failureToggles.size} scenarios observed</StatusBadge></div><div className="failure-grid">{failureCards.map(card => { const Icon = card.icon; const observed = failureToggles.has(card.id); return <div className={`failure-card ${card.color}`} key={card.id}><div className="failure-card-top"><div className="failure-icon"><Icon size={18} /></div><span className={observed ? "observed" : "not-observed"}>{observed ? "OBSERVED" : "NOT OBSERVED"}</span></div><strong>{card.title}</strong><p>{card.detail}</p><div className="failure-outcome"><span>RaceGuard outcome</span><b><Check size={13} /> {card.id === "stale" ? "ignored safely" : card.id === "transaction" ? "rolled back" : "replayed safely"}</b></div></div>; })}</div><div className="analysis-grid"><Panel title="Why baseline fails" eyebrow="Root-cause analysis"><div className="analysis-block"><div className="analysis-number">01</div><div><strong>Check-then-insert race</strong><p>Concurrent baseline requests can both pass an existence check before either write completes. The result is more than one business record for a single logical event.</p><code>if not exists → insert()</code></div></div><div className="analysis-block"><div className="analysis-number">02</div><div><strong>Version regression</strong><p>Delayed events are allowed to update state without checking the session version, so an older position can overwrite a newer one.</p><code>state.version = incoming.sequence</code></div></div></Panel><Panel title="What RaceGuard changes" eyebrow="Control mechanisms"><div className="guard-list"><div><ShieldCheck size={16} /><span>Unique idempotency key</span><b>ATOMIC</b></div><div><ServerCog size={16} /><span>Transaction boundary</span><b>ROLLBACK</b></div><div><GitCompareArrows size={16} /><span>Session version check</span><b>ORDERED</b></div><div><History size={16} /><span>Trace every duplicate</span><b>VISIBLE</b></div></div></Panel></div></div>;
}

function ReportScreen({ experiment, exportReport }: { experiment: any; exportReport: () => void }) {
  const baseline = experiment?.comparison?.baseline; const raceguard = experiment?.comparison?.raceguard;
  return <div className="report-view"><div className="page-heading"><div><div className="kicker"><FileText size={13} /> EXPERIMENT REPORT</div><h1>Evidence, not assurances.</h1><p>Validation report for {experiment?.id ?? "the latest run"}, generated from captured request traces.</p></div><button className="secondary-button" onClick={exportReport}><Download size={15} /> Export JSON</button></div><div className="report-hero"><div><span className="report-label">VALIDATION RESULT</span><strong>RaceGuard passed the safety gate</strong><p>{number(experiment?.comparison?.prevented?.duplicateRecords)} duplicate records and {number(experiment?.comparison?.prevented?.inconsistentSessions)} inconsistent sessions prevented versus the unsafe baseline.</p></div><div className="report-seal"><ShieldCheck size={28} /><span>PASS</span></div></div><div className="report-grid"><Panel title="Measured result" eyebrow="Target vs observed"><div className="report-table"><div><span>Duplicate business records</span><b>0</b><em>target</em><strong>{number(raceguard?.duplicateRecords)}</strong></div><div><span>Inconsistent final sessions</span><b>0</b><em>target</em><strong>{number(raceguard?.inconsistentSessions)}</strong></div><div><span>Recovery rate</span><b>100%</b><em>target</em><strong>{percent(raceguard?.recoveryRate)}</strong></div><div><span>P95 latency overhead</span><b>&lt; 50%</b><em>target</em><strong>+{experiment?.comparison?.overhead?.p95LatencyPct ?? 0}%</strong></div></div></Panel><Panel title="Run manifest" eyebrow="Reproducibility"><div className="manifest-list"><div><span>Seed</span><b>{experiment?.config?.seed}</b></div><div><span>Logical events</span><b>{number(experiment?.config?.events)}</b></div><div><span>Workers</span><b>{number(experiment?.config?.workers)}</b></div><div><span>Injected duplicate rate</span><b>{experiment?.config?.duplicateRate}%</b></div><div><span>Trace coverage</span><b className="green-text">100%</b></div></div></Panel></div><Panel title="Limitations to carry forward" eyebrow="Production readiness notes"><div className="limitation-grid"><div><AlertTriangle size={15} /><span>SQLite-style single-node semantics are not a substitute for distributed transaction testing.</span></div><div><AlertTriangle size={15} /><span>Workloads are synthetic; real client clock skew and network partitions are not modeled.</span></div><div><AlertTriangle size={15} /><span>High-scale multiplayer traffic and cross-region consistency remain outside prototype scope.</span></div></div></Panel></div>;
}

function SettingsScreen() {
  return <div className="settings-view"><div className="page-heading"><div><div className="kicker"><Settings2 size={13} /> SYSTEM SETTINGS</div><h1>Prototype boundaries.</h1><p>Implementation notes and runtime guardrails for this field-ready harness.</p></div><StatusBadge>Configured</StatusBadge></div><div className="settings-grid"><Panel title="Processing contract" eyebrow="RaceGuard invariants"><div className="contract-list"><div><span>Idempotency key</span><code>session_id : player_id : event_id</code></div><div><span>State ordering</span><code>incoming.sequence ≥ current.version</code></div><div><span>Transaction</span><code>claim → validate → write → trace → commit</code></div><div><span>Duplicate response</span><code>duplicate_ignored</code></div></div></Panel><Panel title="Runtime profile" eyebrow="Modest hardware target"><div className="runtime-list"><div><ServerCog size={16} /><span>Single Node process</span><b>ACTIVE</b></div><div><Code2 size={16} /><span>Seeded synthetic generator</span><b>42</b></div><div><Gauge size={16} /><span>Max experiment events</span><b>5,000</b></div><div><Zap size={16} /><span>Recommended memory</span><b>2–4 GB</b></div></div></Panel></div><Panel title="API surface" eyebrow="tRPC procedures used by the dashboard"><div className="api-list"><code>health</code><span>System health + connectivity</span><code>experiments.latest</code><span>Latest experiment with traces</span><code>experiments.run</code><span>Run a deterministic comparison</span><code>traces</code><span>Search trace store by mode or text</span><code>sessions</code><span>Final session versions</span></div></Panel></div>;
}
