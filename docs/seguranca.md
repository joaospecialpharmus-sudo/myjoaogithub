# Ativação privada do A dois

## Estado atual

O código inclui senha + TOTP (aplicativo autenticador), autorização para até dois usuários, RLS no PostgreSQL, proteção de conteúdo no build e encerramento da interface após 15 minutos de inatividade. Sem configuração, a página fica bloqueada. Não há SMS ou acesso ao Serasa.

Os testes de autenticação usam respostas simuladas; as políticas foram executadas em PostgreSQL local via PGlite. Isso não valida configuração nem login no seu projeto real. Só use dados reais depois da validação descrita abaixo.

## 1. Banco e autorização

1. Crie um projeto Supabase dedicado ao casal, usando senha de banco exclusiva e região adequada.
2. Abra **SQL Editor → New query** e execute integralmente `supabase/schema.sql` uma vez. O script cria tabelas e políticas dentro de uma transação. Não execute em projeto que já tenha tabelas com os mesmos nomes sem revisar.
3. Em **Authentication → Sign In / Providers**, desative **Allow new users to sign up**. Desative provedores sociais e login anônimo que não for usar. Mantenha login por e-mail/senha; ninguém pode se cadastrar pelo app.
4. Em **Authentication → Multi-Factor Authentication**, habilite o fator TOTP. A localização exata do menu pode variar. Não habilite SMS.
5. Configure senha mínima de 14 caracteres, proteção de senhas vazadas se disponível e limites de tentativas de login/verificação no painel. Não aumente limites para contornar bloqueios.
6. Configure duração de JWT de aproximadamente 10 minutos (600 segundos), se suportada. Tokens já emitidos podem continuar válidos até expirar, mesmo após logout; a saída por inatividade no navegador não é um limite imposto pelo servidor. Use timeouts de sessão no serviço, se disponíveis no seu plano.
7. Em **Authentication → URL Configuration**, configure como Site URL o endereço HTTPS do app. Não adicione URLs de terceiros como redirecionamentos.
8. Em **Authentication → Users**, crie somente os dois usuários pelo painel administrativo, com e-mails verificados e senhas fortes entregues de forma privada. O app não implementa auto cadastro nem recuperação por e-mail. Nunca coloque senhas iniciais em SQL, commits ou chat.
9. Copie os dois UUIDs de usuário. No SQL Editor, execute PRIVADAMENTE: `insert into public.app_members(slot,user_id) values (1,'UUID_DO_PRIMEIRO'),(2,'UUID_DA_LARISSA');`. Substitua os marcadores e não publique o comando preenchido. Somente esses dois UUIDs poderão consultar os dados, mesmo que outras contas existam no Auth.

## 2. Conectar o site

Em **Project Settings → API Keys** copie a chave **Publishable** (`sb_publishable_…`) ou a antiga chave `anon`. Em **Data API**/Connect, copie a Project URL HTTPS.

São identificadores públicos do projeto. A proteção depende de RLS, e não de esconder esses identificadores. **Nunca use `service_role`, `sb_secret_…`, senha do banco ou tokens de administrador no frontend.**

Configure no ambiente de build (não no Git público):

- `VITE_SUPABASE_URL`: URL HTTPS do projeto.
- `VITE_SUPABASE_PUBLISHABLE_KEY`: chave publicável/anon.

Para desenvolvimento local, copie `.env.example` para `.env.local` (ignorado no Git) e preencha somente esses dois campos. Em produção, o build injeta a URL e chave publicável nos arquivos públicos, como previsto pelo Supabase. Execute `npm run build` novamente e `npm run deploy:pages` para publicar apenas `dist` na branch `gh-pages`. O script preserva o histórico e recusa artefatos de teste. Nenhuma conta ou dado financeiro vai no build.

Se o ambiente na nuvem tiver rede restrita, permita o hostname exato do projeto Supabase para validar as APIs. Não é preciso liberar todos os projetos Supabase.

## 3. Primeira entrada e recuperação

1. Cada pessoa entra com sua própria conta/senha e cadastra o QR no 2FAS, Google Authenticator ou Microsoft Authenticator.
2. Confirme o código para ativar o fator. A tela financeira só será carregada após TOTP e consulta à lista de membros. QR e chave TOTP nunca devem ser compartilhados por captura de tela/chat.
3. Configure backup criptografado no autenticador e guarde a chave de configuração em um gerenciador seguro durante a ativação. Não há códigos de recuperação gerados pelo app.
4. Se perder o autenticador, a recuperação é administrativa no Supabase, após confirmar a identidade do titular; revogue sessões e reconfigure o fator. Não há botão de pular MFA.
5. A conta administrativa do Supabase também deve ter MFA. Não compartilhe sua senha administrativa com os usuários do app.

## 4. Validar ANTES de dados reais

- Sem login, nenhuma linha das tabelas `entries`, `debts` e `debt_offers` pode ser lida ou alterada com a chave pública.
- Com login por senha e sem TOTP (JWT `aal1`), as mesmas operações devem ser negadas. Não basta a tela estar escondida.
- Uma conta sem linha em `app_members` continua bloqueada mesmo com JWT `aal2`.
- Os dois membros com JWT `aal2` conseguem cadastrar/consultar registros fictícios e vê-los nos dois aparelhos após clicar **Atualizar**. Não há atualização em tempo real implementada.
- Verifique código incorreto/expirado, logout e timeout. Use uma janela privada para confirmar que o login é exigido novamente.
- Use o Security Advisor do Supabase para verificar RLS e tabelas expostas. Mantenha os backups seguros e teste restauração conforme o plano do serviço.

## Dados, dispositivos e limites

Dados financeiros passam por HTTPS e ficam no banco privado, não no localStorage. Tokens de sessão ficam no sessionStorage, acessíveis ao JavaScript da mesma origem; não são cookies HttpOnly. Isso exige cuidado contínuo com XSS e dependências. O texto digitado é escapado antes de aparecer em HTML; QR é gerado localmente, sem injetar SVG recebido do serviço. Os dados são compartilhados somente entre os dois membros, não separados por pessoa no banco.

O build restringe scripts/estilos à mesma origem, conexões ao projeto Supabase e impede submissão de formulários externos. O Pages não permite definir todos os cabeçalhos HTTP de segurança; para proteção contra enquadramento por outros sites (`frame-ancestors`) e `Cache-Control: no-store` completo, use uma hospedagem que permita esses cabeçalhos. Não há promessa de invulnerabilidade nem criptografia ponta a ponta. Configure criptografia/backup do provedor e dispositivos protegidos.

A exportação JSON é um arquivo sem criptografia e exige confirmação. Não compartilhe esse arquivo. Dados da demonstração antiga (`adois-v1`) não são importados, enviados ou apagados automaticamente; o botão na tela de login permite apagar essa cópia antiga no aparelho. Remover dados do navegador não apaga backups externos.

CPF, credenciais bancárias/Serasa, cartões completos e boletos não são solicitados nesta versão. O PDF de fatura é selecionado e lido localmente com PDF.js; não é enviado ao servidor. Quando protegido, a senha é usada somente em memória no aparelho. Somente as linhas de compra selecionadas e confirmadas são enviadas à tabela entries, sob as mesmas regras RLS/AAL2. Nenhum texto completo da fatura vai a logs ou ao GitHub. As descrições extraídas podem conter informações pessoais: revise o que será salvo. A CSP permite o worker PDF.js na mesma origem; não são usados CDNs nem serviços externos de extração. Dívidas e propostas são inseridas manualmente; nenhuma oferta é confirmada automaticamente, aceita ou paga pelo app. Informações reais não devem ser salvas no repositório público.

## Leitura de imagens no aparelho

O OCR funciona com Tesseract.js e modelo de português distribuídos no mesmo site, sem enviar documentos a terceiros. Workers, modelos e motor WebAssembly são servidos em caminhos locais explícitos; a opção de worker por blob é desativada e não há cache de resultados OCR em IndexedDB. A política inclui `wasm-unsafe-eval` apenas para permitir o motor WebAssembly e mantém scripts externos bloqueados. O fechamento da revisão ou o logout cancela o processamento; canvases e workers são liberados ao terminar. O reconhecimento não concede acesso a dados sem a mesma autenticação e RLS.
