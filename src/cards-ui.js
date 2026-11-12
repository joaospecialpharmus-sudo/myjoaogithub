import { summarizeCards } from "./cards.js";
import { esc } from "./security.js";
const money = (n) =>
  (n / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (s) => s.split("-").reverse().join("/");
export function cardsView(entries, filters) {
  const summary = summarizeCards(entries, filters);
  return `<section class="panel card-filters"><label>Banco<select id="card-bank">${[
    ["", "Todos os bancos"],
    ["C6 Bank", "C6 Bank"],
    ["Itaú", "Itaú"],
    ["Nubank", "Nubank"],
    ["Caixa cartões", "Caixa cartões"],
  ]
    .map(
      ([v, n]) =>
        `<option value="${v}" ${v === filters.bank ? "selected" : ""}>${n}</option>`,
    )
    .join("")}</select></label><label>Responsável<select id="card-person">${[
    ["", "Todos"],
    ["Eu", "Eu"],
    ["Larissa", "Larissa"],
    ["Compartilhado", "Compartilhado"],
  ]
    .map(
      ([v, n]) =>
        `<option value="${v}" ${v === filters.person ? "selected" : ""}>${n}</option>`,
    )
    .join(
      "",
    )}</select></label></section><p class="summary-note">Resumo das compras de cartão registradas para o mês de vencimento escolhido. Uma importação parcial gera um resumo parcial; estes valores não confirmam o total oficial da fatura. Cartões do mesmo banco e responsável ficam juntos.</p><section class="cards"><article class="balance"><span>Total registrado nos cartões</span><h2>${money(summary.total)}</h2><small>Somente compras salvas</small></article><article><span>Compras registradas</span><h2>${summary.count}</h2><small>Cada compra é contada separadamente</small></article><article><span>Valor pendente</span><h2>${money(summary.pending)}</h2><small>Compras marcadas como não pagas</small></article><article><span>Valor pago</span><h2>${money(summary.paid)}</h2><small>Compras marcadas como pagas</small></article></section>${
    summary.count
      ? `<div class="columns"><section class="panel"><h2>Por banco e responsável</h2>${summary.groups
          .map(
            (g) =>
              `<article class="card-summary"><div class="section-head"><div><h3>${esc(g.bank)} · ${esc(g.person)}</h3><p>${g.count} compra(s) · Pendente: ${money(g.pending)}</p></div><strong>${money(g.total)}</strong></div><details><summary>Ver compras deste cartão</summary><div class="table-wrap"><table><thead><tr><th>Data da compra</th><th>Descrição</th><th>Categoria</th><th>Valor</th></tr></thead><tbody>${[
                ...g.purchases,
              ]
                .sort(
                  (a, b) =>
                    a.purchaseDate.localeCompare(b.purchaseDate) ||
                    a.id.localeCompare(b.id),
                )
                .map(
                  (p) =>
                    `<tr><td>${date(p.purchaseDate)}</td><td>${esc(p.merchant)}</td><td>${esc(p.category)}</td><td>${money(p.cents)}</td></tr>`,
                )
                .join("")}</tbody></table></div></details></article>`,
          )
          .join(
            "",
          )}</section><section class="panel"><h2>Gastos por categoria</h2>${summary.categories.map((c) => `<div class="category-summary"><div><strong>${esc(c.name)}</strong><span>${money(c.cents)}</span></div><progress max="${summary.total}" value="${c.cents}" aria-label="${esc(c.name)}"></progress><small>${((c.cents / summary.total) * 100).toFixed(1).replace(".", ",")}% do total registrado</small></div>`).join("")}</section></div>`
      : '<section class="panel empty"><h3>Nenhuma compra de cartão neste filtro</h3><p>Importe uma fatura ou escolha outro mês, banco ou responsável. Compras importadas anteriormente também aparecem aqui.</p></section>'
  }`;
}
