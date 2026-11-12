import { test, expect } from "@playwright/test";
const id = "00000000-0000-4000-8000-000000000001";
function token(aal) {
  const encode = (x) => Buffer.from(JSON.stringify(x)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: id, aal, exp: Math.floor(Date.now() / 1000) + 600, amr: [{ method: "password", timestamp: Math.floor(Date.now() / 1000) }] })}.test`;
}
function session(aal) {
  return {
    access_token: token(aal),
    refresh_token: "fake-refresh-token",
    expires_in: 600,
    token_type: "bearer",
    user: {
      id,
      aud: "authenticated",
      role: "authenticated",
      email: "example@example.invalid",
      factors: [
        {
          id: "factor1",
          factor_type: "totp",
          status: "verified",
          friendly_name: "A dois",
        },
      ],
    },
  };
}
async function setup(page, { member = true, badCode = false } = {}) {
  const requests = [];
  const entries = [];
  const debts = [];
  const offers = [];
  await page.route("https://test-project.supabase.co/**", async (route) => {
    const r = route.request(),
      url = new URL(r.url()),
      path = url.pathname;
    requests.push(path);
    const json = (body, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
        },
        body: JSON.stringify(body),
      });
    if (r.method() === "OPTIONS") return json({});
    if (path.endsWith("/token")) return json(session("aal1"));
    if (path.endsWith("/user")) return json(session("aal1").user);
    if (path.endsWith("/logout")) return json({});
    if (path.endsWith("/challenge"))
      return json({
        id: "challenge1",
        expires_at: Math.floor(Date.now() / 1000) + 60,
      });
    if (path.endsWith("/verify"))
      return badCode
        ? json({ msg: "Invalid code", code: "mfa_verification_failed" }, 422)
        : json(session("aal2"));
    if (path.endsWith("/app_members")) return json(member ? [{ slot: 1 }] : []);
    for (const [table, rows] of [
      ["entries", entries],
      ["debts", debts],
      ["debt_offers", offers],
    ])
      if (path.endsWith("/" + table)) {
        if (r.method() === "POST") {
          rows.push(r.postDataJSON());
          return json(null, 201);
        }
        return json(rows);
      }
    return json({ message: "Unmocked endpoint" }, 500);
  });
  return requests;
}
async function password(page) {
  await page.goto("/");
  await page.getByLabel("E-mail").fill("example@example.invalid");
  await page
    .getByLabel("Senha", { exact: true })
    .fill("a very long test password");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Confirme que é você" }),
  ).toBeVisible();
}
async function otp(page) {
  await page.getByLabel("Código de 6 dígitos").fill("123456");
  await page.getByRole("button", { name: "Verificar e entrar" }).click();
}
test("sem código válido não consulta nem mostra dados", async ({ page }) => {
  const paths = await setup(page, { badCode: true });
  await password(page);
  expect(paths.some((p) => p.startsWith("/rest/"))).toBe(false);
  await otp(page);
  await expect(page.getByRole("alert")).toContainText("Código inválido");
  expect(paths.some((p) => p.startsWith("/rest/"))).toBe(false);
});
test("usuário fora da lista não obtém dados mesmo após MFA", async ({
  page,
}) => {
  const paths = await setup(page, { member: false });
  await password(page);
  await otp(page);
  await expect(
    page.getByRole("heading", { name: "Entrar com segurança" }),
  ).toBeVisible();
  expect(paths.some((p) => p.endsWith("/entries"))).toBe(false);
});
test("MFA permite cadastrar dívida e proposta de Larissa; sair remove painel", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await password(page);
  await otp(page);
  await expect(
    page.getByRole("heading", { name: "Visão do mês" }),
  ).toBeVisible();
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Dívidas", exact: true })
    .click();
  await page.getByRole("button", { name: "+ Cadastrar dívida" }).click();
  await page
    .getByLabel("Credor", { exact: true })
    .fill("<img src=x onerror=alert(1)>");
  await page.getByLabel("Valor total de referência (R$)").fill("1000");
  await page.locator("#debt-dialog [name=person]").selectOption("Larissa");
  await page.getByRole("button", { name: "Salvar dívida" }).click();
  await expect(page.locator(".debt-card h3")).toHaveText(
    "<img src=x onerror=alert(1)>",
  );
  await expect(page.locator(".debt-card img")).toHaveCount(0);
  await expect(page.locator(".debt-card")).toContainText("Larissa");
  await page.getByRole("button", { name: "+ Registrar proposta" }).click();
  await page.getByLabel("Valor total proposto (R$)").fill("400");
  await page.getByRole("button", { name: "Salvar proposta" }).click();
  await expect(page.locator(".offer")).toContainText("60%");
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Sair", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Entrar com segurança" }),
  ).toBeVisible();
  await expect(page.locator(".debt-card")).toHaveCount(0);
});
test("primeira configuração gera QR local e só libera acesso após validar TOTP", async ({
  page,
}) => {
  await setup(page);
  await page.route("**/auth/v1/user", (route) =>
    route.fulfill({
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ ...session("aal1").user, factors: [] }),
    }),
  );
  await page.route("**/auth/v1/factors", (route) =>
    route.fulfill({
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({
        id: "factor1",
        type: "totp",
        totp: {
          uri: "otpauth://totp/A%20dois:test?secret=JBSWY3DPEHPK3PXP&issuer=A%20dois",
          secret: "JBSWY3DPEHPK3PXP",
        },
      }),
    }),
  );
  await page.goto("/");
  await page.getByLabel("E-mail").fill("example@example.invalid");
  await page
    .getByLabel("Senha", { exact: true })
    .fill("a very long test password");
  await page.getByRole("button", { name: "Continuar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Configure o autenticador" }),
  ).toBeVisible();
  await expect(
    page.getByAltText("QR para configurar seu autenticador"),
  ).toHaveAttribute("src", /^data:image\/png;base64,/);
  await page.getByLabel("Código de 6 dígitos").fill("123456");
  await page.getByRole("button", { name: "Ativar e entrar" }).click();
  await expect(
    page.getByRole("heading", { name: "Visão do mês" }),
  ).toBeVisible();
});
