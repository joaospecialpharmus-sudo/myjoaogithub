import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { textItemsToLines } from "./statement.js";
GlobalWorkerOptions.workerSrc = workerUrl;
export async function readStatementPdf(
  file,
  onPassword,
  isActive = () => true,
) {
  if (!file || file.size === 0 || file.size > 15 * 1024 * 1024)
    throw Error("Escolha um PDF de até 15 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(bytes.slice(0, 1024)).indexOf("%PDF-") < 0)
    throw Error("O arquivo selecionado não é um PDF válido.");
  const digest = [
    ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
  ]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  if (!isActive()) throw Error("Leitura cancelada.");
  const task = getDocument({
    data: bytes,
    isEvalSupported: false,
    useSystemFonts: false,
    disableFontFace: true,
    stopAtErrors: true,
    maxImageSize: 1,
    enableXfa: false,
  });
  let cancelled = false;
  task.onPassword = (update, reason) => {
    if (!isActive()) {
      cancelled = true;
      task.destroy();
      return;
    }
    const password = onPassword(reason);
    if (password === null) {
      cancelled = true;
      task.destroy();
    } else update(password);
  };
  const timeout = setTimeout(() => {
    cancelled = true;
    task.destroy();
  }, 45000);
  try {
    const pdf = await task.promise;
    if (pdf.numPages > 60)
      throw Error(
        "Este PDF tem mais de 60 páginas. Exporte somente a fatura desejada.",
      );
    const lines = [];
    let length = 0;
    let sourceOffset = 0;
    for (let i = 1; i <= pdf.numPages; i++) {
      if (!isActive()) throw Error("Leitura cancelada.");
      const page = await pdf.getPage(i);
      const text = await page.getTextContent();
      const result = textItemsToLines(text.items, {
        boundary: (page.view[0] + page.view[2]) / 2,
        offset: sourceOffset,
        page: i,
      });
      sourceOffset += result.sourceLineCount;
      const next = result.rows;
      length += next.map((x) => x.text).join("").length;
      if (length > 1000000)
        throw Error("O PDF excede o limite de texto para leitura no aparelho.");
      lines.push(...next);
      page.cleanup();
    }
    if (!lines.some((x) => x.text.trim()))
      throw Error(
        "Este PDF não contém texto extraível. PDFs digitalizados precisam de OCR, ainda não disponível.",
      );
    return { lines, digest };
  } catch (error) {
    if (cancelled) throw Error("Leitura cancelada ou tempo limite atingido.");
    if (error.name === "PasswordException")
      throw Error("Não foi possível abrir o PDF com essa senha.");
    if (error.name === "InvalidPDFException")
      throw Error("PDF inválido ou danificado. Exporte novamente pelo banco.");
    if (
      error.message?.startsWith("O PDF") ||
      error.message?.startsWith("Este PDF") ||
      error.message === "Leitura cancelada."
    )
      throw error;
    throw Error(
      "Não foi possível extrair o texto do PDF. Exporte novamente pelo banco ou cadastre os gastos manualmente.",
    );
  } finally {
    clearTimeout(timeout);
    await task.destroy();
  }
}
