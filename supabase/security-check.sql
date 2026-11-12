-- SOMENTE LEITURA. Execute no SQL Editor do projeto Supabase.
-- Retorna verificações e expressões das políticas, sem nomes pessoais, UUIDs, senhas ou dados financeiros.
with expected(tablename,policyname,command) as (
 values ('app_members','member_can_check_own_access','SELECT'),
        ('entries','household_mfa_entries','ALL'),
        ('debts','household_mfa_debts','ALL'),
        ('debt_offers','household_mfa_offers','ALL')
), tables as (
 select c.oid,c.relname,c.relrowsecurity
 from pg_class c join pg_namespace n on n.oid=c.relnamespace
 where n.nspname='public' and c.relname in ('app_members','entries','debts','debt_offers')
), policies as (
 select p.* from pg_policies p where p.schemaname='public' and p.tablename in ('app_members','entries','debts','debt_offers')
), checks as (
select 'duas_contas_autorizadas' as verificacao, (select count(*)=2 from public.app_members) as ok
union all
select 'autenticador_ativo_nas_duas_contas',
 (select count(*)=2 from public.app_members m where exists (select 1 from auth.mfa_factors f where f.user_id=m.user_id and f.factor_type='totp' and f.status='verified'))
union all
select 'rls_ativo_nas_quatro_tabelas', (select count(*)=4 and coalesce(bool_and(relrowsecurity),false) from tables)
union all
select 'sem_permissoes_anonimas_nas_tabelas', (select count(*)=4 and not coalesce(bool_or(has_table_privilege('anon',oid,'SELECT,INSERT,UPDATE,DELETE')),true) from tables)
union all
select 'cliente_nao_altera_lista_de_autorizados',
 not has_table_privilege('authenticated','public.app_members','INSERT,UPDATE,DELETE')
union all
select 'somente_politicas_esperadas',
 (select count(*)=4 from policies) and not exists (
   select 1 from policies p left join expected e on e.tablename=p.tablename and e.policyname=p.policyname
   where e.policyname is null or p.cmd<>e.command or p.roles<>array['authenticated']::name[]
 )
union all
select 'politicas_referenciam_usuario_e_segundo_fator',
 (select count(*)=4 and coalesce(bool_and(
   position('aal2' in qual)>0 and position('auth.uid' in qual)>0
   and (tablename='app_members' or (position('app_members' in qual)>0 and position('aal2' in with_check)>0 and position('auth.uid' in with_check)>0 and position('app_members' in with_check)>0))
 ),false) from policies)
)
select verificacao,ok,null::jsonb as detalhes from checks
union all
select 'expressoes_das_politicas',null::boolean,
 jsonb_agg(jsonb_build_object('tabela',tablename,'politica',policyname,'comando',cmd,'roles',roles,'leitura',qual,'gravacao',with_check) order by tablename,policyname)
from policies;
