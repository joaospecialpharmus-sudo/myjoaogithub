-- Execute no SQL Editor do SEU projeto Supabase. Não inclua e-mails, números ou UUIDs reais neste arquivo público.
-- Apenas dois usuários previamente convidados pelo administrador podem receber slots.
begin;
create table if not exists public.app_members (
  slot smallint primary key check (slot in (1,2)),
  user_id uuid not null unique references auth.users(id) on delete cascade
);
alter table public.app_members enable row level security;
revoke all on public.app_members from anon, authenticated;
grant select on public.app_members to authenticated;
create policy member_can_check_own_access on public.app_members for select to authenticated
using (user_id = (select auth.uid()) and (select auth.jwt()->>'aal') = 'aal2');

create table public.entries (
 id uuid primary key,
 name text not null check (length(name) between 1 and 100),
 type text not null check (type in ('income','expense')),
 cents bigint not null check (cents between 1 and 100000000000),
 date date not null,
 status text not null check (status in ('pending','done')),
 person text not null check (person in ('Eu','Larissa','Compartilhado')),
 category text not null check (length(category) between 1 and 60)
);
create table public.debts (
 id uuid primary key,
 creditor text not null check (length(creditor) between 1 and 100),
 original_cents bigint not null check (original_cents between 1 and 100000000000),
 person text not null check (person in ('Eu','Larissa','Compartilhado')),
 status text not null check (status in ('open','negotiated','paid')),
 notes text not null default '' check (length(notes)<=1000)
);
create table public.debt_offers (
 id uuid primary key,
 debt_id uuid not null references public.debts(id) on delete cascade,
 total_cents bigint not null check (total_cents between 1 and 100000000000),
 installments integer not null check (installments between 1 and 600),
 observed_on date not null,
 valid_until date,
 notes text not null default '' check (length(notes)<=1000),
 check (valid_until is null or valid_until >= observed_on)
);
-- AAL2 é verificado a cada operação, inclusive requisições diretas à API.
-- Nenhuma chave do navegador pode cadastrar membros ou contornar essas regras.
alter table public.entries enable row level security;
alter table public.debts enable row level security;
alter table public.debt_offers enable row level security;
revoke all on public.entries, public.debts, public.debt_offers from anon, authenticated;
grant select, insert, update, delete on public.entries, public.debts, public.debt_offers to authenticated;
create policy household_mfa_entries on public.entries for all to authenticated
using ((select auth.jwt()->>'aal')='aal2' and exists (select 1 from public.app_members where user_id=(select auth.uid())))
with check ((select auth.jwt()->>'aal')='aal2' and exists (select 1 from public.app_members where user_id=(select auth.uid())));
create policy household_mfa_debts on public.debts for all to authenticated
using ((select auth.jwt()->>'aal')='aal2' and exists (select 1 from public.app_members where user_id=(select auth.uid())))
with check ((select auth.jwt()->>'aal')='aal2' and exists (select 1 from public.app_members where user_id=(select auth.uid())));
create policy household_mfa_offers on public.debt_offers for all to authenticated
using ((select auth.jwt()->>'aal')='aal2' and exists (select 1 from public.app_members where user_id=(select auth.uid())))
with check ((select auth.jwt()->>'aal')='aal2' and exists (select 1 from public.app_members where user_id=(select auth.uid())));
commit;
-- Depois de convidar os dois usuários, cadastre seus UUIDs PRIVADAMENTE no painel:
-- insert into public.app_members(slot,user_id) values (1,'UUID_DO_PRIMEIRO'),(2,'UUID_DA_LARISSA');
-- Não salve o comando preenchido no GitHub.
