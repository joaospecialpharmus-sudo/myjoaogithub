import { test } from "node:test";
import assert from "node:assert/strict";
import { totals, toCents } from "./finance.js";
test("recebimentos previstos não compõem saldo disponível", () => {
  assert.deepEqual(
    totals([
      { type: "income", status: "done", cents: 10000 },
      { type: "income", status: "pending", cents: 5000 },
      { type: "expense", status: "done", cents: 2000 },
      { type: "expense", status: "pending", cents: 3000 },
    ]),
    {
      income: 10000,
      expenses: 2000,
      pending: 3000,
      expected: 5000,
      balance: 8000,
      projected: 10000,
    },
  );
});
test("converte reais para centavos e recusa valores inválidos", () => {
  assert.equal(toCents("10.29"), 1029);
  assert.throws(() => toCents(-1));
  assert.throws(() => toCents("abc"));
});
