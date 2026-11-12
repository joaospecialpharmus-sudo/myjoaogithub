import { mkdir, copyFile, rm } from "node:fs/promises";
export async function prepareOcr() {
  await mkdir("public/ocr", { recursive: true });
  await copyFile(
    "node_modules/tesseract.js/dist/worker.min.js",
    "public/ocr/worker.min.js",
  );
  for (const name of [
    "tesseract-core-lstm.wasm.js",
    "tesseract-core-simd-lstm.wasm.js",
    "tesseract-core-relaxedsimd-lstm.wasm.js",
  ])
    await copyFile(
      `node_modules/tesseract.js-core/${name}`,
      `public/ocr/${name}`,
    );
  await copyFile(
    "node_modules/@tesseract.js-data/por/4.0.0_best_int/por.traineddata.gz",
    "public/ocr/por.traineddata.gz",
  );
  await rm("public/ocr/eng.traineddata.gz", { force: true });
}
if (process.argv[1]?.endsWith("prepare-ocr.mjs")) await prepareOcr();
