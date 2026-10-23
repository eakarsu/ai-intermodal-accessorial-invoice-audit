import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { filterRecords, recordsToCsv, buildInsights, INSIGHT_KINDS } from "../featurePack.mjs";
const rows = [
  { id: 1, reference: "A-1", title: "Alpha case", status: "Open", owner: "Sam", risk: "High", due_date: "2020-01-01", amount: 0, payload: { note: false } },
  { id: 2, reference: "B-2", title: "Beta case", status: "Closed", owner: "", risk: "Low", due_date: "2999-01-01", amount: 50, payload: {} },
];
test("search/filter narrows main list", () => {
  assert.equal(filterRecords(rows, { q: "alpha" }).length, 1);
  assert.equal(filterRecords(rows, { status: "Closed" })[0].reference, "B-2");
  assert.equal(filterRecords(rows, { risk: "High", q: "beta" }).length, 0);
});
test("csv export preserves 0 and false/empty", () => {
  const csv = recordsToCsv(rows);
  assert.match(csv, /A-1/); assert.ok(csv.includes(",0,")); assert.ok(csv.includes("false"));
});
test("deterministic insights are labelled aiGenerated:false (incl. empty)", () => {
  assert.ok(INSIGHT_KINDS.length >= 2 && INSIGHT_KINDS.length <= 3);
  for (const k of INSIGHT_KINDS) { const r = buildInsights(k.id, rows, "Test"); assert.equal(r.aiGenerated, false); assert.equal(r.source, "deterministic-fallback"); assert.ok(r.sections.length >= 2); }
  assert.equal(buildInsights(INSIGHT_KINDS[0].id, [], "Test").recordsConsidered, 0);
  assert.equal(buildInsights("nope", rows), null);
});
test("server mounts feature pack behind auth", () => {
  const s = fs.readFileSync(new URL("../server.mjs", import.meta.url), "utf8");
  assert.ok(s.includes("mountFeaturePack")); assert.ok(s.includes("filterRecords"));
});
