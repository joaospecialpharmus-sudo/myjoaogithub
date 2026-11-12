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

Sem integração automática Serasa, integração bancária automática, IA, saldo inicial, recorrências, notificações, PWA offline ou restauração de exportações. Propostas são registros manuais: confirme disponibilidade nos canais oficiais antes de negociar. Dívidas e propostas não geram despesas automaticamente; cadastre os pagamentos/parcelas para evitar duplicidade. Nenhum CPF, número de telefone ou senha do Serasa é necessário.

Não publique dados pessoais, arquivos `.env`, exportações ou credenciais no GitHub. Confira também [os componentes pesquisados](docs/componentes.md).

## Importar faturas PDF

Após entrar com MFA, clique em **Importar fatura PDF**, selecione o arquivo, banco, responsável, mês e vencimento. A leitura ocorre no navegador com PDF.js. Revise descrições, valores e categorias; desmarque o que não deseja importar e confirme antes de salvar. O banco recebe somente as linhas selecionadas, nunca o PDF, senha ou texto completo. Não há mudança de schema necessária.

Esta é uma extração inicial por linhas com data e um valor em reais, não uma integração oficial dos bancos. Reconhece datas numéricas e meses em português, mas ainda não foi validada com faturas reais do C6, Itaú, Nubank ou Caixa. Alguns layouts com colunas, texto quebrado, moedas estrangeiras e outros formatos ainda podem não ser reconhecidos. As linhas rejeitadas têm revisão manual, conforme abaixo. PDFs somente com imagens precisam de OCR, ainda não implementado. Limites: 15 MB, 60 páginas e 500 compras candidatas. PDF protegido solicita a senha somente no aparelho.

A data financeira das compras é o vencimento informado; a data original fica na descrição. Parcelas presentes no PDF entram como linhas individuais; não são geradas parcelas futuras. Créditos/estornos e pagamentos não são importados automaticamente. Confira o resultado com a fatura, incluindo esses ajustes. Não cadastre o pagamento integral da fatura junto com suas compras como outra despesa.

A mesma linha do mesmo arquivo usa ID estável e não é inserida novamente; PDFs reexportados podem mudar e a detecção entre arquivos é apenas uma sugestão por descrição, valor, data e responsável. Compras legítimas iguais podem ser sinalizadas: revise antes de confirmar. Testes de PDF usam somente documentos sintéticos (inclusive fixture com senha), nunca documentos pessoais no GitHub.

## Resumo dos cartões e revisão de linhas não reconhecidas

A aba **Cartões** inclui compras já importadas no formato de descrição atual, com banco e data original. Filtre por banco, responsável e **mês de vencimento**. O resumo mostra quantidade de compras, valores registrados/pagos/pendentes, detalhamento de cada compra e categorias. É um resumo dos registros, não uma confirmação do valor total oficial da fatura. Mais de um cartão do mesmo banco e responsável é consolidado no mesmo grupo. Categorias refletem o que foi escolhido na revisão, sem classificação automática.

O leitor recupera alguns formatos com duas compras na mesma linha, descrição/valor em linhas consecutivas, parcelas depois do valor e conversão estrangeira quando o valor em R$ é explícito e único. Linhas ambíguas não são adivinhadas: abra **Ver linhas não importadas automaticamente**, confira o motivo e use **Revisar e incluir como compra**. É possível corrigir data, descrição, valor e categoria antes de salvar. Também há **Adicionar compra que faltou** para compras que nem apareceram na extração. Os trechos para revisão permanecem no aparelho; só os campos das compras confirmadas vão ao banco.

Não há agrupamento por semelhança: datas distintas, centavos diferentes e compras repetidas em linhas diferentes são preservadas. A sugestão de duplicata entre PDFs compara data original, descrição, valor exato e responsável, por ocorrência, e pode ser confirmada como compra distinta. A mesma linha do mesmo PDF mantém o identificador anterior para proteger a reimportação. Mudanças no arquivo ou na disposição do texto continuam exigindo revisão. Os testes usam somente faturas fictícias; a imagem enviada pelo usuário não permite confirmar a recuperação de todas as linhas da fatura real.
