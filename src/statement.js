const paymentSlipPattern =
  /\b(?:uso do banco|nosso n[uú]mero|ficha de compensa[çc][aã]o|autentica[çc][aã]o mec[aâ]nica|linha digit[aá]vel|c[oó]digo de barras|ag[eê]ncia\s*\/\s*c[oó]digo)\b/iu;
export function isPaymentSlipText(text) {
  return paymentSlipPattern.test(text);
}
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
  const sections = new Map();
  const consumed = new Set();
  const clean = lines.map((x) =>
    (typeof x === "string" ? x : x.text).replace(/\s+/g, " ").trim(),
  );
  for (let index = 0; index < clean.length; index++) {
    if (consumed.has(index)) continue;
    const column = lines[index]?.column ?? 0;
    let section = sections.get(column) || "current";
    const heading = clean[index]
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[-–—:]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/^(?:[l•▪◆]\s+)(?=lancamentos)/, "");
    if (heading.length < 180 && !/\d+,\d{2}/.test(heading)) {
      if (
        /^(?:compras parceladas\s+)?(?:proximas? faturas?|faturas? futuras?|parcelas? futuras?)\b/.test(
          heading,
        )
      )
        section = "future";
      else if (
        /^(?:lancamentos (?:compras|produtos|desta fatura)|compras (?:do periodo|desta fatura|e saques)|transacoes desta fatura|despesas (?:do mes|desta fatura))\b/.test(
          heading,
        )
      )
        section = "current";
    }
    if (
      /^(?:pagamento minimo|valor total financiado|simulacao(?: de)?(?: financiamento|credito|parcelamento)?|opcoes de (?:financiamento|parcelamento)|se voce pagar o minimo|parcelamento da fatura)\b/.test(
        heading,
      )
    )
      section = "financing";
    if (/^encargos (?:desta fatura|cobrados nesta fatura)\b/.test(heading))
      section = "current";
    sections.set(column, section);
    const segments = splitColumns(clean[index]);
    for (let segment = 0; segment < segments.length; segment++) {
      let line = segments[segment];
      const sourceIndex = lines[index]?.sourceIndex ?? index;
      const sourceSegment = (lines[index]?.segmentOffset || 0) + segment;
      const id = sourceSegment
        ? `${sourceIndex}:${sourceSegment}`
        : sourceIndex;
      let date = namedDate(line).match(datePattern);
      if (!date) {
        if (
          section === "financing" &&
          /^(?:juros|iof|anuidade|encargos|multa|tarifa)\b/i.test(line)
        ) {
          rejected.push({
            index: id,
            line: "Simulação de crédito; não é lançamento da fatura atual.",
            reason:
              "Encargo de simulação de financiamento/rotativo: não compõe as compras atuais.",
            purchaseDate: "",
            description: "",
            recoverable: false,
          });
          continue;
        }
        if (
          section === "current" &&
          /^(?:juros|iof|anuidade|encargos|multa|tarifa)\b/i.test(line)
        ) {
          const found = [...line.matchAll(amountPattern)];
          if (
            found.length === 1 &&
            !/[−-]/.test(found[0][0]) &&
            !line.slice(found[0].index + found[0][0].length).trim()
          ) {
            const cents = Number(found[0][0].replace(/[^\d]/g, ""));
            if (
              Number.isSafeInteger(cents) &&
              cents > 0 &&
              cents <= 100000000000
            )
              rejected.push({
                index: id,
                line,
                reason:
                  "Possível encargo sem data: confirme se pertence à fatura e informe a data antes de incluir.",
                purchaseDate: "",
                description: line.slice(0, found[0].index).trim().slice(0, 65),
                suggestedCents: cents,
              });
          }
        }
        continue;
      }
      let rest = date[4] || "";
      // Junta apenas continuações imediatas sem nova data/cabeçalho; mantém o índice original para reimportação.
      if (segments.length === 1 && ![...rest.matchAll(amountPattern)].length) {
        for (
          let offset = 1;
          offset <= 2 && index + offset < clean.length;
          offset++
        ) {
          if (
            (lines[index]?.column ?? 0) !==
              (lines[index + offset]?.column ?? 0) ||
            lines[index]?.page !== lines[index + offset]?.page
          )
            break;
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
      const reject = (reason, description = "", recoverable = true) =>
        rejected.push({
          index: id,
          line: recoverable ? line : "Dados do boleto omitidos da revisão.",
          reason,
          recoverable,
          purchaseDate: validDate ? iso : "",
          description: description.slice(0, 65),
        });
      if (!validDate) {
        reject("Data inválida. Confira a data da compra.");
        continue;
      }
      if (isPaymentSlipText(line)) {
        reject(
          "Campo do boleto ou valor a pagar: não é uma compra e não entra na soma dos gastos.",
          "",
          false,
        );
        continue;
      }
      if (section === "financing") {
        reject(
          "Linha da seção de simulação de financiamento. Confira a origem; não é importada automaticamente.",
        );
        continue;
      }
      if (section === "future") {
        reject(
          "Parcela de próxima fatura: fora da fatura atual. Confira a seção antes de incluir como compra.",
        );
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
        /^(?:total|subtotal|sub-total|saldo|pagamento|pagto|limite|resumo|valor a pagar|vencimento|cr[eé]dito|estorno|ajuste)\b/i.test(
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
export function textItemsToLines(items, options) {
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
  const ordered = groups.sort((a, b) => b.y - a.y);
  const text = (items) =>
    items
      .sort((a, b) => a.x - b.x)
      .map((i) => i.text)
      .join(" ");
  if (!options) return ordered.map((g) => text(g.items));
  const boundary = options.boundary;
  const dated = items.filter(
    (i) => i.str && /^\d{1,2}[\/-]\d{1,2}(?:\b|\/)/.test(i.str.trim()),
  );
  // Só divide a página quando existem pelo menos duas datas de lançamentos em cada metade.
  // Uma tabela de largura inteira (descrição à esquerda, valor à direita) continua unida.
  const hasDatesBothSides =
    dated.filter((i) => i.transform[4] < boundary).length >= 2 &&
    dated.filter((i) => i.transform[4] >= boundary).length >= 2;
  const sideLines = (right) =>
    ordered.map((g) => text(g.items.filter((i) => i.x >= boundary === right)));
  // Confirma que as duas metades têm lançamentos, não apenas datas do boleto ou valores de uma tabela larga.
  const twoColumns =
    hasDatesBothSides &&
    parseStatementLines(sideLines(false), "2000-12").rows.length >= 2 &&
    parseStatementLines(sideLines(true), "2000-12").rows.length >= 2;
  const rows = [];
  ordered.forEach((g, index) => {
    const sourceIndex = (options.offset || 0) + index;
    const parts = twoColumns
      ? [
          g.items.filter((i) => i.x < boundary),
          g.items.filter((i) => i.x >= boundary),
        ]
      : [g.items];
    let segmentOffset = 0;
    parts.forEach((part, column) => {
      if (!part.length) return;
      const line = text(part);
      rows.push({
        text: line,
        sourceIndex,
        segmentOffset,
        column,
        page: options.page,
      });
      segmentOffset += splitColumns(line).length;
    });
  });
  rows.sort((a, b) => a.column - b.column || a.sourceIndex - b.sourceIndex);
  return { rows, sourceLineCount: ordered.length };
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
export function findGrossStatementTotal(lines) {
  const matches = [];
  for (const raw of lines) {
    const text = (typeof raw === "string" ? raw : raw.text)
      .replace(/\s+/g, " ")
      .trim();
    const normalized = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (!/^total dos lancamentos atuais\b/i.test(normalized)) continue;
    const amounts = [...text.matchAll(amountPattern)];
    if (amounts.length !== 1 || /[−-]/.test(amounts[0][0])) continue;
    const cents = Number(amounts[0][0].replace(/[^\d]/g, ""));
    if (Number.isSafeInteger(cents) && cents > 0 && cents <= 100000000000)
      matches.push(cents);
  }
  // Só preenche quando há uma referência global inequívoca. Não usa limites nem ofertas de financiamento.
  return matches.length === 1 ? matches[0] : null;
}
