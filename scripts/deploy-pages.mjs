// Publica somente os arquivos estáticos de dist, preservando o histórico de gh-pages.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const files = readdirSync("dist").sort();
if (
  JSON.stringify(files) !==
  JSON.stringify([
    ".nojekyll",
    "THIRD_PARTY_NOTICES.txt",
    "assets",
    "index.html",
    "ocr",
  ])
)
  throw Error("dist contém arquivos inesperados; faça um build limpo.");
if (
  !readFileSync("dist/index.html", "utf8").includes("Content-Security-Policy")
)
  throw Error("Build sem CSP. Execute npm run build.");
for (const f of readdirSync("dist/assets")) {
  if (!/\.(js|mjs|css)$/.test(f))
    throw Error("Artefato inesperado em dist/assets.");
  if (
    readFileSync(join("dist/assets", f), "utf8").includes(
      "sb_publishable_test_only",
    )
  )
    throw Error(
      "Não publique artefatos de teste. Execute npm run build sem as variáveis de teste.",
    );
}
const expectedOcr = [
  "por.traineddata.gz",
  "tesseract-core-lstm.wasm.js",
  "tesseract-core-relaxedsimd-lstm.wasm.js",
  "tesseract-core-simd-lstm.wasm.js",
  "worker.min.js",
];
if (
  JSON.stringify(readdirSync("dist/ocr").sort()) !== JSON.stringify(expectedOcr)
)
  throw Error("Arquivos inesperados nos recursos OCR.");
const directory = mkdtempSync(join(tmpdir(), "adois-deploy-"));
const run = (args, env = process.env) => {
  const r = spawnSync("git", args, { encoding: "utf8", env });
  if (r.status !== 0) throw Error(r.stderr || "Falha no Git");
  return r.stdout.trim();
};
try {
  run(["fetch", "origin", "gh-pages"]);
  const parent = run(["rev-parse", "FETCH_HEAD"]);
  const env = { ...process.env, GIT_INDEX_FILE: join(directory, "index") };
  run([`--work-tree=${resolve("dist")}`, "add", "--all"], env);
  const tree = run(["write-tree"], env);
  const commit = run([
    "-c",
    "user.name=Codex",
    "-c",
    "user.email=noreply@users.noreply.github.com",
    "commit-tree",
    tree,
    "-p",
    parent,
    "-m",
    "Deploy private finance application shell",
  ]);
  console.log(run(["push", "origin", `${commit}:refs/heads/gh-pages`]));
  console.log(
    `Branch gh-pages atualizada: ${commit}. A publicação do Pages ainda precisa terminar no GitHub.`,
  );
} finally {
  rmSync(directory, { recursive: true, force: true });
}
