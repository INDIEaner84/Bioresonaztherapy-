import { useEffect, useMemo, useRef, useState } from "react";
import { parseStoredLogs, serializeLogs } from "./session-log.js";
import type { SessionLogRecord } from "./session-log.js";
import {
  validateControl,
  validatePasses,
  validateProgram,
} from "./validation.js";
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  AudioLines,
  Battery,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Command,
  Cpu,
  Download,
  FileCode2,
  FlaskConical,
  Gauge,
  History,
  LayoutDashboard,
  Menu,
  Play,
  Radio,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  Signal,
  Terminal,
  Waves,
  X,
} from "lucide-react";

type Page = "overview" | "control" | "program" | "sensor" | "activity";
type LogEntry = SessionLogRecord;

const navItems: { id: Page; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "control", label: "Manual control", icon: Settings2 },
  { id: "program", label: "Run program", icon: FileCode2 },
  { id: "sensor", label: "Sensor", icon: Activity },
  { id: "activity", label: "Activity log", icon: History },
];

function readInitialSession(): { logs: LogEntry[]; warning: boolean } {
  try {
    return parseStoredLogs(localStorage.getItem("s2-studio-log"));
  } catch {
    return { logs: [], warning: true };
  }
}

const formatTime = (date = new Date()) =>
  new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);

function App() {
  const [page, setPage] = useState<Page>("overview");
  const [initialSession] = useState(readInitialSession);
  const [logs, setLogs] = useState<LogEntry[]>(initialSession.logs);
  const [storageWarning, setStorageWarning] = useState(initialSession.warning);
  const logsDirty = useRef(false);
  const nextLogId = useRef(
    Math.max(Date.now(), ...initialSession.logs.map((entry) => entry.id + 1)),
  );
  const [toast, setToast] = useState("");
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installInstalled, setInstallInstalled] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [frequency, setFrequency] = useState("1000");
  const [amplitude, setAmplitude] = useState("5");
  const [duration, setDuration] = useState("2");
  const [channel, setChannel] = useState("1");
  const [programCode, setProgramCode] = useState("1000=0.1,2000=0.1");
  const [iterations, setIterations] = useState("1");
  const [sensorReadings, setSensorReadings] = useState<number[]>(() =>
    Array.from({ length: 12 }, () => 68 + Math.floor(Math.random() * 17)),
  );
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!logsDirty.current) return;
    try {
      localStorage.setItem("s2-studio-log", serializeLogs(logs));
      setStorageWarning(false);
    } catch {
      setStorageWarning(true);
    }
  }, [logs]);
  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    const onInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstallInstalled(true);
      setInstallPrompt(null);
      notify("S2 Studio installed");
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("beforeinstallprompt", onInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("beforeinstallprompt", onInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  function notify(message: string) {
    setToast(message);
  }
  function addLog(
    action: string,
    detail: string,
    type: LogEntry["type"] = "success",
  ) {
    logsDirty.current = true;
    const now = new Date();
    nextLogId.current = Math.max(nextLogId.current + 1, now.getTime());
    setLogs((current) =>
      [
        {
          id: nextLogId.current,
          time: formatTime(now),
          timestamp: now.toISOString(),
          action,
          detail,
          type,
        },
        ...current,
      ].slice(0, 100),
    );
  }
  function go(next: Page) {
    setPage(next);
    setMobileNavOpen(false);
  }
  async function installApp() {
    if (!installPrompt) {
      notify("Use your browser menu to install this app.");
      return;
    }
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallPrompt(null);
      if (choice.outcome === "dismissed")
        notify(
          "Installation was dismissed; the app remains available in this browser.",
        );
    } catch {
      notify("The browser could not open its install prompt.");
    }
  }
  function runSimulation(action: string, detail: string) {
    setRunning(true);
    addLog(
      `${action} requested`,
      `${detail} · simulation preview only`,
      "info",
    );
    notify("Simulation preview started — no CLI or device is connected");
    window.setTimeout(() => {
      setRunning(false);
      addLog(
        "Simulation preview complete",
        "No CLI command ran; no physical output was measured",
        "success",
      );
      notify("Simulation preview complete");
    }, 1050);
  }
  function startControl() {
    const error = validateControl({ frequency, amplitude, duration });
    if (error) return notify(error);
    runSimulation(
      "Manual control preview",
      `${Number(frequency).toLocaleString()} Hz · ${amplitude} V setpoint · ${duration} s · channel ${channel}`,
    );
  }
  function startProgram() {
    const syntaxError = validateProgram(programCode);
    if (syntaxError) return notify(syntaxError);
    const passesError = validatePasses(iterations);
    if (passesError) return notify(passesError);
    const passes = Number(iterations);
    runSimulation(
      "Program preview",
      `${programCode.trim()} · ${passes} ${passes === 1 ? "pass" : "passes"}`,
    );
  }
  function readPulse() {
    const value = 68 + Math.floor(Math.random() * 17);
    setSensorReadings((items) => [...items.slice(-23), value]);
    addLog(
      "Simulated sensor sample",
      "Synthetic value only · not a medical measurement",
      "info",
    );
    notify("Synthetic sensor sample added");
  }
  const programError = useMemo(
    () => validateProgram(programCode),
    [programCode],
  );
  const currentTitle =
    navItems.find((item) => item.id === page)?.label ?? "Overview";

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNavOpen ? "sidebar-open" : ""}`}>
        <div className="brand">
          <div className="brand-mark">
            <AudioLines size={21} strokeWidth={2.3} />
          </div>
          <div>
            <strong>
              s2<span>studio</span>
            </strong>
            <small>DEVICE LAB</small>
          </div>
          <button
            className="icon-button close-nav"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <div className="workspace-switch">
          <div className="workspace-avatar">L</div>
          <div className="workspace-copy">
            <strong>Local workspace</strong>
            <small>Personal environment</small>
          </div>
        </div>
        <nav className="main-nav" aria-label="Main navigation">
          <div className="nav-label">DEVICE</div>
          {navItems.slice(0, 4).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${page === id ? "active" : ""}`}
              onClick={() => go(id)}
            >
              <Icon size={18} strokeWidth={1.8} />
              <span>{label}</span>
              {id === "sensor" && <span className="nav-tag">SIM</span>}
            </button>
          ))}
          <div className="nav-label nav-label-spaced">WORKSPACE</div>
          {navItems.slice(4).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              className={`nav-item ${page === id ? "active" : ""}`}
              onClick={() => go(id)}
            >
              <Icon size={18} strokeWidth={1.8} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="connection-card">
            <div className="connection-top">
              <span className="status-dot sim-dot" />{" "}
              <span>Simulation mode</span>
              <span className="live-pill">ON</span>
            </div>
            <p>No device bridge configured</p>
            <div className="connection-divider" />
            <div className="connection-detail">
              <span>Demo output</span>
              <strong>
                <span className="status-dot idle-dot" /> Off
              </strong>
            </div>
          </div>
          <button
            className="help-link"
            onClick={() =>
              notify(
                "Experimental engineering software — not for diagnosis, treatment, or hardware safety",
              )
            }
          >
            <CircleHelp size={17} /> Safety note
          </button>
          <div className="profile-row">
            <div className="profile-avatar">S</div>
            <div className="profile-copy">
              <strong>Local session</strong>
              <small>History stored in this browser</small>
            </div>
          </div>
        </div>
      </aside>
      {mobileNavOpen && (
        <button
          className="mobile-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileNavOpen(false)}
        />
      )}

      <main className="main-area">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="icon-button mobile-menu"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            <div className="breadcrumbs">
              <span>Device lab</span>
              <span className="crumb-sep">/</span>
              <strong>{currentTitle}</strong>
            </div>
          </div>
          <div className="topbar-right">
            <div className={`network-status ${isOnline ? "" : "offline"}`}>
              <span className="network-dot" />
              {isOnline ? "Browser online" : "Browser offline"}
            </div>
            <button
              className="install-button"
              onClick={installApp}
              disabled={installInstalled}
            >
              <Download size={15} />
              {installInstalled ? "Installed" : "Install app"}
            </button>
            <span className="avatar-button" aria-label="Local session">
              S
            </span>
          </div>
        </header>
        {!isOnline && (
          <div className="offline-notice">
            <AlertTriangle size={16} /> Browser offline — the cached interface
            may remain available. This app has no device connection.
          </div>
        )}
        {storageWarning && (
          <div className="offline-notice">
            <AlertTriangle size={16} /> Some browser-local activity data could
            not be read or saved. It will not be overwritten until a new event
            is recorded.
          </div>
        )}

        <div className="page-content">
          {page === "overview" && <Overview go={go} logs={logs} />}
          {page === "control" && (
            <ManualControl
              frequency={frequency}
              setFrequency={setFrequency}
              amplitude={amplitude}
              setAmplitude={setAmplitude}
              duration={duration}
              setDuration={setDuration}
              channel={channel}
              setChannel={setChannel}
              running={running}
              start={startControl}
            />
          )}
          {page === "program" && (
            <ProgramRunner
              code={programCode}
              setCode={setProgramCode}
              iterations={iterations}
              setIterations={setIterations}
              error={programError}
              running={running}
              start={startProgram}
            />
          )}
          {page === "sensor" && (
            <SensorPage readings={sensorReadings} readPulse={readPulse} />
          )}
          {page === "activity" && (
            <ActivityPage
              logs={logs}
              clear={() => {
                logsDirty.current = true;
                setLogs([]);
                notify("Local activity log cleared");
              }}
            />
          )}
          <footer className="page-footer">
            <span>
              <ShieldAlert size={13} /> Experimental software · Not a medical or
              safety system
            </span>
            <span>
              Build 0.1.0 <span className="footer-dot">·</span> Local-first
            </span>
          </footer>
        </div>
      </main>
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
    </div>
  );
}

function Overview({
  go,
  logs,
}: {
  go: (page: Page) => void;
  logs: LogEntry[];
}) {
  const hourlyCounts = Array.from({ length: 24 }, () => 0);
  const now = new Date();
  for (const entry of logs) {
    if (!entry.timestamp) continue;
    const timestamp = new Date(entry.timestamp);
    if (timestamp.toDateString() === now.toDateString())
      hourlyCounts[timestamp.getHours()] += 1;
  }
  const hasChartEvents = hourlyCounts.some((count) => count > 0);
  const chartMax = Math.max(1, ...hourlyCounts);
  const yLabels = hasChartEvents
    ? [
        chartMax,
        Math.ceil(chartMax * 0.75),
        Math.ceil(chartMax * 0.5),
        Math.ceil(chartMax * 0.25),
        0,
      ]
    : [0, 0, 0, 0, 0];
  const currentHour = now.getHours();
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-line" /> SYSTEM OVERVIEW
          </div>
          <h1>Your device workspace</h1>
          <p className="page-subtitle">
            A clear view of your local simulation environment.
          </p>
        </div>
        <div className="today-label">
          <Clock3 size={15} /> Today
        </div>
      </div>
      <div className="safety-banner">
        <div className="safety-icon">
          <ShieldAlert size={19} />
        </div>
        <div>
          <strong>Simulation only — device access is not configured</strong>
          <p>
            No CLI or local device bridge is configured; actions here cannot
            control hardware.
          </p>
        </div>
        <span className="banner-badge">
          <span className="status-dot sim-dot" /> SIMULATION
        </span>
      </div>

      <section className="metric-grid" aria-label="Session overview">
        <MetricCard
          label="Session mode"
          value="Simulation"
          icon={FlaskConical}
          iconClass="mint-icon"
          meta="No local device bridge configured"
        />
        <MetricCard
          label="Demo output"
          value="Off"
          icon={Radio}
          iconClass="slate-icon"
          meta="No hardware output is available"
        />
        <MetricCard
          label="Session activity"
          value={String(logs.length).padStart(2, "0")}
          icon={Activity}
          iconClass="blue-icon"
          meta="Local events recorded"
        />
        <MetricCard
          label="Application status"
          value="Ready"
          icon={Cpu}
          iconClass="violet-icon"
          meta="Running in this browser"
        />
      </section>

      <div className="section-heading">
        <div>
          <h2>Session activity</h2>
          <p>Simulation events in this local session</p>
        </div>
        <button className="text-button" onClick={() => go("activity")}>
          View activity <ArrowUpRight size={15} />
        </button>
      </div>
      <section className="overview-grid">
        <div className="panel activity-chart-panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">Local events by hour</div>
              <div className="panel-caption">
                Counts from this browser’s activity log · today
              </div>
            </div>
            <Activity size={16} className="chart-header-icon" />
          </div>
          <div className="chart-legend">
            <span className="legend-dot" /> Browser-local events{" "}
            <span className="legend-note">No device or sensor data</span>
          </div>
          <div className="chart-wrap">
            <div className="chart-y-labels">
              {yLabels.map((label, index) => (
                <span key={index}>{label}</span>
              ))}
            </div>
            <div className="chart-area">
              <div className="chart-grid-lines">
                <i />
                <i />
                <i />
                <i />
                <i />
              </div>
              <div className="bar-chart">
                {hourlyCounts.map((count, index) => (
                  <div
                    key={index}
                    className={`chart-bar ${index > currentHour ? "bar-muted" : ""}`}
                    style={{
                      height: `${count === 0 ? 1.5 : Math.max(3, (count / chartMax) * 100)}%`,
                    }}
                    title={`${index}:00 · ${count} local ${count === 1 ? "event" : "events"}`}
                    aria-label={`${index}:00, ${count} local ${count === 1 ? "event" : "events"}`}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="chart-x-labels">
            <span>00:00</span>
            <span>06:00</span>
            <span>12:00</span>
            <span>18:00</span>
            <span>24:00</span>
          </div>
          <div className="chart-footnote">
            <span className="pulse-line">
              <Activity size={14} /> Logged event count
            </span>
            <span>
              {
                logs.filter(
                  (entry) =>
                    entry.timestamp &&
                    new Date(entry.timestamp).toDateString() ===
                      now.toDateString(),
                ).length
              }{" "}
              events today · local log only
            </span>
          </div>
        </div>
        <div className="panel quick-panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">Quick actions</div>
              <div className="panel-caption">Simulation tools</div>
            </div>
            <div className="quick-icon">
              <Command size={16} />
            </div>
          </div>
          <button className="quick-action" onClick={() => go("control")}>
            <span className="quick-action-icon mint-bg">
              <Waves size={17} />
            </span>
            <span className="quick-action-copy">
              <strong>Manual control</strong>
              <small>Preview a setpoint command</small>
            </span>
            <ArrowDownRight size={16} className="quick-arrow" />
          </button>
          <button className="quick-action" onClick={() => go("program")}>
            <span className="quick-action-icon blue-bg">
              <FileCode2 size={17} />
            </span>
            <span className="quick-action-copy">
              <strong>Run a program</strong>
              <small>Validate supported syntax</small>
            </span>
            <ArrowDownRight size={16} className="quick-arrow" />
          </button>
          <button className="quick-action" onClick={() => go("sensor")}>
            <span className="quick-action-icon violet-bg">
              <Activity size={17} />
            </span>
            <span className="quick-action-copy">
              <strong>Sensor preview</strong>
              <small>Generate a synthetic sample</small>
            </span>
            <ArrowDownRight size={16} className="quick-arrow" />
          </button>
          <div className="quick-note">
            <ShieldCheck size={14} />
            <span>Actions are simulated locally and never reach hardware.</span>
          </div>
        </div>
      </section>
      <div className="section-heading recent-heading">
        <div>
          <h2>Recent events</h2>
          <p>Latest activity saved in this browser</p>
        </div>
        <button className="text-button" onClick={() => go("activity")}>
          Open log <ArrowUpRight size={15} />
        </button>
      </div>
      <div className="panel recent-list">
        {logs.slice(0, 3).map((log) => (
          <LogRow key={log.id} log={log} />
        ))}
        {logs.length === 0 && (
          <EmptyState
            title="No recent events"
            detail="Simulation activity will appear here."
          />
        )}
      </div>
    </>
  );
}

function MetricCard({
  label,
  value,
  icon: Icon,
  iconClass,
  meta,
}: {
  label: string;
  value: string;
  icon: typeof Activity;
  iconClass: string;
  meta: string;
}) {
  return (
    <div className="panel metric-card">
      <div className={`metric-icon ${iconClass}`}>
        <Icon size={18} strokeWidth={1.8} />
      </div>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      <div className="metric-meta">
        <span className="metric-meta-dot" />
        {meta}
      </div>
    </div>
  );
}

function ManualControl({
  frequency,
  setFrequency,
  amplitude,
  setAmplitude,
  duration,
  setDuration,
  channel,
  setChannel,
  running,
  start,
}: {
  frequency: string;
  setFrequency: (v: string) => void;
  amplitude: string;
  setAmplitude: (v: string) => void;
  duration: string;
  setDuration: (v: string) => void;
  channel: string;
  setChannel: (v: string) => void;
  running: boolean;
  start: () => void;
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-line" /> SIMULATION WORKSPACE
          </div>
          <h1>Manual control</h1>
          <p className="page-subtitle">
            Configure a sample command and preview it in the UI.
          </p>
        </div>
        <span className="mode-chip">
          <span className="status-dot sim-dot" /> Simulation
        </span>
      </div>
      <div className="safety-banner compact-banner">
        <div className="safety-icon">
          <ShieldAlert size={19} />
        </div>
        <div>
          <strong>Preview only</strong>
          <p>
            These values are simulated. This page cannot connect to or control
            hardware.
          </p>
        </div>
      </div>
      <div className="control-layout">
        <form
          className="panel form-panel"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            start();
          }}
        >
          <div className="panel-header form-panel-header">
            <div>
              <div className="panel-title">Command parameters</div>
              <div className="panel-caption">
                Setpoints are software requests, not measured output.
              </div>
            </div>
            <span className="form-step">
              01 <span>/ 01</span>
            </span>
          </div>
          <div className="form-grid">
            <label className="field">
              <span>Frequency</span>
              <div className="input-with-unit">
                <input
                  type="number"
                  min="0"
                  max="5000000"
                  step="any"
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                />
                <span>Hz</span>
              </div>
              <small>0–5,000,000 Hz</small>
            </label>
            <label className="field">
              <span>Amplitude setpoint</span>
              <div className="input-with-unit">
                <input
                  type="number"
                  min="0"
                  max="40"
                  step="any"
                  value={amplitude}
                  onChange={(e) => setAmplitude(e.target.value)}
                />
                <span>V</span>
              </div>
              <small>0–40 V · software setpoint only</small>
            </label>
            <label className="field">
              <span>Channel</span>
              <div className="select-wrap">
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value)}
                >
                  <option value="1">Channel 1</option>
                  <option value="2">Channel 2</option>
                  <option value="0">Synchronized / both</option>
                </select>
                <ChevronDown size={15} />
              </div>
              <small>Channel selection for simulation</small>
            </label>
            <label className="field">
              <span>Duration</span>
              <div className="input-with-unit">
                <input
                  type="number"
                  min="0.1"
                  step="any"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                />
                <span>sec</span>
              </div>
              <small>Positive finite value · simulation preview</small>
            </label>
          </div>
          <div className="output-state-row">
            <div className="output-state-icon">
              <Radio size={17} />
            </div>
            <div>
              <strong>Output state</strong>
              <small>Off · physical output is not available</small>
            </div>
            <span className="state-switch">
              <span />
            </span>
          </div>
          <div className="form-action-row">
            <span>
              <ShieldCheck size={15} /> Preview works without a device
            </span>
            <button
              type="submit"
              className="button button-primary"
              disabled={running}
            >
              {running ? (
                <>
                  <RefreshCw size={16} className="spin" /> Running simulation
                </>
              ) : (
                <>
                  <Play size={15} fill="currentColor" /> Preview command
                </>
              )}
            </button>
          </div>
        </form>
        <aside className="panel side-info-panel">
          <div className="side-info-heading">
            <div className="side-info-icon">
              <Gauge size={18} />
            </div>
            <div>
              <strong>Command summary</strong>
              <small>Simulation preview</small>
            </div>
          </div>
          <div className="summary-item">
            <span>Mode</span>
            <strong>
              <span className="status-dot sim-dot" /> Simulation only
            </strong>
          </div>
          <div className="summary-item">
            <span>Local bridge</span>
            <strong className="text-muted">Not configured</strong>
          </div>
          <div className="summary-item">
            <span>Output</span>
            <strong className="text-muted">Off</strong>
          </div>
          <div className="info-callout">
            <AlertTriangle size={15} />
            <p>
              Software cannot verify the waveform or physical output. This
              prototype is not a medical or safety system.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}

function ProgramRunner({
  code,
  setCode,
  iterations,
  setIterations,
  error,
  running,
  start,
}: {
  code: string;
  setCode: (v: string) => void;
  iterations: string;
  setIterations: (v: string) => void;
  error: string | null;
  running: boolean;
  start: () => void;
}) {
  const steps = code
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean).length;
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-line" /> PROGRAM WORKSPACE
          </div>
          <h1>Run a program</h1>
          <p className="page-subtitle">
            Validate a supported sample program before simulation.
          </p>
        </div>
        <span className="mode-chip">
          <span className="status-dot sim-dot" /> Simulation
        </span>
      </div>
      <div className="safety-banner compact-banner">
        <div className="safety-icon">
          <ShieldAlert size={19} />
        </div>
        <div>
          <strong>Simulation only</strong>
          <p>
            This page only previews text; no CLI, local device bridge, or
            imported database is configured.
          </p>
        </div>
      </div>
      <form
        className="program-layout"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          start();
        }}
      >
        <section className="panel editor-panel">
          <div className="editor-toolbar">
            <div className="editor-file">
              <FileCode2 size={16} />
              <span>preview-code</span>
              <span className="unsaved-dot" />
            </div>
            <span className="language-label">SUPPORTED SUBSET</span>
          </div>
          <div className="editor-body">
            <div className="line-numbers">
              {code.split("\n").map((_, i) => (
                <span key={i}>{String(i + 1).padStart(2, "0")}</span>
              ))}
            </div>
            <textarea
              spellCheck={false}
              aria-label="Program code"
              aria-describedby="program-feedback"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <div
            id="program-feedback"
            className={`editor-validation ${error ? "validation-error" : ""}`}
            role="status"
          >
            {error ? (
              <>
                <AlertTriangle size={14} />
                <span>{error}</span>
              </>
            ) : (
              <>
                <Check size={14} />
                <span>
                  Syntax looks valid for the supported simulation subset.
                </span>
              </>
            )}
            <span className="step-count">
              {steps} {steps === 1 ? "step" : "steps"}
            </span>
          </div>
        </section>
        <aside className="panel run-settings">
          <div className="panel-title">Run settings</div>
          <div className="settings-description">
            Keep each preview finite. Continuous loops are not available in this
            prototype.
          </div>
          <label className="field">
            <span>Passes</span>
            <div className="input-with-unit">
              <input
                type="number"
                min="1"
                step="1"
                value={iterations}
                onChange={(e) => setIterations(e.target.value)}
              />
              <span>×</span>
            </div>
            <small>Positive whole number · finite preview</small>
          </label>
          <div className="run-detail">
            <span>Execution mode</span>
            <strong>
              <FlaskConical size={14} /> Local simulation
            </strong>
          </div>
          <div className="run-detail">
            <span>Imported preset</span>
            <strong className="text-muted">Not connected</strong>
          </div>
          <button
            type="submit"
            className="button button-primary run-button"
            disabled={running || !!error}
          >
            {running ? (
              <>
                <RefreshCw size={16} className="spin" /> Simulating…
              </>
            ) : (
              <>
                <Play size={15} fill="currentColor" /> Validate &amp; preview
              </>
            )}
          </button>
          <div className="tiny-safety">
            <ShieldCheck size={14} /> No hardware access
          </div>
        </aside>
      </form>
      <div className="syntax-note">
        <Terminal size={16} />
        <div>
          <strong>Accepted syntax in this preview</strong>
          <p>
            This preview subset accepts plain-Hertz steps and optional positive
            durations, for example <code>1000=0.1,2000=0.1</code>. Amplitude
            overrides, vendor-specific fields, and imported preset formats are
            intentionally not parsed here.
          </p>
        </div>
      </div>
    </>
  );
}

function SensorPage({
  readings,
  readPulse,
}: {
  readings: number[];
  readPulse: () => void;
}) {
  const latest = readings[readings.length - 1];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-line" /> SENSOR PREVIEW
          </div>
          <h1>Sensor</h1>
          <p className="page-subtitle">
            Explore a sample display with generated values.
          </p>
        </div>
        <span className="mode-chip">
          <span className="status-dot sim-dot" /> Synthetic data
        </span>
      </div>
      <div className="safety-banner sensor-banner">
        <div className="safety-icon">
          <AlertTriangle size={19} />
        </div>
        <div>
          <strong>Not a measurement</strong>
          <p>
            All values on this page are randomly generated for UI preview. They
            are not readings from a sensor and are not medically interpretable.
          </p>
        </div>
      </div>
      <div className="sensor-grid">
        <section className="panel sensor-main">
          <div className="panel-header">
            <div>
              <div className="panel-title">Synthetic pulse samples</div>
              <div className="panel-caption">
                Random demo values · sensor access not configured
              </div>
            </div>
            <span className="sensor-live">
              <span className="status-dot sim-dot" /> DEMO
            </span>
          </div>
          <div className="sensor-value">
            <span>{latest}</span>
            <small>demo units</small>
          </div>
          <div className="sensor-chart">
            <div className="sensor-chart-grid">
              <i />
              <i />
              <i />
            </div>
            <svg
              viewBox="0 0 700 140"
              preserveAspectRatio="none"
              aria-label="Illustrative synthetic values chart"
            >
              <defs>
                <linearGradient id="areaFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor="#62d8b5" stopOpacity=".22" />
                  <stop offset="1" stopColor="#62d8b5" stopOpacity="0" />
                </linearGradient>
              </defs>
              <polygon
                points={`0,140 ${readings.map((v, i) => `${i * (700 / Math.max(readings.length - 1, 1))},${110 - (v - 60) * 3.3}`).join(" ")} 700,140`}
                fill="url(#areaFill)"
              />
              <polyline
                points={readings
                  .map(
                    (v, i) =>
                      `${i * (700 / Math.max(readings.length - 1, 1))},${110 - (v - 60) * 3.3}`,
                  )
                  .join(" ")}
                fill="none"
                stroke="#62d8b5"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>
          <div className="sensor-chart-labels">
            <span>Older samples</span>
            <span>Latest</span>
          </div>
          <div className="sensor-controls">
            <div className="sensor-control-info">
              <div className="sensor-control-icon">
                <Signal size={16} />
              </div>
              <div>
                <strong>Demo sample generator</strong>
                <small>Creates random values in this browser</small>
              </div>
            </div>
            <button className="button button-primary" onClick={readPulse}>
              <RefreshCw size={15} /> Add sample
            </button>
          </div>
        </section>
        <aside className="panel sensor-side">
          <div className="panel-title">About this preview</div>
          <div className="sensor-info-item">
            <span className="sensor-info-icon">
              <FlaskConical size={16} />
            </span>
            <div>
              <strong>Generated locally</strong>
              <p>Physical sensor access is not implemented.</p>
            </div>
          </div>
          <div className="sensor-info-item">
            <span className="sensor-info-icon blue-bg">
              <Battery size={16} />
            </span>
            <div>
              <strong>Not a health metric</strong>
              <p>
                Values have no clinical meaning or validated interpretation.
              </p>
            </div>
          </div>
          <div className="sensor-info-item">
            <span className="sensor-info-icon violet-bg">
              <ShieldAlert size={16} />
            </span>
            <div>
              <strong>Scan unavailable</strong>
              <p>
                The blocking experimental scan command is intentionally not
                exposed.
              </p>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}

function ActivityPage({
  logs,
  clear,
}: {
  logs: LogEntry[];
  clear: () => void;
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            <span className="eyebrow-line" /> LOCAL SESSION
          </div>
          <h1>Activity log</h1>
          <p className="page-subtitle">
            A local record of actions in this browser.
          </p>
        </div>
        <button
          className="button button-secondary"
          onClick={clear}
          disabled={!logs.length}
        >
          <X size={15} /> Clear log
        </button>
      </div>
      <div className="safety-banner compact-banner">
        <div className="safety-icon">
          <ShieldCheck size={19} />
        </div>
        <div>
          <strong>Stored locally in this browser</strong>
          <p>
            This log records UI events only. It does not verify physical device
            activity.
          </p>
        </div>
      </div>
      <div className="panel activity-table">
        <div className="table-toolbar">
          <div className="panel-title">
            Session events <span className="count-badge">{logs.length}</span>
          </div>
          <div className="local-only">
            <span className="status-dot sim-dot" /> LOCAL ONLY
          </div>
        </div>
        {logs.length ? (
          logs.map((log) => <LogRow key={log.id} log={log} large />)
        ) : (
          <EmptyState
            title="Your log is clear"
            detail="Simulation actions will be recorded here."
          />
        )}
      </div>
    </>
  );
}

function LogRow({ log, large = false }: { log: LogEntry; large?: boolean }) {
  return (
    <div className={`log-row ${large ? "log-row-large" : ""}`}>
      <div className={`log-icon log-${log.type}`}>
        {log.type === "success" ? (
          <Check size={15} />
        ) : log.type === "warning" ? (
          <AlertTriangle size={15} />
        ) : (
          <Activity size={15} />
        )}
      </div>
      <div className="log-copy">
        <strong>{log.action}</strong>
        <small>{log.detail}</small>
      </div>
      <span className="log-time">{log.time}</span>
    </div>
  );
}
function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <Search size={19} />
      </div>
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export default App;
