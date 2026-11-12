const amountPattern =
  /[−-]?\s*(?:R\$\s*)?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}\s*[−-]?/g;
export function parseStatementLines(lines, referenceMonth) {
  if (!/^\d{4}-\d{2}$/.test(referenceMonth))
    throw Error("Informe o mês da fatura.");
  const [year, month] = referenceMonth.split("-").map(Number);
  const rows = [];
  let ignored = 0;
  for (const [index, raw] of lines.entries()) {
    let line = raw.replace(/\s+/g, " ").trim();
    const named = line.match(
      /^(\d{1,2})\s+([A-Za-zÀ-ÿ]{3,9})(?:\s+(\d{4}))?\s+(.+)$/,
    );
    if (named) {
      const abbreviation = named[2]
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .slice(0, 3)
        .toLowerCase();
      const m =
        [
          "jan",
          "fev",
          "mar",
          "abr",
          "mai",
          "jun",
          "jul",
          "ago",
          "set",
          "out",
          "nov",
          "dez",
        ].indexOf(abbreviation) + 1;
      if (m)
        line = `${named[1].padStart(2, "0")}/${String(m).padStart(2, "0")}${named[3] ? "/" + named[3] : ""} ${named[4]}`;
    }
    const date = line.match(
      /^(\d{2})[\/-](\d{2})(?:[\/-](\d{4}|\d{2}))?\s+(.+)$/,
    );
    if (!date) continue;
    const [, dd, mm, yyyy, rest] = date;
    const found = [...rest.matchAll(amountPattern)];
    if (found.length !== 1) {
      ignored++;
      continue;
    }
    const amount = found[0];
    const description = rest.slice(0, amount.index).trim();
    const tail = rest.slice(amount.index + amount[0].length).trim();
    if (
      tail ||
      !description ||
      /[−-]/.test(amount[0]) ||
      /^(?:total|saldo|pagamento|pagto|limite|resumo|cr[eé]dito|estorno|ajuste)\b/i.test(
        description,
      )
    ) {
      ignored++;
      continue;
    }
    const y = yyyy
      ? yyyy.length === 2
        ? 2000 + Number(yyyy)
        : Number(yyyy)
      : Number(mm) > month
        ? year - 1
        : year;
    const iso = `${y}-${mm}-${dd}`;
    const d = new Date(`${iso}T12:00:00Z`);
    if (!Number.isFinite(d.getTime()) || d.toISOString().slice(0, 10) !== iso) {
      ignored++;
      continue;
    }
    const cents = Number(amount[0].replace(/[^\d]/g, ""));
    if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 100000000000) {
      ignored++;
      continue;
    }
    rows.push({
      index,
      purchaseDate: iso,
      description: description.slice(0, 100),
      cents,
    });
  }
  return { rows, ignored };
}
export function textItemsToLines(items) {
  const groups = [];
  for (const item of items) {
    if (!item.str?.trim() || !item.transform) continue;
    const x = item.transform[4],
      y = item.transform[5];
    let group = groups.find((g) => Math.abs(g.y - y) < 2.5);
    if (!group) {
      group = { y, items: [] };
      groups.push(group);
    }
    group.items.push({ x, text: item.str });
  }
  return groups
    .sort((a, b) => b.y - a.y)
    .map((g) =>
      g.items
        .sort((a, b) => a.x - b.x)
        .map((i) => i.text)
        .join(" "),
    );
}
export async function importId(digest, index) {
  const data = new TextEncoder().encode(`adois-pdf-v1:${digest}:${index}`);
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const s = [...bytes.slice(0, 16)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
export function importedName(bank, date, description) {
  return `${bank} · ${date.split("-").reverse().join("/")} · ${description.trim()}`.slice(
    0,
    100,
  );
}
export function sameEntry(a, b) {
  return (
    a.name === b.name &&
    a.cents === b.cents &&
    a.date === b.date &&
    a.person === b.person &&
    a.type === b.type
  );
}
