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
          const body = r.postDataJSON();
          for (const row of Array.isArray(body) ? body : [body])
            if (!rows.some((x) => x.id === row.id)) rows.push(row);
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
// PDF sintético sem dados reais; usa texto posicionado para exercitar o leitor PDF.js.
function statementPdf(lines) {
  const text = lines
    .map(
      (line, i) =>
        `${i ? "0 -20 Td\n" : ""}(${line.replace(/[\\()]/g, "\\$&")}) Tj`,
    )
    .join("\n");
  const content = `BT /F1 12 Tf 50 760 Td\n${text}\nET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((x) => `${String(x).padStart(10, "0")} 00000 n \n`)
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf);
}
async function upload(page, buffer) {
  await page
    .getByRole("button", { name: "Importar fatura PDF", exact: true })
    .click();
  const dialog = page.locator(".import-dialog");
  await dialog.getByLabel("Fatura em PDF (até 15 MB)").setInputFiles({
    name: "fatura-ficticia.pdf",
    mimeType: "application/pdf",
    buffer,
  });
  await dialog.locator("[name=bank]").selectOption("Nubank");
  await dialog.locator("[name=person]").selectOption("Larissa");
  await dialog.locator("[name=month]").fill("2026-01");
  await dialog.getByLabel("Vencimento da fatura").fill("2026-01-20");
  await dialog.getByRole("button", { name: "Ler PDF neste aparelho" }).click();
  return dialog;
}
test("PDF real é lido localmente, revisado, salvo em lote e não reimportado", async ({
  page,
}) => {
  await setup(page);
  const writes = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/rest/v1/"))
      writes.push(r.postDataJSON());
  });
  await password(page);
  await otp(page);
  const buffer = statementPdf([
    "Fatura ficticia",
    "05/01 MERCADO 123,45",
    "06/01 FARMACIA 20,00",
    "07/01 ESTORNO -10,00",
    "Total 143,45",
  ]);
  const dialog = await upload(page, buffer);
  await expect(dialog.locator(".import-row")).toHaveCount(2);
  await expect(dialog.locator("#import-total")).toContainText("143,45");
  expect(writes).toHaveLength(0);
  await dialog
    .locator(".import-row")
    .first()
    .locator("[name=category]")
    .selectOption("Alimentação");
  await dialog
    .getByLabel("Conferi as compras selecionadas", { exact: false })
    .check();
  await dialog
    .getByRole("button", { name: "Salvar compras selecionadas" })
    .click();
  await expect(page.locator(".import-dialog")).toHaveCount(0);
  expect(writes).toHaveLength(1);
  expect(writes[0]).toHaveLength(2);
  expect(writes[0][0]).toMatchObject({
    person: "Larissa",
    cents: 12345,
    date: "2026-01-20",
    status: "pending",
    category: "Alimentação",
  });
  expect(JSON.stringify(writes)).not.toContain("Fatura ficticia");
  await expect(page.locator("#transactions")).toContainText("MERCADO");
  const again = await upload(page, buffer);
  await expect(
    again.getByText("Já importada deste PDF", { exact: false }),
  ).toHaveCount(2);
  await expect(again.locator("[name=include]:checked")).toHaveCount(0);
  expect(writes).toHaveLength(1);
});
test("PDF sem texto não vira gastos nem envia arquivo; cancelar revisão não salva", async ({
  page,
}) => {
  await setup(page);
  const writes = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/rest/v1/"))
      writes.push(r.url());
  });
  await password(page);
  await otp(page);
  const empty = await upload(page, statementPdf([]));
  await expect(empty.locator("#import-error")).toContainText("OCR");
  expect(writes).toHaveLength(0);
  await empty.getByRole("button", { name: "Fechar importação" }).click();
  const dialog = await upload(page, statementPdf(["05/01 MERCADO 12,00"]));
  await expect(dialog.locator(".import-row")).toHaveCount(1);
  await dialog.getByRole("button", { name: "Fechar importação" }).click();
  expect(writes).toHaveLength(0);
});
test("PDF com senha é aberto no aparelho e a senha não aparece nas requisições", async ({
  page,
}) => {
  const { readFile } = await import("node:fs/promises");
  const fixture = JSON.parse(
    await readFile(
      new URL("./fixtures/locked-pdf.json", import.meta.url),
      "utf8",
    ),
  );
  await setup(page);
  const payloads = [];
  page.on("request", (r) => {
    if (r.postData()) payloads.push(r.postData());
  });
  await password(page);
  await otp(page);
  page.once("dialog", (d) => d.accept("senha-ficticia-apenas-teste"));
  const dialog = await upload(page, Buffer.from(fixture.base64, "base64"));
  await expect(dialog.locator(".import-row")).toHaveCount(1);
  expect(payloads.join("\n")).not.toContain("senha-ficticia-apenas-teste");
  await dialog.getByRole("button", { name: "Fechar importação" }).click();
});
test("corridas parecidas são preservadas, linha ignorada pode ser corrigida e aba Cartões resume todas", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  const writes = [];
  page.on("request", (r) => {
    if (r.method() === "POST" && r.url().includes("/rest/v1/entries"))
      writes.push(r.postDataJSON());
  });
  await password(page);
  await otp(page);
  const dialog = await upload(
    page,
    statementPdf([
      "05/01 DL*Uber 11,95",
      "06/01 DL*Uber 11,95",
      "06/01 DL*Uber 11,96",
      "07/01 LOJA 5,00 8,00",
    ]),
  );
  await expect(dialog.locator(".import-row")).toHaveCount(3);
  await expect(dialog.locator("[name=include]:checked")).toHaveCount(3);
  await dialog.getByText("Ver 1 linhas não importadas automaticamente").click();
  await expect(dialog.locator(".ignored-line")).toContainText(
    "Mais de um valor",
  );
  await dialog
    .getByRole("button", { name: "Revisar e incluir como compra" })
    .click();
  const manual = dialog.locator(".import-row").last();
  await manual.getByLabel("Descrição", { exact: true }).fill("LOJA CORRIGIDA");
  await manual.getByLabel("Valor (R$)", { exact: true }).fill("8");
  await expect(dialog.locator("#import-total")).toContainText("43,86");
  expect(writes).toHaveLength(0);
  await dialog
    .getByLabel("Conferi as compras selecionadas", { exact: false })
    .check();
  await dialog
    .getByRole("button", { name: "Salvar compras selecionadas" })
    .click();
  await expect(page.locator(".import-dialog")).toHaveCount(0);
  expect(writes[0]).toHaveLength(4);
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Cartões", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Resumo dos cartões" }),
  ).toBeVisible();
  await expect(page.locator(".cards article").first()).toContainText("43,86");
  await expect(page.locator(".cards article").nth(1).locator("h2")).toHaveText(
    "4",
  );
  await page.getByText("Ver compras deste cartão", { exact: true }).click();
  await expect(page.locator(".card-summary tbody tr")).toHaveCount(4);
  await expect(page.locator(".summary-note")).toContainText("resumo parcial");
  await page.locator("#card-bank").selectOption("Itaú");
  await expect(
    page.getByText("Nenhuma compra de cartão neste filtro"),
  ).toBeVisible();
  await page.locator("#card-bank").selectOption("Nubank");
  await page.locator("#card-person").selectOption("Eu");
  await expect(
    page.getByText("Nenhuma compra de cartão neste filtro"),
  ).toBeVisible();
  await page.locator("#card-person").selectOption("Larissa");
  await expect(page.locator(".cards article").nth(1).locator("h2")).toHaveText(
    "4",
  );
});
