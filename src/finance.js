export function totals(items) {
  const sum = (type, status) =>
    items
      .filter((x) => x.type === type && (!status || x.status === status))
      .reduce((n, x) => n + x.cents, 0);
  return {
    income: sum("income", "done"),
    expenses: sum("expense", "done"),
    pending: sum("expense", "pending"),
    expected: sum("income", "pending"),
    balance: sum("income", "done") - sum("expense", "done"),
    projected: sum("income") - sum("expense"),
  };
}
export function toCents(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0)
    throw new Error("Informe um valor maior que zero.");
  return Math.round(number * 100);
}
