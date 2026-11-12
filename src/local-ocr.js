import { createWorker } from "tesseract.js";
import { ocrTsvToLines } from "./ocr-lines.js";
const asset = (name) =>
  new URL(`ocr/${name}`, new URL(import.meta.env.BASE_URL, document.baseURI))
    .href;
export async function createLocalOcr(onProgress, isActive) {
  const worker = await createWorker("por", 1, {
    workerPath: asset("worker.min.js"),
    corePath: asset(""),
    langPath: asset(""),
    workerBlobURL: false,
    cacheMethod: "none",
    logger: (m) => {
      if (isActive())
        onProgress(
          m.status === "recognizing text" ? Math.round(m.progress * 100) : 0,
        );
    },
    errorHandler: () => {},
  });
  let active = true;
  return {
    async read(page, pageNumber) {
      if (!isActive()) throw Error("Leitura cancelada.");
      const scale = Math.min(3, 1800 / (page.view[2] - page.view[0]));
      const viewport = page.getViewport({ scale });
      if (viewport.width * viewport.height > 8000000)
        throw Error("Página grande demais para OCR no aparelho.");
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      try {
        await page.render({ canvasContext: canvas.getContext("2d"), viewport })
          .promise;
        await worker.setParameters({
          tessedit_pageseg_mode: "3",
          tessedit_char_whitelist: "",
        });
        const result = await worker.recognize(
          canvas,
          {},
          { tsv: true, text: true },
        );
        const lines = ocrTsvToLines(result.data.tsv, { page: pageNumber });
        // Releitura por linha em tabelas com datas: recupera valores que a segmentação da página perdeu.
        for (const line of lines) {
          if (!isActive()) throw Error("Leitura cancelada.");
          const summaryLine =
            /^(?:compras nacionais|compras internacionais|total dos lan[cç]amentos atuais|subtotal deste cart[aã]o)\b/i.test(
              line.text,
            );
          if (
            !summaryLine &&
            !/^[□☐◻▪■oO]?\s*[O0-9]{1,3}\s*(?:jan|fev|mar|abr|mai|jun|jul|ago|set|[oO0][oO0]?ut|nov|dez|[\/-]\d{1,2})\b/i.test(
              line.text,
            )
          )
            continue;
          const center = (line.bounds.top + line.bounds.bottom) / 2;
          const half = Math.max(
            22,
            (line.bounds.bottom - line.bounds.top) * 1.1,
          );
          const top = Math.max(0, Math.floor(center - half)),
            height = Math.min(canvas.height - top, Math.ceil(half * 2));
          const crop = document.createElement("canvas");
          crop.width = canvas.width;
          crop.height = height;
          crop
            .getContext("2d")
            .drawImage(
              canvas,
              0,
              top,
              canvas.width,
              height,
              0,
              0,
              canvas.width,
              height,
            );
          await worker.setParameters({ tessedit_pageseg_mode: "7" });
          const refined = await worker.recognize(crop, {}, { text: true });
          crop.width = 0;
          crop.height = 0;
          if (refined.data.text?.trim())
            line.text = refined.data.text.replace(/\s+/g, " ").trim();
          if (summaryLine && line.amountBounds) {
            const left = Math.max(0, line.amountBounds.left - 10),
              width = Math.min(
                canvas.width - left,
                line.amountBounds.width + 20,
              );
            const digits = document.createElement("canvas");
            digits.width = Math.ceil(width * 3 + 40);
            digits.height = Math.ceil(height * 3 + 40);
            const ctx = digits.getContext("2d");
            ctx.fillStyle = "white";
            ctx.fillRect(0, 0, digits.width, digits.height);
            ctx.drawImage(
              canvas,
              left,
              top,
              width,
              height,
              20,
              20,
              width * 3,
              height * 3,
            );
            try {
              await worker.reinitialize("eng");
              await worker.setParameters({
                tessedit_pageseg_mode: "7",
                tessedit_char_whitelist: "0123456789,.",
              });
              const numeric = await worker.recognize(
                digits,
                {},
                { text: true },
              );
              const value = numeric.data.text.trim();
              let confirmed = numeric.data.confidence >= 80;
              if (!confirmed) {
                await worker.setParameters({ tessedit_pageseg_mode: "8" });
                const second = await worker.recognize(
                  digits,
                  {},
                  { text: true },
                );
                confirmed = second.data.text.trim() === value;
              }
              line.referenceUncertain = !confirmed;
              if (
                /^(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}$/.test(value) &&
                confirmed
              )
                line.text = line.text.replace(
                  /(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2}\s*$/,
                  value,
                );
            } finally {
              await worker.reinitialize("por");
              await worker.setParameters({ tessedit_char_whitelist: "" });
              digits.width = 0;
              digits.height = 0;
            }
          }
        }
        return lines;
      } finally {
        canvas.width = 0;
        canvas.height = 0;
      }
    },
    async terminate() {
      if (active) {
        active = false;
        await worker.terminate();
      }
    },
  };
}
