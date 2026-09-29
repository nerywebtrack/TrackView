"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ProjectReport } from "@/core/application/dto/ProjectReport";
import {
  DEFAULT_EXPORT_CONFIG,
  FIELD_DEFS,
  UNASSIGNED_ID,
  buildDailySheet,
  buildHistorySheet,
  buildPeriodsSheet,
  buildSummarySheet,
  buildTaskSheet,
  computeMetrics,
  dayKey,
  filterTasks,
  formatDuration,
  peopleOf,
  type CellValue,
  type ExportConfig,
  type FieldKey,
  type RangeMode,
  type ReportFilters,
  type Sheet,
} from "@/core/application/reports/buildReport";
import { ACTION_LABEL, describeActivity } from "@/presentation/lib/activityText";
import CompletionsChart, { type ChartBucket } from "./CompletionsChart";
import { downloadWorkbook } from "./exportExcel";

type Preset = "7d" | "30d" | "90d" | "month" | "all" | "custom";

const CONFIG_KEY = "trackview-report-config-v1";
const PRESETS: Array<{ id: Preset; label: string }> = [
  { id: "7d", label: "7 días" },
  { id: "30d", label: "30 días" },
  { id: "90d", label: "90 días" },
  { id: "month", label: "Este mes" },
  { id: "all", label: "Todo" },
  { id: "custom", label: "Personalizado" },
];
const MODE_LABEL: Record<RangeMode, string> = { activity: "Con actividad en el periodo", created: "Creadas en el periodo", completed: "Terminadas en el periodo" };
const GROUPS = [...new Set(FIELD_DEFS.map((field) => field.group))];

export default function ReportsScreen({ projectId, connected, onBack }: { projectId: string; connected: boolean; onBack: () => void }) {
  const [report, setReport] = useState<ProjectReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(connected);
  const [preset, setPreset] = useState<Preset>("30d");
  const [custom, setCustom] = useState(() => ({ from: shiftDay(today(), -29), to: today() }));
  const [mode, setMode] = useState<RangeMode>("activity");
  const [personIds, setPersonIds] = useState<string[]>([]);
  const [statusIds, setStatusIds] = useState<string[]>([]);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [config, setConfig] = useState<ExportConfig>(loadConfig);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    if (!connected) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/report`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "No se pudo generar el reporte");
      setReport(payload as ProjectReport);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "No se pudo generar el reporte");
    } finally {
      setLoading(false);
    }
  }, [connected, projectId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch of remote data
    load();
  }, [load]);

  useEffect(() => {
    try {
      window.localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    } catch {
      // Private mode or blocked storage: the config just won't be remembered.
    }
  }, [config]);

  const range = useMemo(() => rangeFor(preset, custom, report), [preset, custom, report]);
  const filters: ReportFilters = useMemo(() => ({ ...range, mode, personIds, statusIds, includeDeleted }), [range, mode, personIds, statusIds, includeDeleted]);
  const tasks = useMemo(() => (report ? filterTasks(report, filters) : []), [report, filters]);
  const metrics = useMemo(() => (report ? computeMetrics(report, tasks, filters) : null), [report, tasks, filters]);
  const taskSheet = useMemo(() => (report ? buildTaskSheet(report, tasks, config, filters) : null), [report, tasks, config, filters]);
  const people = useMemo(() => (report ? [...peopleOf(report), { id: UNASSIGNED_ID, name: "Sin asignar" }] : []), [report]);
  const buckets = useMemo(() => (metrics ? chartBuckets(range, metrics.completionsByDay) : []), [metrics, range]);

  async function exportExcel() {
    if (!report || !metrics || !taskSheet) return;
    setExporting(true);
    try {
      const sheets: Sheet[] = [taskSheet];
      if (config.sheets.summary) sheets.push(buildSummarySheet(metrics, config));
      if (config.sheets.daily) sheets.push(buildDailySheet(report, tasks, filters, config));
      if (config.sheets.periods) sheets.push(buildPeriodsSheet(report, tasks, config));
      if (config.sheets.history) sheets.push(buildHistorySheet(report, tasks, filters, describeActivity, (action) => ACTION_LABEL[action]));
      const personNames = personIds.map((id) => people.find((person) => person.id === id)?.name ?? id);
      const statusNames = statusIds.map((id) => report.columns.find((column) => column.id === id)?.name ?? id);
      await downloadWorkbook(sheets, [
        ["Proyecto", report.project.name],
        ["Generado", new Intl.DateTimeFormat("es-GT", { dateStyle: "full", timeStyle: "short", timeZone: "America/Guatemala" }).format(new Date(report.generatedAt))],
        ["Periodo", range.from || range.to ? `${range.from ?? "inicio"} a ${range.to ?? "hoy"}` : "Todo el historial"],
        ["Tareas incluidas", MODE_LABEL[mode]],
        ["Personas", personNames.join(", ") || "Todas"],
        ["Estados", statusNames.join(", ") || "Todos"],
        ["Incluye tareas eliminadas", includeDeleted ? "Sí" : "No"],
        ["Filas de la hoja Tareas", config.rowMode === "person" ? "Una fila por persona asignada" : "Una fila por tarea"],
        ["Unidad de tiempo", config.timeUnit === "hours" ? "Horas" : "Días"],
        ["Zona horaria", "America/Guatemala"],
        ["Nota", "Los tiempos son tiempo transcurrido entre cambios de estado, no horas trabajadas. El historial existe desde que se activó el registro de actividad."],
      ], `reporte-${slugify(report.project.name)}-${today()}.xlsx`);
    } finally {
      setExporting(false);
    }
  }

  function toggleField(key: FieldKey) {
    setConfig((current) => ({
      ...current,
      fields: current.fields.includes(key)
        ? current.fields.filter((item) => item !== key)
        : FIELD_DEFS.map((field) => field.key).filter((item) => item === key || current.fields.includes(item)),
    }));
  }

  if (!connected) {
    return <Shell onBack={onBack} onRefresh={undefined}><Card><p className="text-sm text-slate-600">Los reportes usan el historial de actividad guardado en Supabase. Inicia sesión con Supabase activo para verlos.</p></Card></Shell>;
  }

  return (
    <Shell onBack={onBack} onRefresh={load} refreshing={loading}>
      {error && <Card><p className="text-sm text-red-700">{error}</p></Card>}
      {!report && loading && <Card><p className="text-sm text-slate-500">Generando reporte…</p></Card>}

      {report && metrics && taskSheet && (
        <>
          <Card>
            <div className="flex flex-wrap items-center gap-2">
              {PRESETS.map((item) => (
                <button key={item.id} type="button" onClick={() => setPreset(item.id)} aria-pressed={preset === item.id} className={`h-9 rounded-full px-4 text-sm font-medium transition ${preset === item.id ? "bg-indigo-600 text-white" : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}>{item.label}</button>
              ))}
              {preset === "custom" && (
                <span className="flex items-center gap-2">
                  <input type="date" value={custom.from} max={custom.to} onChange={(event) => setCustom((value) => ({ ...value, from: event.target.value }))} aria-label="Desde" className="h-9 rounded-lg border border-slate-200 px-2 text-sm" />
                  <span className="text-slate-400">–</span>
                  <input type="date" value={custom.to} min={custom.from} onChange={(event) => setCustom((value) => ({ ...value, to: event.target.value }))} aria-label="Hasta" className="h-9 rounded-lg border border-slate-200 px-2 text-sm" />
                </span>
              )}
              <select value={mode} onChange={(event) => setMode(event.target.value as RangeMode)} aria-label="Qué tareas incluir" className="ml-auto h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700">
                {(Object.keys(MODE_LABEL) as RangeMode[]).map((key) => <option key={key} value={key}>{MODE_LABEL[key]}</option>)}
              </select>
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-[1fr_1fr_auto]">
              <ChipGroup label="Personas" options={people.map((person) => ({ id: person.id, label: person.name }))} selected={personIds} onChange={setPersonIds} />
              <ChipGroup label="Estados" options={report.columns.map((column) => ({ id: column.id, label: column.name }))} selected={statusIds} onChange={setStatusIds} />
              <label className="flex items-center gap-2 self-end text-sm text-slate-600">
                <input type="checkbox" checked={includeDeleted} onChange={(event) => setIncludeDeleted(event.target.checked)} className="accent-indigo-600" />
                Incluir tareas eliminadas
              </label>
            </div>
          </Card>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <Stat label="Tareas en el reporte" value={String(tasks.length)} />
            <Stat label="Creadas en el periodo" value={String(metrics.created)} />
            <Stat label="Terminadas en el periodo" value={String(metrics.completed)} />
            <Stat label="Tiempo promedio de trabajo" value={formatDuration(metrics.avgCycle)} hint="De “en curso” a “terminado”" />
            <Stat label="Tiempo promedio total" value={formatDuration(metrics.avgLead)} hint="De creada a terminada" />
          </div>

          <Card><CompletionsChart buckets={buckets} title={buckets.length && buckets[0].key.length > 10 ? "Tareas terminadas por semana" : "Tareas terminadas por día"} /></Card>

          <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
            <Card title="Por persona" description="Tareas del reporte asignadas a cada persona.">
              <DataTable
                headers={["Persona", "Asignadas", "Terminadas", "En curso", "Prom. trabajo", "Prom. total"]}
                numeric={[false, true, true, true, true, true]}
                rows={metrics.perPerson.map((row) => [row.person.name, row.assigned, row.completed, row.inProgress, formatDuration(row.avgCycle), formatDuration(row.avgLead)])}
                empty="No hay tareas asignadas en este periodo."
              />
            </Card>
            <Card title="Tiempo promedio en cada estado" description="Cuánto tiempo pasa una tarea en cada estado, en promedio.">
              <DataTable
                headers={["Estado", "Tareas", "Promedio"]}
                numeric={[false, true, true]}
                rows={metrics.stateTotals.map((state) => [state.name, state.tasks, formatDuration(state.avgSeconds)])}
                empty="Todavía no hay cambios de estado registrados."
              />
            </Card>
          </div>

          <Card title="Exportar a Excel" description="Elige qué quieres ver en el archivo. Tu selección se recuerda en este navegador.">
            <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
              <div className="grid gap-5 sm:grid-cols-2">
                {GROUPS.map((group) => (
                  <fieldset key={group}>
                    <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{group}</legend>
                    <div className="space-y-1.5">
                      {FIELD_DEFS.filter((field) => field.group === group).map((field) => (
                        <Check key={field.key} checked={config.fields.includes(field.key)} onChange={() => toggleField(field.key)} label={field.label} />
                      ))}
                      {group === "Tiempos" && <Check checked={config.stateTimes} onChange={() => setConfig((current) => ({ ...current, stateTimes: !current.stateTimes }))} label="Tiempo en cada estado (una columna por estado)" />}
                    </div>
                  </fieldset>
                ))}
              </div>

              <div className="space-y-5">
                <fieldset>
                  <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Filas de la hoja “Tareas”</legend>
                  <Radio name="rowMode" checked={config.rowMode === "person"} onChange={() => setConfig((current) => ({ ...current, rowMode: "person" }))} label="Una fila por persona asignada" hint="Seguimiento por usuario: una tarea con 2 personas aparece 2 veces." />
                  <Radio name="rowMode" checked={config.rowMode === "task"} onChange={() => setConfig((current) => ({ ...current, rowMode: "task" }))} label="Una fila por tarea" hint="Las personas se listan juntas en una celda." />
                </fieldset>
                <fieldset>
                  <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Unidad de tiempo</legend>
                  <div className="flex gap-4">
                    <Radio name="unit" checked={config.timeUnit === "hours"} onChange={() => setConfig((current) => ({ ...current, timeUnit: "hours" }))} label="Horas" />
                    <Radio name="unit" checked={config.timeUnit === "days"} onChange={() => setConfig((current) => ({ ...current, timeUnit: "days" }))} label="Días" />
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Hojas adicionales</legend>
                  <div className="space-y-1.5">
                    <Check checked={config.sheets.summary} onChange={() => setConfig((current) => ({ ...current, sheets: { ...current.sheets, summary: !current.sheets.summary } }))} label="Resumen por persona" />
                    <Check checked={config.sheets.daily} onChange={() => setConfig((current) => ({ ...current, sheets: { ...current.sheets, daily: !current.sheets.daily } }))} label="Resumen diario (tareas terminadas por día y persona)" />
                    <Check checked={config.sheets.periods} onChange={() => setConfig((current) => ({ ...current, sheets: { ...current.sheets, periods: !current.sheets.periods } }))} label="Tiempo por estado (cada entrada y salida)" />
                    <Check checked={config.sheets.history} onChange={() => setConfig((current) => ({ ...current, sheets: { ...current.sheets, history: !current.sheets.history } }))} label="Historial completo de cambios" />
                  </div>
                </fieldset>
              </div>
            </div>

            <div className="mt-6">
              <p className="mb-2 text-sm font-medium text-slate-700">Vista previa de la hoja “Tareas” <span className="font-normal text-slate-400">· {taskSheet.rows.length} {taskSheet.rows.length === 1 ? "fila" : "filas"}</span></p>
              {taskSheet.headers.length ? (
                <div className="max-h-80 overflow-auto rounded-xl border border-slate-100">
                  <table className="min-w-full text-sm">
                    <thead className="sticky top-0 bg-slate-50"><tr>{taskSheet.headers.map((header) => <th key={header} className="whitespace-nowrap px-3 py-2 text-left font-medium text-slate-500">{header}</th>)}</tr></thead>
                    <tbody>
                      {taskSheet.rows.slice(0, 10).map((row, index) => (
                        <tr key={index} className="border-t border-slate-100">{row.map((value, cell) => <td key={cell} className="max-w-[260px] truncate whitespace-nowrap px-3 py-1.5 text-slate-700">{formatCell(value, taskSheet.kinds[cell])}</td>)}</tr>
                      ))}
                      {taskSheet.rows.length === 0 && <tr><td colSpan={taskSheet.headers.length} className="px-3 py-4 text-slate-400">No hay tareas con estos filtros.</td></tr>}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-500">Selecciona al menos un dato para exportar.</p>
              )}
            </div>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <button type="button" onClick={() => setConfig({ ...DEFAULT_EXPORT_CONFIG, fields: FIELD_DEFS.map((field) => field.key) })} className="h-10 rounded-xl px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100">Seleccionar todo</button>
              <button type="button" onClick={() => setConfig(DEFAULT_EXPORT_CONFIG)} className="h-10 rounded-xl px-4 text-sm font-semibold text-slate-600 hover:bg-slate-100">Restablecer</button>
              <button type="button" onClick={exportExcel} disabled={exporting || !taskSheet.headers.length} className="h-10 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-40">{exporting ? "Generando…" : "Exportar a Excel"}</button>
            </div>
          </Card>
        </>
      )}
    </Shell>
  );
}

function Shell({ children, onBack, onRefresh, refreshing = false }: { children: React.ReactNode; onBack: () => void; onRefresh?: () => void; refreshing?: boolean }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <nav className="flex items-center gap-2 text-sm">
            <button type="button" onClick={onBack} className="rounded-lg px-2 py-1 text-slate-500 hover:bg-white/60">Projects</button>
            <span className="text-slate-300">/</span>
            <span className="rounded-lg bg-slate-100 px-2 py-1 font-medium text-slate-700">Reports</span>
          </nav>
          <h1 className="mt-3 text-3xl font-bold tracking-tight text-slate-900">Reportes</h1>
          <p className="mt-1 text-sm text-slate-500">Seguimiento de tareas por persona, tiempos por estado y exportación a Excel.</p>
        </div>
        <div className="flex gap-2">
          {onRefresh && <button type="button" onClick={onRefresh} disabled={refreshing} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">{refreshing ? "Actualizando…" : "Actualizar"}</button>}
          <button type="button" onClick={onBack} className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50">Volver al tablero</button>
        </div>
      </div>
      {children}
    </div>
  );
}

function Card({ title, description, children }: { title?: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-white p-6 shadow-sm">
      {title && <h2 className="text-lg font-bold text-slate-900">{title}</h2>}
      {description && <p className="mb-4 mt-1 text-sm text-slate-500">{description}</p>}
      {children}
    </section>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-3xl bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

function ChipGroup({ label, options, selected, onChange }: { label: string; options: Array<{ id: string; label: string }>; selected: string[]; onChange: (ids: string[]) => void }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{label} <span className="font-normal normal-case tracking-normal">· {selected.length ? `${selected.length} seleccionadas` : "todas"}</span></p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => {
          const active = selected.includes(option.id);
          return (
            <button key={option.id} type="button" aria-pressed={active} onClick={() => onChange(active ? selected.filter((id) => id !== option.id) : [...selected, option.id])} className={`h-8 rounded-full px-3 text-sm transition ${active ? "bg-indigo-50 font-medium text-indigo-700 ring-1 ring-indigo-200" : "bg-slate-50 text-slate-600 hover:bg-slate-100"}`}>{option.label}</button>
          );
        })}
      </div>
    </div>
  );
}

function DataTable({ headers, rows, numeric, empty }: { headers: string[]; rows: Array<Array<string | number>>; numeric: boolean[]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-slate-400">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr>{headers.map((header, index) => <th key={header} className={`border-b border-slate-100 px-2 py-2 font-medium text-slate-500 ${numeric[index] ? "text-right" : "text-left"}`}>{header}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={index} className="border-b border-slate-50 last:border-0">{row.map((cell, column) => <td key={column} className={`px-2 py-2 ${numeric[column] ? "text-right tabular-nums text-slate-900" : "text-slate-700"}`}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function Check({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2 text-sm text-slate-700">
      <input type="checkbox" checked={checked} onChange={onChange} className="mt-0.5 accent-indigo-600" />
      {label}
    </label>
  );
}

function Radio({ name, checked, onChange, label, hint }: { name: string; checked: boolean; onChange: () => void; label: string; hint?: string }) {
  return (
    <label className="mb-2 flex cursor-pointer items-start gap-2 text-sm text-slate-700">
      <input type="radio" name={name} checked={checked} onChange={onChange} className="mt-0.5 accent-indigo-600" />
      <span>{label}{hint && <span className="block text-xs text-slate-400">{hint}</span>}</span>
    </label>
  );
}

function loadConfig(): ExportConfig {
  try {
    const saved = JSON.parse(window.localStorage.getItem(CONFIG_KEY) ?? "null") as Partial<ExportConfig> | null;
    if (!saved) return DEFAULT_EXPORT_CONFIG;
    const known = new Set<string>(FIELD_DEFS.map((field) => field.key));
    return { ...DEFAULT_EXPORT_CONFIG, ...saved, fields: (saved.fields ?? DEFAULT_EXPORT_CONFIG.fields).filter((key) => known.has(key)), sheets: { ...DEFAULT_EXPORT_CONFIG.sheets, ...saved.sheets } };
  } catch {
    return DEFAULT_EXPORT_CONFIG;
  }
}

function today() {
  return dayKey(new Date().toISOString());
}

function shiftDay(day: string, delta: number) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + delta)).toISOString().slice(0, 10);
}

function rangeFor(preset: Preset, custom: { from: string; to: string }, report: ProjectReport | null): { from: string | null; to: string | null } {
  const now = today();
  if (preset === "7d") return { from: shiftDay(now, -6), to: now };
  if (preset === "30d") return { from: shiftDay(now, -29), to: now };
  if (preset === "90d") return { from: shiftDay(now, -89), to: now };
  if (preset === "month") return { from: `${now.slice(0, 8)}01`, to: now };
  if (preset === "custom") return { from: custom.from || null, to: custom.to || null };
  const first = report?.events[0]?.createdAt ?? report?.tasks.map((task) => task.createdAt).filter(Boolean).sort()[0];
  return { from: first ? dayKey(first) : null, to: null };
}

function chartBuckets(range: { from: string | null; to: string | null }, byDay: Map<string, number>): ChartBucket[] {
  const to = range.to ?? today();
  const from = range.from ?? shiftDay(to, -29);
  const days: string[] = [];
  for (let day = from; day <= to && days.length < 400; day = shiftDay(day, 1)) days.push(day);
  const short = new Intl.DateTimeFormat("es-GT", { day: "numeric", month: "short", timeZone: "UTC" });
  const long = new Intl.DateTimeFormat("es-GT", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const asDate = (day: string) => new Date(`${day}T00:00:00Z`);

  if (days.length <= 62) {
    return days.map((day) => ({ key: day, label: short.format(asDate(day)), longLabel: long.format(asDate(day)), value: byDay.get(day) ?? 0 }));
  }
  const weeks = new Map<string, ChartBucket>();
  days.forEach((day) => {
    const date = asDate(day);
    const monday = shiftDay(day, -((date.getUTCDay() + 6) % 7));
    const bucket = weeks.get(monday) ?? { key: `${monday}-week`, label: short.format(asDate(monday)), longLabel: `Semana del ${long.format(asDate(monday))}`, value: 0 };
    bucket.value += byDay.get(day) ?? 0;
    weeks.set(monday, bucket);
  });
  return [...weeks.values()];
}

function formatCell(value: CellValue, kind: Sheet["kinds"][number]) {
  if (value === null || value === "") return "—";
  if (value instanceof Date) {
    const options: Intl.DateTimeFormatOptions = kind === "date" ? { dateStyle: "medium", timeZone: "UTC" } : { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" };
    return new Intl.DateTimeFormat("es-GT", options).format(value);
  }
  return String(value);
}

function slugify(value: string) {
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "proyecto";
}
