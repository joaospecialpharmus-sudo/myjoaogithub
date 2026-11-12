import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseStatementLines,
  textItemsToLines,
  importId,
  importedName,
  sameEntry,
} from "./statement.js";
test("extrai compras, infere ano na virada e ignora créditos, totais e linhas ambíguas", () => {
  const { rows, ignored } = parseStatementLines(
    [
      "23/12 MERCADO 1.234,56",
      "02/01/2026 FARMACIA 10,29",
      "03/01 LOJA 02/10 45,00",
      "04/01 ESTORNO LOJA -15,00",
      "05/01 Pagamento recebido 500,00",
      "06/01 COMPRA USD 10,00 55,00",
      "31/02 LOJA 15,00",
      "Total da fatura 1.500,00",
    ],
    "2026-01",
  );
  assert.equal(rows.length, 3);
  assert.equal(rows[0].purchaseDate, "2025-12-23");
  assert.equal(rows[0].cents, 123456);
  assert.equal(rows[1].cents, 1029);
  assert.equal(rows[2].description, "LOJA 02/10");
  assert.equal(ignored, 4);
});
test("preserva duas compras iguais e cria identificadores estáveis diferentes por linha", async () => {
  const { rows } = parseStatementLines(
    ["01/01 LOJA 10,00", "01/01 LOJA 10,00"],
    "2026-01",
  );
  assert.equal(rows.length, 2);
  assert.equal(await importId("fake-file", 0), await importId("fake-file", 0));
  assert.notEqual(
    await importId("fake-file", 0),
    await importId("fake-file", 1),
  );
  const a = {
    name: importedName("Itaú", "2026-01-01", "LOJA"),
    cents: 1000,
    date: "2026-02-01",
    person: "Larissa",
    type: "expense",
  };
  assert.equal(sameEntry(a, { ...a }), true);
  assert.equal(sameEntry(a, { ...a, person: "Eu" }), false);
});
test("recompõe linhas do texto por posição sem misturar linhas vizinhas", () => {
  assert.deepEqual(
    textItemsToLines([
      { str: "12,00", transform: [1, 0, 0, 1, 200, 100] },
      { str: "01/01", transform: [1, 0, 0, 1, 0, 100] },
      { str: "LOJA", transform: [1, 0, 0, 1, 50, 100] },
      { str: "Total", transform: [1, 0, 0, 1, 0, 90] },
    ]),
    ["01/01 LOJA 12,00", "Total"],
  );
});
test("reconhece mês em português e valores com R$ sem inventar compras futuras", () => {
  const result = parseStatementLines(
    [
      "5 NOV SUPERMERCADO R$ 42,90",
      "06 NOV 2026 FARMACIA R$ 19,99",
      "07 DEZ LOJA 10,00",
    ],
    "2026-11",
  );
  assert.equal(result.rows.length, 3);
  assert.equal(result.rows[0].purchaseDate, "2026-11-05");
  assert.equal(result.rows[1].cents, 1999);
  assert.equal(result.rows[2].purchaseDate, "2025-12-07");
});
