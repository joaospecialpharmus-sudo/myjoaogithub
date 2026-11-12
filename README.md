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

Não há agrupamento por semelhança: datas distintas, centavos diferentes e compras repetidas em linhas diferentes são preservadas. A sugestão de duplicata entre PDFs compara data original, descrição, valor exato e responsável, por ocorrência, e pode ser confirmada como compra distinta. A mesma linha do mesmo PDF mantém o identificador anterior para proteger a reimportação. Mudanças no arquivo ou na disposição do texto continuam exigindo revisão. Os testes usam somente faturas fictícias e não substituem a conferência dos arquivos reais dos bancos.

## Conferência antes de gravar uma fatura

A revisão exige informar o **Total de lançamentos/compras no PDF (R$)**, conforme o quadro de compras, não o valor do boleto nem o limite utilizado. O campo opcional **Valor a pagar no boleto** é mostrado separadamente, pois pagamentos, créditos e saldo anterior podem fazer esse valor divergir das compras. Ela mostra, em centavos, os registros já salvos para o mesmo banco, responsável e vencimento, as novas compras e a diferença para o total informado. Se a soma não conferir, a tentativa não grava nada. Antes do envio, o app relê os registros para conferir novamente; reimportar o mesmo ID não soma duas vezes. Os valores de referência são usados apenas na conferência atual, não são salvos como metadados da fatura. Essa é uma proteção da interface, não uma regra transacional do banco: não substitui revisão, nem impede integralmente gravações concorrentes por clientes diferentes.

Seções explicitamente intituladas **Compras parceladas — próximas faturas** e equivalentes saem das compras candidatas e aparecem nas linhas para revisão. O índice original é preservado para evitar duplicar linhas já importadas. A identificação depende dos cabeçalhos e da extração do PDF; colunas misturadas e layouts não reconhecidos ainda exigem conferência manual. Sem o documento real, não se pode atribuir uma divergência específica somente a esse defeito.

Se houver diferença, não remova uma compra legítima só para fazer a soma bater e não trate o pagamento integral da fatura como outra compra. Confira se foram incluídos resumos, projeções futuras ou registros já salvos; também confira encargos e créditos. **Estornos e créditos ainda não são aplicados automaticamente**: nessas faturas, a conferência pode bloquear a importação por não haver suporte completo aos ajustes. Não há correção automática dos registros antigos nem mudança silenciosa de valores. Mais de um cartão do mesmo banco e responsável com o mesmo vencimento compartilha a conferência atual; ainda não há identificador separado por cartão físico.

### Campos do boleto não são compras

O leitor rejeita campos identificáveis do boleto (por exemplo, “Uso do Banco”, “Nosso Número”, “Ficha de Compensação” e “Linha Digitável”), mesmo que a linha comece com data e termine com o valor a pagar. Esses campos não podem ser recuperados como compras pela revisão e seus dados bancários são omitidos na lista de rejeições. Reconhecer campos por texto não equivale a validar todos os layouts de boleto; a conferência com o total de lançamentos continua necessária.

Possíveis encargos monetários sem data, com rótulos claros como juros, IOF ou anuidade, aparecem para confirmação manual com valor sugerido. Percentuais não viram valores de despesa. O usuário deve confirmar a origem e informar uma data antes de incluir o encargo. O app não cria valores para fechar diferenças e não modifica compras legítimas. Os testes usam somente referências e valores fictícios, sem reproduzir dados bancários ou compras de usuários.

Blocos de **pagamento mínimo**, **valor financiado** e **simulação de parcelamento/rotativo** são tratados como propostas de crédito. Seus juros e IOF não são oferecidos como encargos reais da fatura. A leitura retorna aos lançamentos atuais quando encontra seus cabeçalhos explícitos. Esse reconhecimento é textual: sempre revise o contexto no PDF; não use o total de uma simulação como valor oficial da fatura.

### Separação de colunas e compras versus saldo a pagar

Quando há datas e compras reconhecíveis nas duas metades de uma página, a leitura mantém as colunas separadas. Isso evita misturar uma compra com valores de limite, taxas ou resumos na coluna vizinha. A posição física original das linhas e dos segmentos é preservada nos identificadores; tabelas de largura inteira não são divididas apenas porque o valor fica à direita. A detecção continua heurística e arquivos reais precisam de revisão.

O resumo de Cartões mostra **compras brutas**. Os pagamentos e os créditos de faturas anteriores ainda não são conciliados num saldo líquido de cartão. A diferença para o boleto é exibida somente como referência na revisão, sem criar receita, despesa ou abatimento artificial. A previsão financeira atual usa os registros de compras e suas marcações de pagamento; ela não substitui o valor a pagar oficial quando há saldos/pagamentos anteriores.
