const amountPattern =
  /[−-]?\s*(?:R\$\s*)?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{2}\s*[−-]?/g;
const datePattern =
  /^(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{4}|\d{2}))?(?:\s+(.*))?$/;
const dateStart =
  /(?:^|\s)(?:\d{1,2}[\/.-]\d{1,2}(?:[\/.-](?:\d{4}|\d{2}))?|\d{1,2}\s+(?:JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)(?:\s+\d{4})?)(?=\s|$)/gi;
function namedDate(line) {
  const named = line.match(
    /^(\d{1,2})\s+([A-Za-zÀ-ÿ]{3,9})(?:\s+(\d{4}))?(?:\s+(.*))?$/,
  );
  if (!named) return line;
  const abbreviation = named[2]
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .slice(0, 3)
    .toLowerCase();
  const month =
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
  return month
    ? `${named[1]}/${month}${named[3] ? "/" + named[3] : ""} ${named[4] || ""}`.trim()
    : line;
}
function splitColumns(line) {
  const starts = [...line.matchAll(dateStart)];
  const cuts = [0];
  for (const next of starts) {
    const position = next.index + (next[0].length - next[0].trimStart().length);
    if (!position) continue;
    const following = namedDate(line.slice(position)).match(datePattern);
    if (!following?.[4]) continue;
    // Só separa outra data depois de uma compra que já tem valor; parcela 02/10 não abre nova compra.
    const previous = line.slice(cuts.at(-1), position);
    if (/,\d{2}\s*(?:[DC])?\s*$/i.test(previous)) cuts.push(position);
  }
  return cuts.map((start, i) =>
    line.slice(start, cuts[i + 1] ?? line.length).trim(),
  );
}
export function parseStatementLines(lines, referenceMonth) {
  if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(referenceMonth))
    throw Error("Informe o mês da fatura.");
  const [year, month] = referenceMonth.split("-").map(Number);
  const rows = [],
    rejected = [];
  const consumed = new Set();
  const clean = lines.map((x) => x.replace(/\s+/g, " ").trim());
  for (let index = 0; index < clean.length; index++) {
    if (consumed.has(index)) continue;
    const segments = splitColumns(clean[index]);
    for (let segment = 0; segment < segments.length; segment++) {
      let line = segments[segment];
      const id = segment ? `${index}:${segment}` : index;
      let date = namedDate(line).match(datePattern);
      if (!date) continue;
      let rest = date[4] || "";
      // Junta apenas continuações imediatas sem nova data/cabeçalho; mantém o índice original para reimportação.
      if (segments.length === 1 && ![...rest.matchAll(amountPattern)].length) {
        for (
          let offset = 1;
          offset <= 2 && index + offset < clean.length;
          offset++
        ) {
          const next = clean[index + offset];
          if (
            !next ||
            namedDate(next).match(datePattern) ||
            /^(?:total|saldo|resumo|limite|vencimento|pagamento|lançamentos|data\b|compras\b)/i.test(
              next,
            )
          )
            break;
          line += " " + next;
          rest += " " + next;
          consumed.add(index + offset);
          if ([...rest.matchAll(amountPattern)].length) break;
        }
      }
      const [, day, mon, yyyy] = date;
      const mm = mon.padStart(2, "0"),
        dd = day.padStart(2, "0");
      const y = yyyy
        ? yyyy.length === 2
          ? 2000 + Number(yyyy)
          : Number(yyyy)
        : Number(mm) > month
          ? year - 1
          : year;
      const iso = `${y}-${mm}-${dd}`;
      const d = new Date(`${iso}T12:00:00Z`);
      const validDate =
        Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === iso;
      const reject = (reason, description = "") =>
        rejected.push({
          index: id,
          line,
          reason,
          purchaseDate: validDate ? iso : "",
          description: description.slice(0, 65),
        });
      if (!validDate) {
        reject("Data inválida. Confira a data da compra.");
        continue;
      }
      const found = [...rest.matchAll(amountPattern)];
      let amount = found.length === 1 ? found[0] : null;
      // Moeda estrangeira: só usa o valor convertido quando R$ está explícito e é único.
      if (found.length > 1 && /(?:US\$|USD|EUR|€|GBP)/i.test(rest)) {
        const reais = found.filter((x) => /R\$/.test(x[0]));
        if (reais.length === 1) amount = reais[0];
      }
      if (!amount) {
        reject(
          found.length
            ? "Mais de um valor na linha. Escolha o valor em reais."
            : "Valor não identificado; revise a linha.",
        );
        continue;
      }
      let description = rest.slice(0, amount.index).trim();
      const tail = rest.slice(amount.index + amount[0].length).trim();
      if (
        /[−-]/.test(amount[0]) ||
        /^C$/i.test(tail) ||
        /^(?:total|saldo|pagamento|pagto|limite|resumo|cr[eé]dito|estorno|ajuste)\b/i.test(
          description,
        )
      ) {
        reject(
          "Crédito, pagamento ou resumo: não é uma compra para importar automaticamente.",
          description,
        );
        continue;
      }
      if (tail && !/^(?:D|\d{1,3}\s*\/\s*\d{1,3})$/i.test(tail)) {
        reject(
          "Texto depois do valor: confira a linha antes de incluir.",
          description,
        );
        continue;
      }
      if (!description) {
        reject("Descrição não identificada.");
        continue;
      }
      if (tail && tail.toUpperCase() !== "D")
        description += ` · parcela ${tail}`;
      const cents = Number(amount[0].replace(/[^\d]/g, ""));
      if (!Number.isSafeInteger(cents) || cents <= 0 || cents > 100000000000) {
        reject("Valor inválido.", description);
        continue;
      }
      rows.push({
        index: id,
        purchaseDate: iso,
        description: description.slice(0, 100),
        cents,
      });
    }
  }
  return { rows, rejected, ignored: rejected.length };
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

// Compara valores EXATOS e data original na descrição; nunca usa proximidade de valores ou nomes parecidos.
// Cada registro antigo só pode explicar uma ocorrência nova, preservando duas corridas legítimas iguais.
export function markImportDuplicates(rows, existing) {
  const reserved = new Set(
    rows
      .filter((r) => existing.some((x) => x.id === r.entry.id))
      .map((r) => r.entry.id),
  );
  return rows.map((r) => {
    const exact = existing.some((x) => x.id === r.entry.id);
    const match = exact
      ? null
      : existing.find((x) => !reserved.has(x.id) && sameEntry(x, r.entry));
    if (match) reserved.add(match.id);
    return { ...r, exact, possible: Boolean(match) };
  });
}
