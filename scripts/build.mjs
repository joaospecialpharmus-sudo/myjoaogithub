import { build, loadEnv } from "vite";
import { readFile, writeFile, readdir } from "node:fs/promises";
const env = loadEnv("production", process.cwd(), "VITE_");
let origin = "";
if (
  Boolean(env.VITE_SUPABASE_URL) !== Boolean(env.VITE_SUPABASE_PUBLISHABLE_KEY)
)
  throw Error("Configure a URL e a chave publicável juntas.");
if (env.VITE_SUPABASE_URL) {
  const url = new URL(env.VITE_SUPABASE_URL);
  if (
    url.protocol !== "https:" ||
    !url.hostname.endsWith(".supabase.co") ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw Error("Use a URL HTTPS oficial do projeto Supabase.");
  origin = url.origin;
  const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (key.startsWith("sb_secret_"))
    throw Error("Chave secreta proibida no frontend.");
  if (!key.startsWith("sb_publishable_")) {
    let payload;
    try {
      payload = JSON.parse(Buffer.from(key.split(".")[1], "base64url"));
    } catch {
      throw Error("Chave publicável/anon inválida.");
    }
    if (payload.role !== "anon")
      throw Error("Somente chave publicável ou anon é permitida.");
  }
}
await build({ base: "./" });
const path = "dist/index.html";
const policy = `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; worker-src 'self'; connect-src 'self' ${origin}; object-src 'none'; base-uri 'none'; form-action 'none'`;
await writeFile(
  path,
  (await readFile(path, "utf8")).replace(
    "<head>",
    `<head><meta http-equiv="Content-Security-Policy" content="${policy}"><meta name="referrer" content="no-referrer">`,
  ),
);
await writeFile("dist/.nojekyll", "");

// Distribui as licenças/avisos dos pacotes de produção junto com os artefatos.
const lock=JSON.parse(await readFile('package-lock.json','utf8'));
const notices=[];
for(const [directory,metadata] of Object.entries(lock.packages)){
  if(!directory||metadata.dev)continue;
  let files;try{files=await readdir(directory);}catch{continue;}
  for(const file of files.filter(x=>/^(?:licen[cs]e|notice)(?:\..*)?$/i.test(x))){
    notices.push(`${directory} — ${metadata.version} — ${file}\n\n${await readFile(`${directory}/${file}`,'utf8')}`);
  }
}
await writeFile('dist/THIRD_PARTY_NOTICES.txt',notices.join('\n\n--------------------\n\n'));
