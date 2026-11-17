# Ninho Monitor

Protótipo web/PWA independente para usar dois celulares como câmera e monitor. Não é o AlfredCamera, não promete paridade com recursos pagos e não oferece contas, gravação em nuvem, detecção de choro ou alertas confiáveis em segundo plano.

O vídeo e o áudio usam WebRTC com criptografia de transporte DTLS-SRTP entre os aparelhos. O servidor recebe a sinalização necessária para negociar a conexão, incluindo candidatos ICE e metadados de rede; não armazena nem grava mídia. O STUN público padrão também pode receber o endereço IP e dados de conectividade. Se a rede exigir TURN, o serviço TURN poderá retransmitir pacotes criptografados. Sinalização e metadados de conexão não são conteúdo de mídia.

## Requisitos

- Node.js 20 ou mais recente.
- Um navegador móvel com WebRTC e acesso à câmera/microfone.
- HTTPS para usar câmera e microfone em uma hospedagem pública. `localhost` também é permitido para desenvolvimento no computador.
- Para conexões em redes restritas, um serviço TURN próprio ou confiável. STUN sozinho não funciona em todas as redes.

## Desenvolvimento local

```sh
npm install
npm start
```

Abra `http://localhost:3000` para teste no mesmo computador. Para testar com dois celulares, use o deploy HTTPS descrito abaixo ou um túnel HTTPS confiável apontando para a porta `3000`. Os celulares precisam abrir o mesmo hostname permitido em `ALLOWED_HOSTS`.

Para executar os testes do servidor:

```sh
npm test
```

## Deploy com Docker Compose e Caddy

1. Aponte um registro DNS `A` (e, se aplicável, `AAAA`) do hostname para o servidor. Libere TCP 80/443 e UDP 443 para o Caddy.
2. Copie `.env.example` para `.env`. Defina `SITE_HOST` e `ALLOWED_HOSTS` com o hostname exato, sem esquema ou caminho.
3. Configure `TURN_URLS` com os endereços do seu servidor TURN, por exemplo `turn:turn.example.com:3478?transport=udp`. Gere `TURN_SECRET` aleatório, privado e com pelo menos 32 caracteres. Credenciais TURN temporárias, compatíveis com o mecanismo TURN REST (username com expiração e HMAC-SHA1), são calculadas no servidor e expiram após `TURN_CREDENTIAL_TTL_SECONDS`. Configure o mesmo segredo e mecanismo no servidor TURN. Se não usar TURN, deixe `TURN_URLS` vazio; o arquivo de exemplo não funciona como servidor TURN real.
4. Inicie os serviços:

   ```sh
   docker compose up -d --build
   ```

O Caddy solicita e renova certificados HTTPS automaticamente. O serviço Node não publica uma porta diretamente no host; só o Caddy recebe tráfego externo. Logs:

```sh
docker compose logs -f app caddy
```

Para atualizar o app após mudanças:

```sh
docker compose up -d --build
```

Mantenha `.env` fora do Git, use um `TURN_SECRET` exclusivo e restrinja o painel e as regras de rede do servidor. Não exponha a chave TURN no cliente; a API pública `/api/ice` devolve apenas credenciais temporárias. Revise as políticas e os limites do serviço STUN/TURN contratado.

A configuração Compose executa o container Node sem privilégios, com filesystem somente leitura, healthcheck local e instalação via `npm ci` usando `package-lock.json`. O Caddy acrescenta HSTS nas respostas HTTPS. O hostname e o certificado ainda precisam ser configurados e validados no servidor antes de qualquer uso real.

## Demo no Render (plano gratuito)

Para criar uma demo em um **Web Service** do Render, configure o serviço existente sem adicionar blueprint ou arquivo de deploy à raiz deste repositório:

1. Selecione este repositório e defina **Root Directory** como `ninho-monitor`.
2. Defina **Build Command** como `npm ci`.
3. Defina **Start Command** como `npm start`.
4. Não fixe `PORT`: o Render fornece a variável automaticamente, e o servidor escuta nela.
5. O Render define `RENDER_EXTERNAL_HOSTNAME` com o hostname atribuído ao serviço. O app acrescenta somente esse hostname exato à allowlist; não usa wildcard. O navegador também valida que o `Origin` corresponda ao `Host`, então abra a URL Render do próprio serviço, sem um proxy/domínio alternativo não configurado.
6. Configure `TURN_URLS` e `TURN_SECRET` somente se tiver um TURN próprio já configurado. Não coloque segredo no build, no repositório ou em variáveis `VITE_`/cliente.

No plano gratuito, o serviço pode entrar em suspensão após inatividade. Ao acordar, conexões WebSocket e sessões WebRTC existentes são interrompidas; talvez seja necessário recarregar e parear os aparelhos novamente. O plano gratuito é para demonstração e não garante disponibilidade contínua, monitoramento ou uso como babá eletrônica confiável.

## Segurança e limitações

- O pareamento usa 24 bytes aleatórios criptográficos (192 bits), codificados em 32 caracteres URL-safe. O código é de uso único e expira após dois minutos.
- WebSocket valida Host e Origin contra a mesma origem permitida, além de limitar tamanho de mensagens, conexões simultâneas e frequência de conexão/mensagens.
- A configuração ICE e as conexões WebSocket têm limites por endereço IP; conexões sem heartbeat são encerradas e o encaminhamento de sinalização aplica limite de backpressure.
- A sinalização tem tipos e formatos restritos. Dados de câmera, controles e áudio não são guardados no servidor.
- O service worker armazena em cache somente HTML, CSS, JavaScript, manifesto e ícone. Respostas da API ICE e WebSocket nunca entram no cache.
- STUN/TURN e os candidatos ICE expõem informações de conectividade, incluindo endereço IP, aos serviços usados e à outra ponta. O STUN padrão é público; use provedores confiáveis e configure TURN próprio quando necessário.
- Os alertas de volume e movimento são experimentais e locais ao monitor. **Volume não detecta choro, não é confiável em segundo plano e não substitui supervisão.** O navegador pode suspender timers e áudio quando a tela é bloqueada.
- Zoom e flash só aparecem quando o dispositivo e o navegador informam suporte. Resolução é uma preferência solicitada; o aparelho pode aplicar outra resolução.
- Compatibilidade de rede não é garantida. Se a conexão WebRTC direta falhar, configure TURN. Uma conexão TURN pode retransmitir pacotes, mas o conteúdo de mídia WebRTC permanece criptografado entre os aparelhos.
- Este protótipo não tem autenticação, autorização de usuário, gravação, armazenamento, detecção de choro nem alertas confiáveis. Compartilhe o código somente com a pessoa pretendida e encerre a conexão ao terminar.
- A API de configuração ICE é pública e tem rate limiting, mas não autentica usuários. Credenciais TURN temporárias podem ser solicitadas por visitantes do site; avalie custo, cotas e políticas do seu TURN antes de expô-lo publicamente.
- Uma revisão e testes locais não são certificação de segurança. Antes de produção, defina e proteja DNS/servidor, valide o TLS, configure TURN e limites de custo, monitore logs e atualize imagens/dependências.

## Estrutura

- `server.js`: servidor HTTP/WebSocket, pareamento, validação e emissão de configuração ICE.
- `GET /healthz`: verificação simples de disponibilidade do servidor.
- `public/`: aplicação, service worker e manifesto PWA.
- `Dockerfile`, `docker-compose.yml`, `Caddyfile`: deploy HTTPS opcional.
- `.env.example`: nomes de variáveis sem credenciais operacionais.
