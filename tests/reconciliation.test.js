import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reconcileInvoice,
  assertInvoiceMatches,
} from "../src/reconciliation.js";
const context = {
  bank: "Nubank",
  person: "Larissa",
  due: "2026-01-20",
  expected: 15000,
};
const row = (id, cents, extra = {}) => ({
  id,
  name: "Nubank · 05/01/2026 · MERCADO",
  cents,
  person: "Larissa",
  date: "2026-01-20",
  type: "expense",
  ...extra,
});
test("bloqueia soma acima e abaixo do valor oficial sem ajustar valores nem remover compras", () => {
  const entries = [row("a", 10000), row("b", 12500)];
  const r = reconcileInvoice({ ...context, entries, existing: [] });
  assert.equal(r.difference, 7500);
  assert.equal(r.matches, false);
  assert.throws(() =>
    assertInvoiceMatches({ ...context, entries, existing: [] }),
  );
  assert.equal(entries[1].cents, 12500);
  assert.throws(() =>
    assertInvoiceMatches({
      ...context,
      entries: [row("a", 10000)],
      existing: [],
    }),
  );
});
test("conferência de importação complementar inclui o que já foi salvo sem somar o mesmo ID duas vezes", () => {
  const existing = [
    row("a", 10000),
    row("other", 9000, { date: "2026-02-20" }),
    row("other-person", 9000, { person: "Eu" }),
  ];
  const entries = [row("a", 10000), row("b", 5000)];
  const r = assertInvoiceMatches({ ...context, entries, existing });
  assert.equal(r.total, 15000);
  assert.equal(r.savedCents, 10000);
  assert.equal(r.selectedCents, 5000);
  assert.equal(r.saved.length, 1);
});
test("não permite afirmar conferência sem total oficial positivo e inteiro", () => {
  for (const expected of [null, 0, -1, NaN, 15000.5]) {
    assert.throws(() =>
      assertInvoiceMatches({
        ...context,
        entries: [row("a", 15000)],
        existing: [],
        expected,
      }),
    );
  }
});
