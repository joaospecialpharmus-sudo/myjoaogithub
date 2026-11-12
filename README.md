# A dois — finanças da casa

Aplicativo responsivo para um casal, com painel financeiro, recebimentos, despesas, dívidas e histórico manual de propostas.

## Executar

Node.js 22.12+ (validado em 24.22), npm e projeto Supabase dedicado.

```sh
npm ci --cache /tmp/financas-npm
# Configure .env.local conforme .env.example; nunca inclua chave secreta.
npm run dev
```

Sem configuração, o aplicativo mostra uma tela bloqueada. Não existe acesso de demonstração que ignore o login.

## Ativar acesso privado

Siga [o guia de segurança](docs/seguranca.md). Execute [o schema e as políticas RLS](supabase/schema.sql) no SQL Editor, autorize somente os dois UUIDs, habilite TOTP e desative cadastro público. Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` no ambiente de build. A URL e chave publicável são públicas por projeto; as regras do banco exigem membro autorizado + JWT `aal2`.

## Funcionalidades

- Recebimentos/despesas em centavos, responsáveis (incluindo Larissa), categorias, datas e situação.
- Saldo realizado, previsão mensal e próximos vencimentos.
- Dívidas por credor e responsável, situação e observações.
- Histórico de propostas com total, parcelas, consulta, validade e comparação com valor de referência.
- Senha + autenticador TOTP, encerramento após inatividade na interface, logout, troca de senha e exportação com confirmação.
- Persistência no banco compartilhado entre os dois membros; atualização manual pelo botão **Atualizar**.

## Verificação e publicação

```sh
npm test
npm run test:e2e # requer Chromium; CHROMIUM_PATH ajusta o executável
npm run build
npm run preview
# Após validar configuração e segurança:
npm run deploy:pages
```

Os testes RLS rodam num PostgreSQL local via PGlite; os testes de navegador simulam Supabase. Login/MFA real, políticas do projeto, recuperação e sincronização entre aparelhos ainda precisam de validação depois da configuração. O build produz arquivos estáticos com CSP e `.nojekyll`, prontos para a branch `gh-pages` do GitHub Pages. Valores de `VITE_…` são públicos no bundle: use exclusivamente chave publicável/anon. O build rejeita chaves secretas reconhecidas.

## Limites

Sem integração automática Serasa, importação bancária/PDF, IA, saldo inicial, recorrências, notificações, PWA offline ou restauração de exportações. Propostas são registros manuais: confirme disponibilidade nos canais oficiais antes de negociar. Dívidas e propostas não geram despesas automaticamente; cadastre os pagamentos/parcelas para evitar duplicidade. Nenhum CPF, número de telefone ou senha do Serasa é necessário.

Não publique dados pessoais, arquivos `.env`, exportações ou credenciais no GitHub. Confira também [os componentes pesquisados](docs/componentes.md).
