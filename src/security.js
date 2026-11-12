import { createClient } from "@supabase/supabase-js";
import QRCode from "qrcode";
export const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const client =
  url && key
    ? createClient(url, key, {
        global: {
          fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
        },
        auth: {
          storage: sessionStorage,
          storageKey: "adois-auth-v2",
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      })
    : null;
let ready;
let failure;
let idleTimer;
let lastActivityAt = 0;
let factorId;
let verified = false;
let authVersion = 0;
const root = () => document.querySelector("#app");
const shell = (content) => {
  root().innerHTML = `<div class="auth-page"><section class="auth-card"><a class="brand" href="#">a dois<span>●</span></a>${content}<p class="auth-foot">Acesso exclusivo do casal · senha + autenticador</p><button id="purge-legacy" class="legacy-clear">Apagar dados locais da demonstração anterior</button></section></div>`;
  document.querySelector("#cancel")?.addEventListener("click", logout);
  document.querySelector("#purge-legacy").onclick = () => {
    if (
      confirm(
        "Apagar os lançamentos da demonstração anterior deste navegador? Não será possível recuperar esta cópia.",
      )
    ) {
      try {
        localStorage.removeItem("adois-v1");
        document.querySelector("#purge-legacy").textContent =
          "Dados antigos deste navegador apagados";
      } catch {
        document.querySelector("#purge-legacy").textContent =
          "Não foi possível apagar. Use as configurações do navegador.";
      }
    }
  };
};
export function lock(message = "") {
  authVersion++;
  verified = false;
  clearTimeout(idleTimer);
  factorId = null;
  if (!client) {
    shell(
      "<h1>Preparando seu acesso privado</h1><p>O banco privado e o autenticador ainda precisam ser configurados. O painel financeiro permanece bloqueado.</p><p>Nenhum cadastro financeiro está disponível nesta página pública.</p>",
    );
    return;
  }
  shell(
    `<h1>Entrar com segurança</h1><p>Use sua conta previamente autorizada.</p><form id="login"><label>E-mail<input name="email" type="email" autocomplete="username" required maxlength="254"></label><label>Senha<input name="password" type="password" autocomplete="current-password" required maxlength="256"></label><p id="auth-error" role="alert">${esc(message)}</p><button class="primary" type="submit">Continuar</button></form>`,
  );
  document.querySelector("#login").onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    await attempt(e.target, async () => {
      const { error } = await client.auth.signInWithPassword({
        email: f.get("email").trim(),
        password: f.get("password"),
      });
      if (error)
        throw Error(
          "Não foi possível entrar. Confira suas credenciais ou aguarde antes de tentar novamente.",
        );
      e.target.reset();
      await secondFactor();
    });
  };
}
async function attempt(form, action) {
  const button = form.querySelector("[type=submit]");
  button.disabled = true;
  try {
    await action();
  } catch (error) {
    const target = document.querySelector("#auth-error");
    if (target)
      target.textContent =
        error.message || "Não foi possível concluir. Tente novamente.";
  } finally {
    button.disabled = false;
  }
}
async function secondFactor() {
  const version = authVersion;
  const { data, error } = await client.auth.mfa.listFactors();
  if (version !== authVersion) return;
  if (error) throw Error("Não foi possível consultar o autenticador.");
  const factors = data.totp.filter((x) => x.status === "verified");
  if (!factors.length) {
    shell(
      '<h1>Configure o autenticador</h1><p>Adicione esta conta ao 2FAS, Google Authenticator ou Microsoft Authenticator. O código QR é pessoal: não o compartilhe.</p><div id="qr"></div><details><summary>Não consegue ler o QR?</summary><code id="secret"></code></details><form id="mfa"><label>Código de 6 dígitos<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required></label><p id="auth-error" role="alert"></p><button type="submit" class="primary">Ativar e entrar</button></form><button id="cancel">Cancelar e sair</button>',
    );
    // Remove somente fatores TOTP não confirmados de configurações interrompidas.
    for (const f of data.all.filter(
      (x) => x.factor_type === "totp" && x.status === "unverified",
    ))
      await client.auth.mfa.unenroll({ factorId: f.id });
    const result = await client.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "A dois",
    });
    if (version !== authVersion) return;
    if (result.error) throw Error("Não foi possível preparar o autenticador.");
    factorId = result.data.id;
    // Gera imagem a partir da URI; não injeta SVG recebido de um serviço no DOM.
    const img = document.createElement("img");
    img.alt = "QR para configurar seu autenticador";
    img.src = await QRCode.toDataURL(result.data.totp.uri, {
      width: 220,
      margin: 1,
    });
    document.querySelector("#qr").append(img);
    document.querySelector("#secret").textContent = result.data.totp.secret;
  } else {
    factorId = factors[0].id;
    shell(
      '<h1>Confirme que é você</h1><p>Digite o código exibido no seu aplicativo autenticador.</p><form id="mfa"><label>Código de 6 dígitos<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required autofocus></label><p id="auth-error" role="alert"></p><button type="submit" class="primary">Verificar e entrar</button></form><button id="cancel">Cancelar e sair</button>',
    );
  }
  document.querySelector("#mfa").onsubmit = async (e) => {
    e.preventDefault();
    await attempt(e.target, async () => {
      const code = new FormData(e.target).get("code");
      const { error } = await client.auth.mfa.challengeAndVerify({
        factorId,
        code,
      });
      if (version !== authVersion) return;
      if (error)
        throw Error(
          "Código inválido ou expirado. Confira o relógio do celular e tente novamente.",
        );
      const check = await client.auth.mfa.getAuthenticatorAssuranceLevel();
      if (version !== authVersion) return;
      if (check.error || check.data.currentLevel !== "aal2")
        throw Error("A segunda etapa não foi confirmada.");
      const member = await client.from("app_members").select("slot").limit(1);
      if (version !== authVersion) return;
      if (member.error)
        throw Error("Não foi possível verificar a autorização desta conta.");
      if (!member.data.length) {
        await logout();
        throw Error("Esta conta não está autorizada.");
      }
      verified = true;
      touch();
      await ready();
    });
  };
}
export function isVerified() {
  return verified;
}
export async function logout() {
  verified = false;
  clearTimeout(idleTimer);
  failure?.();
  lock();
  try {
    await client?.auth.signOut({ scope: "local" });
  } finally {
    sessionStorage.removeItem("adois-auth-v2");
  }
}
function touch() {
  if (!verified) return;
  lastActivityAt = Date.now();
  clearTimeout(idleTimer);
  idleTimer = setTimeout(
    () => {
      logout();
    },
    15 * 60 * 1000,
  );
}
export async function startSecurity(onReady, onClear) {
  ready = onReady;
  failure = onClear;
  for (const event of ["pointerdown", "keydown", "touchstart"])
    window.addEventListener(event, touch, { passive: true });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) logout();
  });
  document.addEventListener("visibilitychange", () => {
    if (
      document.visibilityState === "visible" &&
      verified &&
      Date.now() - lastActivityAt >= 15 * 60 * 1000
    )
      logout();
  });
  client?.auth.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") {
      verified = false;
      failure?.();
      lock();
    }
  });
  // Toda abertura exige novo login. Nenhuma sessão antiga libera a interface automaticamente.
  if (client) await client.auth.signOut({ scope: "local" });
  lock();
}
export async function secureQuery(query) {
  const { data, error } = await query;
  if (error) {
    if (error.code === "42501" || error.status === 401) {
      await logout();
      throw Error("Sua sessão expirou. Entre novamente.");
    }
    throw Error(
      "Não foi possível salvar ou carregar os dados. Confira a conexão e tente novamente.",
    );
  }
  return data;
}
