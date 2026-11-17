# Guia visual Ninho

Identidade acolhedora e calma para um protótipo de monitoramento entre aparelhos. A interface privilegia leitura clara, controles grandes e aviso explícito de que o produto não substitui supervisão.

## Cores

As cores de interface ficam centralizadas em `public/styles.css` como variáveis `--color-*`.

| Token | Valor | Uso |
|---|---|---|
| `--color-ink` | `#20343A` | Títulos e texto principal |
| `--color-muted` | `#4C6267` | Texto secundário em fundos claros |
| `--color-brand` | `#145C52` | Ações principais, links e estados positivos |
| `--color-brand-hover` | `#104C45` | Hover da ação principal |
| `--color-brand-soft` | `#E2EEE8` | Superfícies suaves de câmera |
| `--color-blue-soft` | `#E8F0F3` | Superfícies suaves de monitor |
| `--color-peach-soft` | `#F8E9DF` | Destaques acolhedores |
| `--color-paper` | `#F5F8F5` | Fundo geral |
| `--color-surface` | `#FFFEFA` | Cartões e campos |
| `--color-line` | `#D7E2DC` | Bordas |
| `--color-alert` | `#743B32` | Avisos e erros |
| `--color-alert-soft` | `#FFF1E9` | Fundo de aviso |
| `--color-focus` | `#236FD3` | Indicador de foco visível |

Combinações principais verificadas para WCAG AA: texto principal sobre papel (aprox. 11:1), texto secundário sobre superfície (aprox. 6:1), texto branco no botão de marca (aprox. 7:1) e texto de alerta sobre fundo de alerta (acima de 8:1). A cor nunca é o único indicador de estado: avisos e controles também têm rótulos textuais.

## Tipografia

- Títulos: pilha local arredondada `ui-rounded`, Avenir Next Rounded, Arial Rounded MT Bold e Trebuchet MS.
- Texto corrido e controles: Inter quando instalado, seguido por Segoe UI, Helvetica Neue e Arial.
- Nenhuma fonte remota é carregada; a pilha de sistema evita requisições adicionais e funciona offline.
- Texto base 15 px com entrelinha 1.6; títulos usam escala fluida com `clamp()`, e metadados não ficam abaixo de 10–11 px.

## Ícones e marca

- Marca do ninho e ícones de câmera, telefone, seta, escudo e aviso usam SVG inline, com traço arredondado e espessura coerente.
- O favicon/PWA reutiliza `public/icon.svg`; não há pacote de ícones nem imagem externa.
- SVGs decorativos usam `aria-hidden="true"` e `focusable="false"`; controles continuam com rótulo textual acessível.

## Componentes e interação

- Cartões usam superfície clara, borda suave, raio de 24 px e sombra discreta; controles usam raio de 14 px.
- Ação principal verde escura com texto branco; secundárias são claras com texto escuro e borda contrastante.
- Estados de hover e active não alteram a semântica; `:focus-visible` mostra contorno azul de 3 px. Estados desativados continuam legíveis e não são indicados apenas por transparência.
- Alertas usam fundo pêssego claro, texto escuro, ícone e explicação escrita.
- Formulários mantêm altura mínima de 48 px e rótulos visíveis.

## Layout e responsividade

- O layout começa em uma coluna e amplia cartões em duas colunas em telas maiores.
- Breakpoint móvel em 680 px; espaçamentos e títulos usam escalas fluidas.
- Vídeos mantêm proporção, cantos arredondados e contraste do placeholder.
- `prefers-reduced-motion` reduz transições para usuários que pedem movimento reduzido.
- Não há ilustrações rasterizadas ou dependência de rede; a ilustração da tela inicial é SVG embutido.

## Acessibilidade e limites

- Navegação por teclado mantém foco visível; elementos decorativos são ocultados de leitores de tela.
- Cores textuais e botões principais são selecionados para contraste WCAG AA em fundos declarados; revalidar ao alterar tokens.
- Não foi criado tema escuro: a tela é voltada a monitoramento e um modo escuro exigiria revisar contraste, percepção dos avisos e vídeo em ambiente noturno separadamente.
