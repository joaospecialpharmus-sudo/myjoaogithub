import { esc, isVerified } from "./security.js";
import {
  parseStatementLines,
  importId,
  importedName,
  sameEntry,
} from "./statement.js";
import { toCents } from "./finance.js";
export function openStatementImport({ getEntries, onSave }) {
  const dialog = document.createElement("dialog");
  dialog.className = "import-dialog";
  const d = new Date();
  const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  dialog.innerHTML = `<div class="section-head"><h2>Importar fatura PDF</h2><button type="button" id="import-close" aria-label="Fechar importação">×</button></div><p>O PDF é lido neste aparelho. Somente os gastos que você confirmar serão enviados ao banco privado. Não são enviados o arquivo, a senha nem o texto completo.</p><form id="import-read"><label>Fatura em PDF (até 15 MB)<input name="file" type="file" accept="application/pdf,.pdf" required></label><div class="form-grid"><label>Banco / cartão<select name="bank"><option>C6 Bank</option><option>Itaú</option><option>Nubank</option><option>Caixa cartões</option></select></label><label>Responsável<select name="person"><option>Compartilhado</option><option>Eu</option><option>Larissa</option></select></label><label>Mês da fatura<input name="month" type="month" value="${month}" required></label><label>Vencimento da fatura<input name="due" type="date" required></label><label>Situação da fatura<select name="status"><option value="pending">Ainda não paga</option><option value="done">Já paga</option></select></label></div><p>As despesas entrarão no fluxo de caixa no vencimento informado. Não cadastre também o pagamento integral da fatura como outra despesa.</p><button type="submit" class="primary">Ler PDF neste aparelho</button></form><p id="import-status" role="status" aria-live="polite"></p><p id="import-error" role="alert"></p><section id="import-review"></section>`;
  document.querySelector("#app").append(dialog);
  dialog.showModal();
  const active = () => dialog.isConnected && dialog.open && isVerified();
  let generation = 0;
  function close() {
    generation++;
    dialog.close();
    dialog.remove();
  }
  dialog.querySelector("#import-close").onclick = close;
  dialog.addEventListener("cancel", (e) => {
    e.preventDefault();
    close();
  });
  const status = dialog.querySelector("#import-status"),
    error = dialog.querySelector("#import-error"),
    review = dialog.querySelector("#import-review");
  dialog.querySelector("#import-read").onsubmit = async (e) => {
    e.preventDefault();
    const version = ++generation;
    review.replaceChildren();
    error.textContent = "";
    status.textContent = "Lendo PDF…";
    const button = e.target.querySelector("[type=submit]");
    button.disabled = true;
    const f = new FormData(e.target);
    const controls = [...e.target.querySelectorAll("input,select,button")];
    controls.forEach((x) => (x.disabled = true));
    const context = {
      bank: f.get("bank"),
      person: f.get("person"),
      due: f.get("due"),
      status: f.get("status"),
    };
    try {
      const { readStatementPdf } = await import("./pdf-reader.js");
      const { lines, digest } = await readStatementPdf(
        f.get("file"),
        (reason) =>
          prompt(
            reason === 2
              ? "Senha incorreta. Digite novamente ou cancele. A senha fica somente neste aparelho."
              : "Este PDF tem senha. Digite-a para abrir somente neste aparelho.",
          ),
        () => active() && generation === version,
      );
      if (!active() || version !== generation) return;
      const parsed = parseStatementLines(lines, f.get("month"));
      if (!parsed.rows.length)
        throw Error(
          "Nenhuma compra foi identificada com segurança. Este layout pode não ser compatível. Nenhum dado foi salvo.",
        );
      if (parsed.rows.length > 500)
        throw Error(
          "Foram encontradas mais de 500 compras. Exporte um PDF menor. Nenhum dado foi salvo.",
        );
      const rows = await Promise.all(
        parsed.rows.map(async (row) => {
          const id = await importId(digest, row.index);
          const entry = {
            id,
            name: importedName(context.bank, row.purchaseDate, row.description),
            cents: row.cents,
            date: context.due,
            person: context.person,
            type: "expense",
            status: context.status,
            category: "Outros",
          };
          const exact = getEntries().some((x) => x.id === id);
          const possible = getEntries().some((x) => sameEntry(x, entry));
          return { ...row, entry, exact, possible };
        }),
      );
      if (!active() || version !== generation) return;
      status.textContent = `${rows.length} compras candidatas. ${parsed.ignored} linhas com data foram ignoradas por ambiguidade, crédito, pagamento ou formato incompatível. A leitura é inicial e pode deixar compras de fora: confira com o PDF e o total da fatura.`;
      review.innerHTML = `<h3>Revise antes de salvar</h3><p>Banco: ${esc(context.bank)} · Responsável: ${esc(context.person)} · Vencimento: ${esc(context.due.split("-").reverse().join("/"))}. Alterar os campos acima exige ler o PDF novamente.</p><form id="import-confirm"><div class="import-rows">${rows.map((r, i) => `<fieldset class="import-row" data-row="${i}"><label class="include"><input type="checkbox" name="include" ${r.exact || r.possible ? "" : "checked"} ${r.exact ? "disabled" : ""}> Importar esta compra</label><p>Compra em ${esc(r.purchaseDate.split("-").reverse().join("/"))}${r.exact ? " · Já importada deste PDF" : r.possible ? " · Possível duplicata: confira antes de marcar" : ""}</p><div class="form-grid"><label>Descrição<input name="description" value="${esc(r.description)}" maxlength="65" required></label><label>Valor (R$)<input name="amount" type="number" min="0.01" max="1000000000" step="0.01" value="${(r.cents / 100).toFixed(2)}" required></label><label>Categoria<select name="category">${["Outros", "Alimentação", "Transporte", "Saúde", "Moradia", "Lazer", "Faculdade", "Acordo"].map((c) => `<option>${c}</option>`).join("")}</select></label></div></fieldset>`).join("")}</div><p id="import-total"></p><label class="include"><input type="checkbox" name="reviewed" required> Conferi as compras selecionadas, os valores e o vencimento com a fatura.</label><button type="submit" class="primary">Salvar compras selecionadas</button></form>`;
      function selection() {
        return [...review.querySelectorAll("[data-row]")]
          .filter((el) => el.querySelector("[name=include]").checked)
          .map((el) => {
            const r = rows[Number(el.dataset.row)];
            if (!el.querySelector("[name=description]").value.trim())
              throw Error("Preencha a descrição das compras selecionadas.");
            return {
              ...r.entry,
              name: importedName(
                context.bank,
                r.purchaseDate,
                el.querySelector("[name=description]").value,
              ),
              cents: toCents(el.querySelector("[name=amount]").value),
              category: el.querySelector("[name=category]").value,
            };
          });
      }
      const total = () => {
        for (const el of review.querySelectorAll("[data-row]")) {
          const included = el.querySelector("[name=include]").checked;
          el.querySelectorAll("input:not([name=include]),select").forEach(
            (x) => (x.disabled = !included),
          );
        }
        try {
          const selected = selection();
          review.querySelector("#import-total").textContent =
            `${selected.length} selecionadas · Total: ${(selected.reduce((sum, x) => sum + x.cents, 0) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}`;
        } catch {
          review.querySelector("#import-total").textContent =
            "Confira os valores digitados.";
        }
      };
      review.querySelector("#import-confirm").addEventListener("input", total);
      total();
      review.querySelector("#import-confirm").onsubmit = async (event) => {
        event.preventDefault();
        error.textContent = "";
        const save = event.target.querySelector("[type=submit]");
        save.disabled = true;
        try {
          if (!active() || generation !== version)
            throw Error("Leia o PDF novamente antes de salvar.");
          const entries = selection();
          if (!entries.length)
            throw Error("Selecione pelo menos uma compra nova.");
          if (entries.some((x) => !x.name.trim()))
            throw Error("Confira as descrições.");
          await onSave(entries);
          if (active()) close();
        } catch (err) {
          if (active()) error.textContent = err.message;
        } finally {
          save.disabled = false;
        }
      };
      // A alteração do contexto invalida a revisão; nunca salva com dados antigos ocultos.
      e.target.oninput = () => {
        generation++;
        review.replaceChildren();
        status.textContent =
          "Configuração alterada. Clique em Ler PDF novamente.";
      };
    } catch (err) {
      if (active()) {
        error.textContent = err.message;
        status.textContent = "Nenhum dado foi salvo.";
      }
    } finally {
      controls.forEach((x) => (x.disabled = false));
    }
  };
}
