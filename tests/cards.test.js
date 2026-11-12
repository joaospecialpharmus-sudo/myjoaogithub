import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeCards, cardPurchase } from "../src/cards.js";
const entry = (
  id,
  bank,
  person,
  cents,
  date = "2026-11-10",
  status = "pending",
) => ({
  id,
  name: `${bank} · 06/10/2026 · DL*Uber`,
  person,
  cents,
  date,
  status,
  type: "expense",
  category: "Transporte",
});
test("resumo inclui importações anteriores, respeita mês de vencimento, banco e responsável e preserva todas as corridas", () => {
  const entries = [
    entry("a", "Itaú", "Larissa", 1195),
    entry("b", "Itaú", "Larissa", 1196),
    {
      ...entry("c", "Itaú", "Larissa", 1195),
      name: "Itaú · 07/10/2026 · DL*Uber",
    },
    entry("d", "Nubank", "Eu", 2000, "2026-11-20", "done"),
    entry("e", "Itaú", "Larissa", 5000, "2026-12-10"),
    { ...entry("f", "Itaú", "Larissa", 800), name: "Conta de luz" },
  ];
  const all = summarizeCards(entries, { month: "2026-11" });
  assert.equal(all.count, 4);
  assert.equal(all.total, 5586);
  assert.equal(all.pending, 3586);
  assert.equal(all.paid, 2000);
  assert.equal(all.groups.length, 2);
  assert.equal(all.categories[0].cents, 5586);
  const filtered = summarizeCards(entries, {
    month: "2026-11",
    bank: "Itaú",
    person: "Larissa",
  });
  assert.equal(filtered.count, 3);
  assert.equal(filtered.total, 3586);
  assert.equal(filtered.groups[0].count, 3);
  assert.equal(cardPurchase(entries[5]), null);
  assert.equal(cardPurchase({ ...entries[0], type: "income" }), null);
});
test("filtro vazio não cria totais ou categorias fictícias", () => {
  const r = summarizeCards([], { month: "2026-11" });
  assert.equal(r.total, 0);
  assert.equal(r.count, 0);
  assert.deepEqual(r.categories, []);
});
