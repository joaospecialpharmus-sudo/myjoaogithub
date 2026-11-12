# A dois — finanças da casa

Aplicativo responsivo para um casal, com recebimentos, despesas, resumo dos cartões, dívidas e histórico manual de propostas.

## Executar

Node.js 22.12+ (validado em 24.22), npm e projeto Supabase dedicado.

```sh
npm ci --cache /tmp/financas-npm
# Configure .env.local conforme .env.example; nunca inclua chave secreta.
npm run dev
```

Sem configuração, o app permanece bloqueado. Leia [o guia de segurança](docs/seguranca.md) para configurar senha + TOTP, cadastro fechado, as duas contas e políticas RLS. Execute [o schema](supabase/schema.sql) uma vez no projeto. Use somente `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` no build; nunca `service_role` ou `sb_secret_…`.

## Importar e editar

1. Entre com senha e autenticador e clique em **Importar fatura PDF**.
2. Escolha arquivo, banco, responsável, mês e vencimento; clique em **Ler PDF neste aparelho**.
3. Edite descrição, data, categoria ou valor das compras se precisar. Desmarque o que não quiser importar e clique em **Salvar compras selecionadas**.
4. Para corrigir depois de salvar, use **Editar valor** em Movimentações ou na lista de compras da aba **Cartões**. O resumo é recalculado após salvar e a alteração permanece no banco.

Não é necessário informar totais da fatura ou do boleto, conciliar diferenças, nem preencher uma confirmação extra. A soma exibida serve apenas para acompanhar as compras selecionadas e não bloqueia a gravação por divergir do PDF. Valores devem ser positivos e os campos de cada compra selecionada precisam ser válidos.

A mesma linha do mesmo PDF mantém seu identificador e não é reimportada, preservando correções feitas depois de salvar. Possíveis duplicatas exatas entre arquivos são sinalizadas e vêm desmarcadas; podem ser selecionadas quando forem compras distintas. Não há agrupamento por semelhança: datas ou valores diferentes e ocorrências distintas permanecem separados. A proteção entre PDFs reexportados é heurística e não garante identificar toda repetição.

O app tenta separar compras de boleto, pagamentos, resumos e projeções futuras. Linhas que não forem reconhecidas ficam numa lista opcional, com inclusão manual quando apropriada. Também é possível adicionar uma compra que faltou. O leitor não cria valores para completar diferenças nem altera lançamentos antigos automaticamente.

## Leitura e privacidade

PDF.js extrai texto no próprio aparelho. Páginas sem texto recebem OCR local em português com Tesseract.js. Se nenhuma compra for reconhecida no texto, o app tenta OCR; a opção **Ler como imagem (OCR)** também permite forçá-lo. O progresso é mostrado por página. OCR pode errar letras, datas e valores; revise as compras antes de salvar.

Nenhum arquivo, senha ou texto completo é enviado ao Supabase ou a um serviço de OCR. Somente as compras selecionadas são gravadas após sua ação. PDFs protegidos pedem a senha somente no aparelho. O arquivo original não é armazenado como anexo no banco. Limites: 15 MB, 60 páginas de texto, 20 páginas para OCR e 500 compras candidatas.

O motor OCR e o modelo de português são servidos pelo próprio site, sem CDN. `scripts/prepare-ocr.mjs` prepara `public/ocr` (ignorado no Git); `predev` e o build executam a preparação. Workers e canvases são liberados ao encerrar. A política de conteúdo permite WebAssembly com `wasm-unsafe-eval`, mantendo JavaScript externo e `unsafe-eval` bloqueados. A primeira leitura pode carregar recursos maiores e o tempo varia por aparelho.

Datas compactas em português e cabeçalhos do C6 são reconhecidos. A leitura tenta separar colunas e recompor linhas pela posição do texto. Isso não é integração oficial com bancos e não garante todos os layouts. Os testes públicos usam documentos sintéticos. PDFs privados, resultados de OCR e capturas de usuários nunca devem ser incluídos no repositório.

## Resumos e outras funções

- Recebimentos e despesas em centavos, responsáveis (incluindo Larissa), categorias, datas e situação.
- Saldo realizado, previsão do mês e próximos vencimentos.
- Aba **Cartões** com compras brutas, filtros por banco/responsável/mês de vencimento e categorias. Cartões do mesmo banco e responsável ficam no mesmo grupo.
- Dívidas por credor, situação e observações; propostas com valor total, parcelas, consulta e validade, inseridas manualmente.
- Saída por inatividade na interface, logout, troca de senha e exportação JSON com confirmação.

Compras brutas não são necessariamente o saldo a pagar do boleto. Pagamentos, estornos e saldos anteriores ainda não são conciliados automaticamente. Não cadastre o pagamento integral da fatura como outra despesa junto com suas compras. A data financeira usada na importação é o vencimento informado; a data original fica na descrição. Parcelas futuras não são geradas automaticamente.

## Verificação e publicação

```sh
npm test
npm run test:e2e # requer Chromium; CHROMIUM_PATH ajusta o executável
npm run build
npm run preview
# Após verificar o resultado:
npm run deploy:pages
```

Testes RLS usam PostgreSQL local/PGlite; testes públicos de navegador simulam Supabase. A configuração real de autorização continua precisando ser verificada no projeto antes de dados reais. O deploy publica somente arquivos estáticos e recursos OCR na branch `gh-pages`, preservando seu histórico. Variáveis `VITE_…` são públicas no bundle: somente URL e chave publicável/anon são permitidas. O build rejeita chaves secretas reconhecidas. Licenças de dependências seguem no artefato `THIRD_PARTY_NOTICES.txt`.

Sem consulta automática ao Serasa, integração bancária automática, IA, saldo inicial, recorrências, notificações, PWA offline ou restauração de exportações. Consulte [os componentes pesquisados](docs/componentes.md). Não publique arquivos `.env`, exportações, senhas ou documentos financeiros no GitHub.

## Instalar no celular

A versão PWA pode ser adicionada à tela inicial e abre em janela própria, com o mesmo login e autenticador.

- iPhone: abra o site no Safari → Compartilhar → Adicionar à Tela de Início.
- Android: abra no Chrome → menu ⋮ → Instalar aplicativo ou Adicionar à tela inicial. O botão **Instalar app** também oferece o fluxo nativo quando o navegador disponibiliza.

O app requer internet para os dados financeiros. O service worker não usa Cache Storage nem guarda respostas de API, documentos ou tokens. Ao navegar sem conexão, mostra somente uma página genérica sem dados. O SDK Supabase faz requisições com `cache: no-store`; restaurar uma página do histórico volta ao login. O logout por inatividade também confere o tempo decorrido ao retornar de uma aba em segundo plano.

`public/manifest.webmanifest`, `public/icons` e `public/sw.js` compõem a instalação. A versão distribuída continua sendo um app web instalável; não há publicação em App Store ou Play Store.

## Conferir segurança do projeto em produção

A tela de login e o código público não contêm dados financeiros. A restrição dos dados depende das políticas RLS e das duas contas realmente configuradas no Supabase. O administrador do projeto tem privilégios adicionais; sua conta administrativa também precisa ser protegida por MFA.

O arquivo [supabase/security-check.sql](supabase/security-check.sql) executa somente leituras e retorna verificações de configuração e expressões completas das políticas, sem nomes pessoais, UUIDs ou valores financeiros. Execute no SQL Editor e revise os indicadores e as expressões. Os indicadores são uma triagem; não constituem garantia absoluta nem substituem os testes de requisições anon, aal1 e não membros no serviço real. Testes locais e mocks não comprovam a configuração do projeto publicado.
