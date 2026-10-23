// Feature pack: search/filter, CSV/JSON export, deterministic domain insights.
// No provider calls are made here; insights are labelled aiGenerated:false.
export function filterRecords(rows, { q = "", status = "", risk = "" } = {}) {
  const needle = String(q || "").trim().toLowerCase();
  return (rows || []).filter((row) => {
    if (status && row.status !== status) return false;
    if (risk && row.risk !== risk) return false;
    if (!needle) return true;
    const hay = [row.reference, row.title, row.owner, row.status, row.risk, JSON.stringify(row.payload ?? {})].join(" ").toLowerCase();
    return hay.includes(needle);
  });
}
function csvCell(value) {
  if (value === null || value === undefined) return "";
  const text = typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
}
export function recordsToCsv(rows) {
  const cols = ["id", "reference", "title", "status", "owner", "risk", "due_date", "amount", "payload"];
  return [cols.join(","), ...(rows || []).map((r) => cols.map((c) => csvCell(c === "due_date" ? String(r.due_date ?? "").slice(0, 10) : r[c])).join(","))].join("\n") + "\n";
}
export const INSIGHT_KINDS = [
  { id: "accessorial-overcharge", title: "Accessorial overcharge scan", focus: "Accessorial overcharge", detail: ({ high, list }) => `${high} high/critical-risk record(s) of ${list.length} flag possible detention, per-diem or chassis overcharges.`, action: "Validate accessorial invoices against tariff and gate evidence." },
  { id: "demurrage-risk", title: "Demurrage risk brief", focus: "Demurrage risk", detail: ({ overdue }) => `${overdue} overdue open record(s) risk further demurrage accrual; prioritise oldest due dates.`, action: "Dispute or pay validated demurrage before further accrual." },
  { id: "invoice-variance", title: "Invoice variance summary", focus: "Invoice variance", detail: ({ totalAmount }) => `Represented invoice amount is ${totalAmount}; compare billed accessorials to contracted rates.`, action: "Reconcile invoice lines to contract rates and file recovery claims." },
];
export function buildInsights(kind, rows, featureTitle = "Capability") {
  if (!INSIGHT_KINDS.some((k) => k.id === kind)) return null;
  const list = rows || [];
  const totalAmount = list.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const high = list.filter((r) => ["High", "Critical"].includes(r.risk)).length;
  const open = list.filter((r) => !["Approved", "Closed"].includes(r.status)).length;
  const closed = list.filter((r) => r.status === "Closed").length;
  const zero = list.filter((r) => Number(r.amount) === 0).length;
  const today = new Date().toISOString().slice(0, 10);
  const overdue = list.filter((r) => r.due_date && String(r.due_date).slice(0, 10) < today && !["Approved", "Closed"].includes(r.status)).length;
  const def = INSIGHT_KINDS.find((k) => k.id === kind);
  return {
    aiGenerated: false, source: "deterministic-fallback",
    label: "Deterministic fallback — no provider call",
    kind, title: `${def.title} — ${featureTitle}`,
    recordsConsidered: list.length,
    metrics: [
      { label: "Records considered", value: list.length },
      { label: "Open records", value: open },
      { label: "Closed records", value: closed },
      { label: "High or critical risk", value: high },
      { label: "Overdue open records", value: overdue },
      { label: "Zero-amount records", value: zero },
      { label: "Total represented amount", value: totalAmount },
    ],
    sections: [
      { title: "Record coverage", detail: `${list.length} record(s) were read from this capability register; ${open} open, ${closed} closed, ${zero} with amount 0.` },
      { title: def.focus, detail: def.detail({ list, high, overdue, totalAmount }) },
      { title: "Next actions", detail: def.action },
    ],
    actions: [def.action, "Validate source evidence before any operational decision.", "Retain this labelled fallback with the record audit history."],
  };
}
export function mountFeaturePack(app, { pool, auth, featureById }) {
  app.get("/api/features/:id/export", auth, async (req, res, next) => {
    try {
      const feature = featureById(req.params.id);
      const format = String(req.query.format || "json").toLowerCase();
      if (!["csv", "json"].includes(format)) return res.status(422).json({ error: "format must be csv or json" });
      const rows = (await pool.query("SELECT * FROM feature_records WHERE feature_id=$1 ORDER BY updated_at DESC,id DESC", [feature.id])).rows;
      const filtered = filterRecords(rows, { q: req.query.q, status: req.query.status, risk: req.query.risk });
      if (format === "csv") { res.setHeader("Content-Type", "text/csv; charset=utf-8"); res.setHeader("Content-Disposition", `attachment; filename="${feature.id}-records.csv"`); return res.send(recordsToCsv(filtered)); }
      return res.json({ feature: feature.id, count: filtered.length, items: filtered });
    } catch (e) { next(e); }
  });
  app.get("/api/features/:id/insights/:kind", auth, async (req, res, next) => {
    try {
      const feature = featureById(req.params.id);
      const rows = (await pool.query("SELECT * FROM feature_records WHERE feature_id=$1 ORDER BY updated_at DESC,id DESC LIMIT 500", [feature.id])).rows;
      const result = buildInsights(req.params.kind, rows, feature.title);
      if (!result) return res.status(404).json({ error: "Unknown insight kind" });
      return res.json({ result });
    } catch (e) { next(e); }
  });
}
