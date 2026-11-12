// Compatível com as compras já salvas; nenhum novo campo ou migração é necessário.
export function cardPurchase(entry) {
  if (entry.type !== "expense") return null;
  const match = entry.name.match(
    /^(C6 Bank|Itaú|Nubank|Caixa cartões) · (\d{2})\/(\d{2})\/(\d{4}) · (.+)$/,
  );
  if (!match) return null;
  return {
    ...entry,
    bank: match[1],
    purchaseDate: `${match[4]}-${match[3]}-${match[2]}`,
    merchant: match[5],
  };
}
export function summarizeCards(
  entries,
  { month, bank = "", person = "" } = {},
) {
  const purchases = entries
    .map(cardPurchase)
    .filter(Boolean)
    .filter(
      (x) =>
        (!month || x.date.startsWith(month)) &&
        (!bank || x.bank === bank) &&
        (!person || x.person === person),
    );
  const total = purchases.reduce((sum, x) => sum + x.cents, 0);
  const paid = purchases
    .filter((x) => x.status === "done")
    .reduce((sum, x) => sum + x.cents, 0);
  const groups = new Map(),
    categories = new Map();
  for (const p of purchases) {
    const key = JSON.stringify([p.bank, p.person]);
    if (!groups.has(key))
      groups.set(key, {
        bank: p.bank,
        person: p.person,
        total: 0,
        paid: 0,
        pending: 0,
        count: 0,
        purchases: [],
      });
    const g = groups.get(key);
    g.total += p.cents;
    g.count++;
    g[p.status === "done" ? "paid" : "pending"] += p.cents;
    g.purchases.push(p);
    categories.set(p.category, (categories.get(p.category) || 0) + p.cents);
  }
  return {
    purchases,
    total,
    paid,
    pending: total - paid,
    count: purchases.length,
    groups: [...groups.values()].sort(
      (a, b) => b.total - a.total || a.bank.localeCompare(b.bank),
    ),
    categories: [...categories]
      .map(([name, cents]) => ({ name, cents }))
      .sort((a, b) => b.cents - a.cents || a.name.localeCompare(b.name)),
  };
}
