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
test("recupera compras em colunas, linhas quebradas, centavos e parcela após o valor", () => {
  const p = parseStatementLines(
    [
      "06/10 DL*Uber 11,95 07/10 DL*Uber 11,96",
      "08/10 DL*Uber",
      "12,10",
      "09/10 LOJA 32,00 02/05",
      "10/10 COMPRA USD 5,00 R$ 27,50",
      "11/10 LOJA 25,00 D",
    ],
    "2026-11",
  );
  assert.equal(p.rows.length, 6);
  assert.equal(p.rejected.length, 0);
  assert.deepEqual(
    p.rows.map((x) => x.cents),
    [1195, 1196, 1210, 3200, 2750, 2500],
  );
  assert.equal(p.rows[0].index, 0);
  assert.equal(p.rows[1].index, "0:1");
  assert.equal(p.rows[2].index, 1);
  assert.equal(p.rows[3].index, 3);
  assert.equal(p.rows[3].description, "LOJA · parcela 02/05");
});
test("não inventa valores em linhas ambíguas e explica cada rejeição para revisão local", () => {
  const p = parseStatementLines(
    [
      "06/10 LOJA 10,00 12,00",
      "07/10 ESTORNO 15,00",
      "08/10 LOJA",
      "09/10 OUTRA 3,00",
    ],
    "2026-11",
  );
  assert.equal(p.rows.length, 1);
  assert.equal(p.rejected.length, 3);
  assert.equal(p.rejected[0].line, "06/10 LOJA 10,00 12,00");
  assert.match(p.rejected[0].reason, /Mais de um/);
  assert.equal(p.rejected[0].purchaseDate, "2026-10-06");
});
test("Uber em dias distintos e centavos diferentes permanece como compras distintas; duplicatas são por ocorrência exata", async () => {
  const { markImportDuplicates } = await import("./statement.js");
  const entry = (id, date, cents = 1195) => ({
    id,
    name: importedName("Itaú", date, "DL*Uber"),
    date: "2026-11-10",
    cents,
    person: "Larissa",
    type: "expense",
  });
  const existing = [entry("old", "2026-10-06")];
  const rows = [
    { entry: entry("new1", "2026-10-06") },
    { entry: entry("new2", "2026-10-06") },
    { entry: entry("new3", "2026-10-07") },
    { entry: entry("new4", "2026-10-06", 1196) },
  ];
  const result = markImportDuplicates(rows, existing);
  assert.deepEqual(
    result.map((x) => x.possible),
    [true, false, false, false],
  );
  const reserved = markImportDuplicates(
    [{ entry: entry("new", "2026-10-06") }, { entry: existing[0] }],
    existing,
  );
  assert.equal(reserved[0].possible, false);
  assert.equal(reserved[1].exact, true);
});
