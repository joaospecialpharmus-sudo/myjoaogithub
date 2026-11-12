import "./style.css";
import { openStatementImport } from "./import-ui.js";
import { totals, toCents } from "./finance.js";
import { discount, offerState, validateOfferDates } from "./debts.js";
import {
  client,
  esc,
  startSecurity,
  logout,
  secureQuery,
  isVerified,
} from "./security.js";
let items = [],
  debts = [],
  offers = [],
  view = "overview";
const money = (n) =>
  (n / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
let month = localDate().slice(0, 7);
const dateLabel = (s) =>
  s ? s.split("-").reverse().join("/") : "Sem validade informada";
const people =
  "<option>Compartilhado</option><option>Eu</option><option>Larissa</option>";
const categories = [
  "Salário",
  "Outros recebimentos",
  "Moradia",
  "Luz",
  "Água",
  "Alimentação",
  "Transporte",
  "Saúde",
  "Faculdade",
  "Financiamento",
  "Acordo",
  "Lazer",
  "Outros",
];
function message(text) {
  const target = document.querySelector("#page-error");
  if (target) target.textContent = text;
}
async function readAll(table, order) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const batch = await secureQuery(
      client
        .from(table)
        .select("*")
        .order(order)
        .order("id")
        .range(offset, offset + 499),
    );
    if (!isVerified()) return [];
    rows.push(...batch);
    if (batch.length < 500) return rows;
  }
}
async function load() {
  const results = await Promise.all([
    readAll("entries", "date"),
    readAll("debts", "creditor"),
    readAll("debt_offers", "observed_on"),
  ]);
  if (!isVerified()) return;
  [items, debts, offers] = results;
  items.sort(
    (a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id),
  );
  offers.sort(
    (a, b) =>
      b.observed_on.localeCompare(a.observed_on) || a.id.localeCompare(b.id),
  );
  render();
}
async function action(button, fn) {
  button.disabled = true;
  try {
    await fn();
    await load();
  } catch (error) {
    message(error.message);
  } finally {
    button.disabled = false;
  }
}
function overview() {
  const current = items.filter((x) => x.date.startsWith(month));
  const t = totals(current);
  const pending = current
    .filter((x) => x.status === "pending" && x.type === "expense")
    .sort((a, b) => a.date.localeCompare(b.date));
  return `<section class="cards"><article class="balance"><span>Saldo do mês</span><h2>${money(t.balance)}</h2><small>Recebido menos despesas pagas</small></article><article><span>↓ Recebimentos</span><h2>${money(t.income)}</h2><small>${money(t.expected)} ainda previstos</small></article><article><span>↑ Despesas pagas</span><h2>${money(t.expenses)}</h2><small>${money(t.pending)} a pagar</small></article><article><span>Previsão de fechamento</span><h2>${money(t.projected)}</h2><small>Inclui entradas e saídas previstas</small></article></section><div class="columns"><section id="transactions" class="panel"><div class="section-head"><div><h2>Movimentações</h2><p>O que entrou e saiu da rotina.</p></div><button class="primary" data-dialog="entry-dialog">+ Novo lançamento</button></div>${current.length ? `<div class="table-wrap"><table><thead><tr><th>Descrição</th><th>Data</th><th>Valor</th><th>Situação</th><th></th></tr></thead><tbody>${current.map((x) => `<tr><td><strong>${esc(x.name)}</strong><small>${esc(x.category)} · ${esc(x.person)}</small></td><td>${dateLabel(x.date)}</td><td class="${x.type === "income" ? "green" : ""}">${x.type === "income" ? "+" : "−"} ${money(x.cents)}</td><td><button class="status" data-toggle="${esc(x.id)}">${x.status === "done" ? (x.type === "income" ? "Recebido" : "Pago") : "Pendente"}</button></td><td><button data-delete="${esc(x.id)}" aria-label="Excluir ${esc(x.name)}">×</button></td></tr>`).join("")}</tbody></table></div>` : '<div class="empty"><span>↗</span><h3>O primeiro passo é enxergar.</h3><p>Adicione os recebimentos e as contas de vocês.</p><button data-dialog="entry-dialog">Adicionar primeiro lançamento →</button></div>'}</section><section id="bills" class="panel"><h2>No radar</h2><p>Próximas contas deste mês</p>${pending.length ? pending.map((x) => `<div class="bill"><div class="date">${esc(x.date.slice(8))}</div><div><strong>${esc(x.name)}</strong><small>${esc(x.category)}</small></div><b>${money(x.cents)}</b></div>`).join("") : '<div class="quiet">✓<h3>Tudo tranquilo por aqui</h3><p>As contas pendentes aparecerão aqui.</p></div>'}<div class="tip"><strong>Planejem com antecedência</strong><p>Cadastrem a faculdade, o financiamento e as parcelas dos acordos.</p></div></section></div>`;
}
function debtView() {
  return `<section class="panel debt-panel"><div class="section-head"><div><h2>Dívidas e propostas</h2><p>Registro manual das consultas de vocês no Serasa ou diretamente com o credor.</p></div><button class="primary" data-dialog="debt-dialog">+ Cadastrar dívida</button></div><div class="tip"><strong>Ofertas registradas, sem consulta automática</strong><p>Consulte o Serasa pelos canais oficiais e registre aqui o valor total e a validade. Uma proposta registrada não confirma que ela continua disponível e não significa que foi aceita.</p></div>${
    debts.length
      ? debts
          .map(
            (d) =>
              `<article class="debt-card"><div class="section-head"><div><h3>${esc(d.creditor)}</h3><p>${esc(d.person)} · Valor de referência: ${money(d.original_cents)}</p></div><label>Situação<select data-debt-status="${d.id}">${[
                ["open", "Em aberto"],
                ["negotiated", "Negociada"],
                ["paid", "Quitada"],
              ]
                .map(
                  ([v, n]) =>
                    `<option value="${v}" ${d.status === v ? "selected" : ""}>${n}</option>`,
                )
                .join(
                  "",
                )}</select></label></div><p>${esc(d.notes)}</p><button data-offer="${d.id}">+ Registrar proposta</button><button data-delete-debt="${d.id}">Excluir dívida</button><div class="offers">${
                offers
                  .filter((o) => o.debt_id === d.id)
                  .map(
                    (o) =>
                      `<div class="offer"><strong>${money(o.total_cents)} no total · ${o.installments} parcela(s)</strong><span class="status">${offerState(o, localDate()) === "expired" ? "Validade encerrada" : "Registrada · confirmar no credor"}</span><p>${discount(d.original_cents, o.total_cents) >= 0 ? `${discount(d.original_cents, o.total_cents).toLocaleString("pt-BR")}% abaixo do valor de referência` : "Acima do valor de referência"} · Consulta: ${dateLabel(o.observed_on)}<br>Validade: ${dateLabel(o.valid_until)}</p><p>${esc(o.notes)}</p><button data-delete-offer="${o.id}">Excluir proposta</button></div>`,
                  )
                  .join("") || "<p>Nenhuma proposta registrada.</p>"
              }</div></article>`,
          )
          .join("")
      : '<div class="empty"><h3>Um plano para sair das dívidas</h3><p>Registre o credor, o valor de referência e as propostas recebidas.</p></div>'
  }<p>O saldo da dívida e as propostas não entram automaticamente nas despesas. Cadastre somente os pagamentos efetivos ou as parcelas combinadas para evitar duplicidade.</p></section>`;
}
const dialog = (id, title, body, submit) =>
  `<dialog id="${id}"><form><div class="section-head"><h2>${title}</h2><button type="button" data-close aria-label="Fechar">×</button></div>${body}<p class="form-error" role="alert"></p><button type="submit" class="primary">${submit}</button></form></dialog>`;
function render() {
  document.querySelector("#app").innerHTML =
    `<aside><a class="brand" href="#">a dois<span>●</span></a><p>FINANÇAS DA CASA</p><nav><button data-view="overview" class="${view === "overview" ? "active" : ""}">◫ &nbsp; Visão do mês</button><button data-view="debts" class="${view === "debts" ? "active" : ""}">⇄ &nbsp; Dívidas e propostas</button></nav><div class="aside-bottom">Um plano em comum.<br>Uma vida mais leve.<small>Espaço privado do casal</small><button id="logout">Sair com segurança</button></div></aside><main><header><div><span class="eyebrow">SEU DINHEIRO, EM SINTONIA</span><h1>${view === "overview" ? "Visão do mês" : "Dívidas e propostas"}</h1><p>Clareza para cuidar do presente e planejar juntos.</p></div>${view === "overview" ? `<label class="month">Período<input id="month" type="month" value="${month}" required></label>` : ""}</header><div class="mobile-nav"><button data-view="overview">Visão do mês</button><button data-view="debts">Dívidas</button><button data-logout>Sair</button></div><section class="notice"><span>Sessão com dois fatores. Saída automática após 15 minutos sem atividade.</span><div><button id="import-pdf">Importar fatura PDF</button><button id="refresh">Atualizar</button><button id="export">Exportar dados ↓</button><button id="password">Alterar senha</button></div></section><p id="page-error" role="alert"></p>${view === "overview" ? overview() : debtView()}<footer>A dois · Cada escolha conta.</footer></main>${dialog("entry-dialog", "Novo lançamento", `<label>Descrição<input name="name" required maxlength="100" placeholder="Ex.: salário, conta de luz"></label><div class="form-grid"><label>Tipo<select name="type"><option value="expense">Despesa</option><option value="income">Recebimento</option></select></label><label>Valor (R$)<input name="amount" type="number" min="0.01" max="1000000000" step="0.01" required></label><label>Data / vencimento<input name="date" type="date" value="${localDate()}" required></label><label>Situação<select name="status"><option value="pending">Previsto / pendente</option><option value="done">Recebido / pago</option></select></label><label>Responsável<select name="person">${people}</select></label><label>Categoria<select name="category">${categories.map((c) => `<option>${c}</option>`).join("")}</select></label></div>`, "Salvar lançamento")}${dialog("debt-dialog", "Cadastrar dívida", `<label>Credor<input name="creditor" required maxlength="100"></label><div class="form-grid"><label>Valor total de referência (R$)<input name="amount" type="number" min="0.01" max="1000000000" step="0.01" required></label><label>Responsável<select name="person">${people}</select></label></div><label>Observações (sem CPF ou senha do Serasa)<textarea name="notes" maxlength="1000"></textarea></label>`, "Salvar dívida")}${dialog("offer-dialog", "Registrar proposta", `<input name="debt_id" type="hidden"><p>Preencha o total da proposta, incluindo todas as parcelas e a entrada, se houver.</p><div class="form-grid"><label>Valor total proposto (R$)<input name="amount" type="number" min="0.01" max="1000000000" step="0.01" required></label><label>Número de parcelas<input name="installments" type="number" min="1" max="600" value="1" required></label><label>Data da consulta<input name="observed_on" type="date" value="${localDate()}" required></label><label>Válida até (opcional)<input name="valid_until" type="date"></label></div><label>Canal e condições da proposta<textarea name="notes" maxlength="1000" placeholder="Ex.: consulta manual no Serasa; condições de entrada"></textarea></label>`, "Salvar proposta")}${dialog("password-dialog", "Alterar senha", '<label>Nova senha<input name="password" type="password" autocomplete="new-password" minlength="14" maxlength="128" required></label><p>Use uma senha exclusiva com pelo menos 14 caracteres. Após a alteração, todas as suas sessões serão encerradas.</p>', "Alterar e sair")}`;
  bind();
}
function bind() {
  document.querySelector("#import-pdf").onclick = () =>
    openStatementImport({
      getEntries: () => items,
      onSave: async (entries) => {
        if (!isVerified()) throw Error("Entre novamente antes de importar.");
        await secureQuery(
          client
            .from("entries")
            .upsert(entries, { onConflict: "id", ignoreDuplicates: true }),
        );
        if (!isVerified()) return;
        month = entries[0].date.slice(0, 7);
        await load();
      },
    });
  document.querySelector("#logout").onclick = logout;
  document.querySelector("[data-logout]").onclick = logout;
  document.querySelectorAll("[data-view]").forEach(
    (b) =>
      (b.onclick = () => {
        view = b.dataset.view;
        render();
      }),
  );
  document
    .querySelectorAll("[data-dialog]")
    .forEach(
      (b) =>
        (b.onclick = () =>
          document.getElementById(b.dataset.dialog).showModal()),
    );
  document
    .querySelectorAll("[data-close]")
    .forEach((b) => (b.onclick = () => b.closest("dialog").close()));
  document.querySelector("#month")?.addEventListener("change", (e) => {
    if (e.target.value) {
      month = e.target.value;
      render();
    }
  });
  document.querySelector("#refresh").onclick = (e) =>
    action(e.target, async () => {});
  document.querySelector("#password").onclick = () =>
    document.querySelector("#password-dialog").showModal();
  bindForm("entry-dialog", async (f) =>
    secureQuery(
      client.from("entries").insert({
        id: crypto.randomUUID(),
        name: f.get("name").trim(),
        type: f.get("type"),
        cents: toCents(f.get("amount")),
        date: f.get("date"),
        status: f.get("status"),
        person: f.get("person"),
        category: f.get("category"),
      }),
    ),
  );
  bindForm("debt-dialog", async (f) =>
    secureQuery(
      client.from("debts").insert({
        id: crypto.randomUUID(),
        creditor: f.get("creditor").trim(),
        original_cents: toCents(f.get("amount")),
        person: f.get("person"),
        status: "open",
        notes: f.get("notes").trim(),
      }),
    ),
  );
  bindForm("offer-dialog", async (f) => {
    validateOfferDates(f.get("observed_on"), f.get("valid_until"));
    await secureQuery(
      client.from("debt_offers").insert({
        id: crypto.randomUUID(),
        debt_id: f.get("debt_id"),
        total_cents: toCents(f.get("amount")),
        installments: Number(f.get("installments")),
        observed_on: f.get("observed_on"),
        valid_until: f.get("valid_until") || null,
        notes: f.get("notes").trim(),
      }),
    );
  });
  document.querySelector("#password-dialog form").onsubmit = async (e) => {
    e.preventDefault();
    const b = e.target.querySelector("[type=submit]");
    b.disabled = true;
    try {
      const password = new FormData(e.target).get("password");
      const { error } = await client.auth.updateUser({ password });
      if (error)
        throw Error(
          "Não foi possível alterar a senha. Use uma senha exclusiva ou entre novamente.",
        );
      await client.auth.signOut({ scope: "global" });
      await logout();
    } catch (err) {
      e.target.querySelector(".form-error").textContent = err.message;
    } finally {
      b.disabled = false;
    }
  };
  document.querySelectorAll("[data-toggle]").forEach(
    (b) =>
      (b.onclick = () =>
        action(b, () => {
          const x = items.find((x) => x.id === b.dataset.toggle);
          return secureQuery(
            client
              .from("entries")
              .update({ status: x.status === "done" ? "pending" : "done" })
              .eq("id", x.id),
          );
        })),
  );
  document.querySelectorAll("[data-delete]").forEach(
    (b) =>
      (b.onclick = () => {
        if (confirm("Excluir este lançamento?"))
          action(b, () =>
            secureQuery(
              client.from("entries").delete().eq("id", b.dataset.delete),
            ),
          );
      }),
  );
  document
    .querySelectorAll("[data-debt-status]")
    .forEach(
      (b) =>
        (b.onchange = () =>
          action(b, () =>
            secureQuery(
              client
                .from("debts")
                .update({ status: b.value })
                .eq("id", b.dataset.debtStatus),
            ),
          )),
    );
  document.querySelectorAll("[data-offer]").forEach(
    (b) =>
      (b.onclick = () => {
        const d = document.querySelector("#offer-dialog");
        d.querySelector("[name=debt_id]").value = b.dataset.offer;
        d.showModal();
      }),
  );
  document.querySelectorAll("[data-delete-debt]").forEach(
    (b) =>
      (b.onclick = () => {
        if (confirm("Excluir esta dívida e todas as propostas registradas?"))
          action(b, () =>
            secureQuery(
              client.from("debts").delete().eq("id", b.dataset.deleteDebt),
            ),
          );
      }),
  );
  document.querySelectorAll("[data-delete-offer]").forEach(
    (b) =>
      (b.onclick = () => {
        if (confirm("Excluir esta proposta?"))
          action(b, () =>
            secureQuery(
              client
                .from("debt_offers")
                .delete()
                .eq("id", b.dataset.deleteOffer),
            ),
          );
      }),
  );
  document.querySelector("#export").onclick = () => {
    if (
      !confirm(
        "O arquivo conterá seus dados financeiros sem criptografia. Deseja baixar para este dispositivo?",
      )
    )
      return;
    const url = URL.createObjectURL(
      new Blob(
        [JSON.stringify({ version: 2, items, debts, offers }, null, 2)],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "a-dois-dados.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
}
function bindForm(id, handler) {
  const form = document.querySelector(`#${id} form`);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const button = form.querySelector("[type=submit]");
    button.disabled = true;
    try {
      await handler(new FormData(form));
      form.closest("dialog").close();
      await load();
    } catch (err) {
      form.querySelector(".form-error").textContent = err.message;
    } finally {
      button.disabled = false;
    }
  };
}
startSecurity(
  async () => {
    try {
      await load();
    } catch (err) {
      await logout();
      document.querySelector("#auth-error").textContent = err.message;
    }
  },
  () => {
    items = [];
    debts = [];
    offers = [];
    view = "overview";
  },
);
