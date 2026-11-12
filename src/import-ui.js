import { esc, isVerified } from "./security.js";
import {
  parseStatementLines,
  importId,
  importedName,
  markImportDuplicates,
} from "./statement.js";
import { toCents } from "./finance.js";
export function openStatementImport({ getEntries, onSave }) {
  const dialog = document.createElement("dialog");
  dialog.className = "import-dialog";
  const d = new Date();
  const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  dialog.innerHTML = `<div class="section-head"><h2>Importar fatura PDF</h2><button type="button" id="import-close" aria-label="Fechar importação">×</button></div><p>O PDF é lido neste aparelho. Somente os gastos que você confirmar serão enviados ao banco privado. Não são enviados o arquivo, a senha nem o texto completo.</p><form id="import-read"><label>Fatura em PDF (até 15 MB)<input name="file" type="file" accept="application/pdf,.pdf" required></label><div class="form-grid"><label>Banco / cartão<select name="bank"><option>C6 Bank</option><option>Itaú</option><option>Nubank</option><option>Caixa cartões</option></select></label><label>Responsável<select name="person"><option>Compartilhado</option><option>Eu</option><option>Larissa</option></select></label><label>Mês da fatura<input name="month" type="month" value="${month}" required></label><label>Vencimento da fatura<input name="due" type="date" required></label><label>Situação da fatura<select name="status"><option value="pending">Ainda não paga</option><option value="done">Já paga</option></select></label></div><label class="include"><input name="force_ocr" type="checkbox"> Ler como imagem (OCR), se a leitura normal falhar</label><p>As despesas entrarão no fluxo de caixa no vencimento informado. Não cadastre também o pagamento integral da fatura como outra despesa.</p><button type="submit" class="primary">Ler PDF neste aparelho</button></form><p id="import-status" role="status" aria-live="polite"></p><p id="import-error" role="alert"></p><section id="import-review"></section>`;
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
  const form = dialog.querySelector("#import-read");
  form.oninput = () => {
    generation++;
    review.replaceChildren();
    status.textContent = "Configuração alterada. Clique em Ler PDF novamente.";
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    const version = ++generation;
    review.replaceChildren();
    error.textContent = "";
    status.textContent = "Lendo PDF…";
    const f = new FormData(form);
    const controls = [...form.querySelectorAll("input,select,button")];
    controls.forEach((x) => (x.disabled = true));
    const context = {
      bank: f.get("bank"),
      person: f.get("person"),
      due: f.get("due"),
      status: f.get("status"),
    };
    try {
      const { readStatementPdf } = await import("./pdf-reader.js");
      const { lines, digest, usedOcr } = await readStatementPdf(
        f.get("file"),
        (reason) =>
          prompt(
            reason === 2
              ? "Senha incorreta. Digite novamente ou cancele. A senha fica somente neste aparelho."
              : "Este PDF tem senha. Digite-a para abrir somente neste aparelho.",
          ),
        () => active() && generation === version,
        (text) => {
          if (active() && generation === version) status.textContent = text;
        },
        {
          referenceMonth: f.get("month"),
          forceOcr: f.get("force_ocr") === "on",
        },
      );
      if (!active() || version !== generation) return;
      const parsed = parseStatementLines(lines, f.get("month"));
      if (parsed.rows.length > 500 || parsed.rejected.length > 500)
        throw Error(
          "Mais de 500 linhas de compra ou revisão. Exporte um PDF menor. Nenhum dado foi salvo.",
        );
      const buildEntry = async (row) => ({
        id: await importId(digest, row.index),
        name: importedName(
          context.bank,
          row.purchaseDate || context.due,
          row.description,
        ),
        cents: row.cents,
        date: context.due,
        person: context.person,
        type: "expense",
        status: context.status,
        category: "Outros",
      });
      let rows = await Promise.all(
        parsed.rows.map(async (row) => ({
          ...row,
          entry: await buildEntry(row),
        })),
      );
      rows = markImportDuplicates(rows, getEntries());
      if (!active() || version !== generation) return;
      status.textContent = `${usedOcr ? "Leitura por OCR concluída. Confira datas e valores. " : ""}${rows.length} compras encontradas. Edite os valores se precisar e desmarque o que não quiser importar.`;
      review.innerHTML = `<h3>Compras do PDF</h3><p>Banco: ${esc(context.bank)} · Responsável: ${esc(context.person)} · Vencimento: ${esc(context.due.split("-").reverse().join("/"))}. Os totais se referem somente às compras selecionadas.</p><form id="import-confirm"><div class="import-rows"></div><button type="button" id="add-missing">+ Adicionar compra que faltou</button><p id="import-total"></p><button type="submit" class="primary">Salvar compras selecionadas</button></form>${parsed.rejected.length ? `<details class="ignored-lines"><summary>Ver ${parsed.rejected.length} linhas não importadas automaticamente</summary><p>Pagamentos, totais e estornos não devem ser incluídos como compras. As linhas abaixo ficam somente neste aparelho até você decidir incluir uma compra.</p>${parsed.rejected.map((r, i) => `<article class="ignored-line"><strong>${esc(r.reason)}</strong><p>${esc(r.line)}</p>${r.recoverable === false ? "<p>Não é um gasto. Esta linha não pode ser importada como compra.</p>" : `<button type="button" data-recover="${i}">Revisar e incluir como compra</button>`}</article>`).join("")}</details>` : ""}`;
      const rowContainer = review.querySelector(".import-rows");
      function appendRow(r, i, checked = !r.exact && !r.possible) {
        rowContainer.insertAdjacentHTML(
          "beforeend",
          `<fieldset class="import-row" data-row="${i}"><label class="include"><input type="checkbox" name="include" ${checked ? "checked" : ""} ${r.exact ? "disabled" : ""}> Importar esta compra</label><p>${r.exact ? "Já importada deste PDF" : r.possible ? "Possível duplicata exata: mesma data, descrição, valor e responsável. Confira antes de marcar." : r.manual ? "Inclusão manual: confira os campos com a fatura." : "Compra identificada para revisão."}</p><div class="form-grid"><label>Data da compra<input name="purchase_date" type="date" min="1900-01-01" max="2100-12-31" value="${esc(r.purchaseDate)}" required></label><label>Descrição<input name="description" value="${esc(r.description.slice(0, 65))}" maxlength="65" required></label><label>Valor (R$)<input name="amount" type="number" min="0.01" max="1000000000" step="0.01" value="${r.cents ? (r.cents / 100).toFixed(2) : ""}" required></label><label>Categoria<select name="category">${["Outros", "Alimentação", "Transporte", "Saúde", "Moradia", "Lazer", "Faculdade", "Acordo"].map((c) => `<option>${c}</option>`).join("")}</select></label></div></fieldset>`,
        );
      }
      rows.forEach((r, i) => appendRow(r, i));
      function selection() {
        return [...rowContainer.querySelectorAll("[data-row]")]
          .filter((el) => el.querySelector("[name=include]").checked)
          .map((el) => {
            const r = rows[Number(el.dataset.row)];
            const description = el
              .querySelector("[name=description]")
              .value.trim();
            const date = el.querySelector("[name=purchase_date]").value;
            if (!description || !date)
              throw Error(
                "Preencha a data e a descrição das compras selecionadas.",
              );
            return {
              ...r.entry,
              name: importedName(context.bank, date, description),
              cents: toCents(el.querySelector("[name=amount]").value),
              category: el.querySelector("[name=category]").value,
            };
          });
      }
      const total = () => {
        for (const el of rowContainer.querySelectorAll("[data-row]")) {
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
            "Confira os campos das compras selecionadas.";
        }
      };
      review.querySelector("#import-confirm").addEventListener("input", total);
      total();
      async function addManual(raw, button) {
        if (button) button.disabled = true;
        const r = {
          index: raw?.index ?? `manual:${crypto.randomUUID()}`,
          purchaseDate: raw?.purchaseDate || "",
          description: raw?.description || "",
          cents: raw?.suggestedCents || 0,
          manual: true,
        };
        r.entry = await buildEntry(r);
        r.exact = getEntries().some((x) => x.id === r.entry.id);
        if (!active() || version !== generation) return;
        rows.push(r);
        appendRow(r, rows.length - 1, !r.exact);
        total();
        rowContainer.lastElementChild.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }
      review.querySelectorAll("[data-recover]").forEach(
        (b) =>
          (b.onclick = () =>
            addManual(parsed.rejected[Number(b.dataset.recover)], b).catch(
              () => {
                if (active())
                  error.textContent =
                    "Não foi possível preparar a linha para revisão.";
              },
            )),
      );
      review.querySelector("#add-missing").onclick = () =>
        addManual(null).catch(() => {
          if (active())
            error.textContent = "Não foi possível adicionar a linha.";
        });
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
          await onSave(entries);
          if (active()) close();
        } catch (err) {
          if (active()) {
            error.textContent = err.message;
            total();
          }
        } finally {
          save.disabled = false;
        }
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
