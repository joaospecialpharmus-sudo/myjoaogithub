# Guia visual GEGCamera

GEGCamera usa o conceito **Janela do quarto**: cartões grandes e arredondados parecem quadros acolhedores sobre uma ilustração original de quarto infantil. A apresentação é deliberadamente calma, inclusive à noite; nenhuma cor ou ilustração reduz os avisos de segurança do protótipo.

## Paleta e contraste

As cores ficam centralizadas em `public/styles.css` como variáveis CSS. O tema noturno usa tokens alternativos em `:root[data-theme="night"]`.

| Token/cor | Dia | Uso |
|---|---|---|
| Amarelo manteiga | `#FFE9A8` | Ilustração e fundos decorativos |
| `--color-brand` | `#F6C75E` | Ação principal e destaque amarelo-mel |
| `--color-paper` | `#FFF8E7` | Fundo base creme |
| `--color-peach-soft` | `#F9D5D3` | Alertas e destaque rosa bebê |
| `--color-blue-soft` | `#CDE6F5` | Cartão de monitor e ícones |
| `--color-brand-soft` | `#D4EBDD` | Estados positivos em menta |
| Lavanda | `#E3DAF2` | Detalhes decorativos |
| `--color-ink` | `#5B4A3F` | Texto principal |
| `--color-muted` | `#6D5949` | Texto secundário |
| `--color-line` | `#D9C9A9` | Bordas |
| `--color-focus` | `#60428A` | Foco visível |

O secundário originalmente sugerido (`#8A7867`) não alcança contraste AA no creme; usa-se `#6D5949`. Texto em botões mel usa `#49382D`, mais escuro que o texto padrão. Contrastes sRGB calculados: texto principal/creme **7,95:1**, texto secundário/creme **6,25:1**, texto do botão mel (`#49382D`/`#F6C75E`) **7,02:1**. Foco tem contorno de 3 px além da cor.

No modo noite, o fundo é azul-petróleo `#18343D`, cartões `#24434B`, texto creme `#FFF2DF` e detalhes amarelo quente `#FFE9A8`. Rosa e menta escurecem para superfícies com texto claro; botões mel mantêm texto marrom escuro para contraste.

## Tipografia

- Títulos: pilha local arredondada `Nunito`, `ui-rounded`, Avenir Next Rounded e Trebuchet MS.
- Texto corrido e controles: `Nunito Sans`, Segoe UI, Helvetica Neue e Arial.
- Nenhuma fonte remota é carregada; a pilha do sistema funciona offline.
- Texto base e descrições têm no mínimo 16 px e entrelinha 1.6; títulos usam escala fluida com `clamp()`.

## Marca, ícones e ilustração

- Logo e favicon mostram lua crescente e estrela originais em amarelo e marrom. Ícones de câmera, telefone, seta, escudo e aviso mantêm SVG e traços arredondados consistentes.
- O quarto é uma ilustração SVG própria em `public/nursery-room.svg`: papel de parede discreto, móbile, cortina, bichinhos genéricos, prateleira, berço, tapete e luz quente. Sem fonte, imagem ou personagem de terceiros.
- SVG decorativo é oculto de leitores de tela; controles mantêm rótulos textuais acessíveis.

## Componentes e interação

- Cartões têm cantos de 26–28 px, borda clara e sombra quente; controles têm cantos de 16–18 px.
- Ação principal amarelo-mel com texto marrom escuro; secundárias mantêm texto escuro, borda contrastante e estados hover/desativado.
- Foco de teclado usa contorno de 3 px. Estados não são comunicados só por cor.
- Alertas podem usar rosa (atenção/indisponível) e menta (estado positivo), sempre com texto. Movimento/áudio e suas limitações continuam explicitados.
- O botão de tema é acessível, acompanha a preferência do sistema até a pessoa selecionar um modo e atualiza `theme-color` do navegador. A escolha manual vale até recarregar a página.
- Permissões de notificação continuam atrás de gesto explícito; no iPhone, a aba Safari não garante notificações de sistema. Alertas na página só funcionam durante a sessão ativa.
- O formulário de câmera inclui um medidor visual de entrada do microfone e informa quando o navegador pausa/interrompe a faixa. O medidor não reconhece choro nem sons específicos.

## Layout e responsividade

- **A — Janela do quarto (implementado):** cartões câmera/monitor grandes como quadros sobre a cena infantil; cabeçalho com marca e lua.
- **B — Painel de bercinho (variação documentada, não implementada):** vídeo central em moldura de berço, com áudio, luz e alertas em cartões laterais.
- **C — Mobile de cartões (variação documentada, não implementada):** cartões pendurados por fios finos sob um móbile superior.
- O layout começa mobile-first; breakpoints em 680 px e 900 px organizam cartões em colunas. Em telas pequenas, o quarto detalhado é substituído por gradientes e estrelas CSS.
- `prefers-reduced-motion` remove animações ambientais e transições não essenciais.
- SVG é leve e local, servido e incluído no cache estático do PWA.
- Alternar para outro app pode suspender mídia e WebRTC conforme o navegador e o sistema operacional; o estilo informa esse limite sem prometer operação em segundo plano.

## Acessibilidade e limites

- Navegação por teclado mantém foco visível; elementos decorativos são `aria-hidden`; textos críticos mantêm contraste WCAG AA nos pares documentados.
- Dia/noite devem ainda ser conferidos em telas reais com brilho reduzido e diferentes modos de contraste.
- A identidade visual não altera as limitações funcionais: não há classificação de choro, notificações confiáveis em segundo plano ou substituição de supervisão.
