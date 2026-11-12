import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const u1 = "00000000-0000-4000-8000-000000000001",
  u2 = "00000000-0000-4000-8000-000000000002",
  u3 = "00000000-0000-4000-8000-000000000003";
const row =
  "('10000000-0000-4000-8000-000000000001','Teste','income',10000,'2026-11-01','done','Larissa','Salário')";
test("RLS exige membro autorizado E segundo fator em leituras e escritas", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);insert into auth.users values('${u1}'),('${u2}'),('${u3}');create function auth.uid() returns uuid language sql stable as $$ select (current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid $$;create function auth.jwt() returns jsonb language sql stable as $$ select current_setting('request.jwt.claims',true)::jsonb $$;grant usage on schema auth to anon,authenticated;`,
    );
    await db.exec(
      await readFile(
        new URL("../supabase/schema.sql", import.meta.url),
        "utf8",
      ),
    );
    await db.exec(`insert into app_members values(1,'${u1}'),(2,'${u2}');`);
    await assert.rejects(db.exec(`insert into app_members values(3,'${u3}')`));
    const login = async (user, aal, role = "authenticated") => {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claims',$1,false)", [
        JSON.stringify({ sub: user, aal }),
      ]);
      await db.exec(`set role ${role}`);
    };
    await login(u1, "aal1", "anon");
    await assert.rejects(db.exec("select * from entries"));
    await login(u1, "aal1");
    assert.equal((await db.query("select * from entries")).rows.length, 0);
    await assert.rejects(db.exec(`insert into entries values${row}`));
    await login(u3, "aal2");
    await assert.rejects(db.exec(`insert into entries values${row}`));
    assert.equal((await db.query("select * from app_members")).rows.length, 0);
    await login(u1, "aal2");
    await db.exec(`insert into entries values${row}`);
    assert.equal((await db.query("select * from entries")).rows.length, 1);
    await db.exec(
      "insert into debts values('20000000-0000-4000-8000-000000000001','Credor teste',100000,'Larissa','open','');insert into debt_offers values('30000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',40000,4,'2026-11-01','2026-11-30','');",
    );
    await login(u2, "aal2");
    assert.equal((await db.query("select * from entries")).rows.length, 1);
    assert.equal((await db.query("select * from debts")).rows.length, 1);
    assert.equal((await db.query("select * from debt_offers")).rows.length, 1);
    await assert.rejects(db.exec(`insert into app_members values(1,'${u3}')`));
    for (const [user, aal] of [
      [u1, "aal1"],
      [u3, "aal2"],
    ]) {
      await login(user, aal);
      for (const table of ["entries", "debts", "debt_offers"]) {
        assert.equal((await db.query(`select * from ${table}`)).rows.length, 0);
        await db.exec(`delete from ${table}`);
      }
      await assert.rejects(
        db.exec(
          "insert into debts values('20000000-0000-4000-8000-000000000002','Intruso',1,'Eu','open','')",
        ),
      );
      await assert.rejects(
        db.exec(
          "insert into debt_offers values('30000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001',1,1,'2026-11-01',null,'')",
        ),
      );
    }
    await login(u1, "aal2");
    assert.equal((await db.query("select * from entries")).rows.length, 1);
    await db.exec("delete from debts");
    assert.equal((await db.query("select * from debt_offers")).rows.length, 0);
    await db.exec("reset role");
    await db.exec(
      `create table auth.mfa_factors(user_id uuid,factor_type text,status text);insert into auth.mfa_factors values('${u1}','totp','verified'),('${u2}','totp','verified');`,
    );
    const report = await readFile(
      new URL("../supabase/security-check.sql", import.meta.url),
      "utf8",
    );
    const checks = await db.query(report);
    assert.equal(checks.rows.length, 8);
    assert.ok(
      checks.rows
        .filter((row) => row.ok !== null)
        .every((row) => row.ok === true),
    );
    await db.exec(
      "create policy unexpected_access on public.entries for select to authenticated using(true)",
    );
    const invalid = await db.query(report);
    assert.equal(
      invalid.rows.find((r) => r.verificacao === "somente_politicas_esperadas")
        .ok,
      false,
    );
  } finally {
    await db.close();
  }
});
