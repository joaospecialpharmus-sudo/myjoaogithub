import { cardPurchase } from "./cards.js";
export function reconcileInvoice({
  entries,
  existing,
  bank,
  person,
  due,
  expected,
}) {
  const saved = existing
    .map(cardPurchase)
    .filter(
      (x) => x && x.bank === bank && x.person === person && x.date === due,
    );
  const ids = new Set(existing.map((x) => x.id));
  const fresh = entries.filter((x) => !ids.has(x.id));
  const savedCents = saved.reduce((n, x) => n + x.cents, 0);
  const selectedCents = fresh.reduce((n, x) => n + x.cents, 0);
  const total = savedCents + selectedCents;
  const validExpected = Number.isSafeInteger(expected) && expected > 0;
  const difference = validExpected ? total - expected : null;
  return {
    saved,
    savedCents,
    selectedCents,
    total,
    expected: validExpected ? expected : null,
    difference,
    matches: validExpected && difference === 0,
  };
}
export function assertInvoiceMatches(context) {
  const r = reconcileInvoice(context);
  if (!r.matches)
    throw Error(
      "A soma das compras já salvas e das novas compras não confere com o total de lançamentos/compras informado. Atualize os dados e revise as linhas; nenhuma compra foi gravada nesta tentativa.",
    );
  return r;
}
