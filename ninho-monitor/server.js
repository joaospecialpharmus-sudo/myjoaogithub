import { createHmac, randomBytes } from 'node:crypto';
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { isIP } from 'node:net';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PUBLIC_DIR = resolve(ROOT, 'public');
const PAIRING_TTL_MS = 2 * 60 * 1000;
const MAX_CONNECTIONS = 100;
const MAX_CONNECTIONS_PER_IP = 8;
const MAX_RATE_BUCKETS = 1000;
const MAX_MESSAGE_BYTES = 8192;
const MAX_SIGNAL_SDP_LENGTH = 7600;
const MAX_PEER_BUFFERED_BYTES = 64 * 1024;
const SOCKET_HEARTBEAT_MS = 30_000;
const RATE_BUCKET_TTL_MS = 10 * 60 * 1000;
const STATIC_FILES = new Set([
  '/index.html',
  '/styles.css',
  '/app.js',
  '/pairing.js',
  '/signal-inbox.js',
  '/picture-in-picture.js',
  '/vendor/qrcode.mjs',
  '/sw.js',
  '/manifest.webmanifest',
  '/icon.svg'
]);
const MIME_TYPES = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.json', 'application/manifest+json; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json; charset=utf-8'],
  ['.svg', 'image/svg+xml']
]);

export function makePairingCode() {
  return randomBytes(24).toString('base64url');
}

export function hostAndOriginAreAllowed(request, allowedHosts, requireOrigin = false) {
  const hostHeader = request.headers.host;
  if (typeof hostHeader !== 'string' || hostHeader.length > 255) return false;

  let host;
  try {
    host = new URL(`http://${hostHeader}`);
  } catch {
    return false;
  }
  if (host.host.toLowerCase() !== hostHeader.toLowerCase()) return false;
  const hostname = host.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!allowedHosts.has(hostname)) return false;

  const originHeader = request.headers.origin;
  if (!originHeader) return !requireOrigin;
  try {
    const origin = new URL(originHeader);
    if (!['http:', 'https:'].includes(origin.protocol) || origin.origin !== originHeader) return false;
    return origin.host.toLowerCase() === host.host.toLowerCase();
  } catch {
    return false;
  }
}

function getConfig(env) {
  const configuredHosts = (env.ALLOWED_HOSTS || 'localhost,127.0.0.1,::1')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  if (env.RENDER_EXTERNAL_HOSTNAME) configuredHosts.push(env.RENDER_EXTERNAL_HOSTNAME.trim());
  const allowedHosts = new Set();
  for (const value of configuredHosts) {
    const hostname = normalizeConfiguredHostname(value);
    if (!hostname) throw new Error(`Hostname inválido em ALLOWED_HOSTS/RENDER_EXTERNAL_HOSTNAME: ${value}`);
    allowedHosts.add(hostname);
  }
  const stunUrls = (env.STUN_URLS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  const turnUrls = (env.TURN_URLS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
  const turnSecret = env.TURN_SECRET || '';
  const ttlSeconds = Number(env.TURN_CREDENTIAL_TTL_SECONDS || '3600');

  if (!allowedHosts.size) throw new Error('ALLOWED_HOSTS precisa conter ao menos um hostname.');
  if (turnUrls.length && turnSecret.length < 32) {
    throw new Error('TURN_SECRET precisa ter pelo menos 32 caracteres quando TURN estiver habilitado.');
  }
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 60 || ttlSeconds > 86400) {
    throw new Error('TURN_CREDENTIAL_TTL_SECONDS deve ficar entre 60 e 86400.');
  }
  for (const url of [...stunUrls, ...turnUrls]) {
    if (!/^(stuns?|turns?):[^\s,]+$/i.test(url) || url.includes('@')) {
      throw new Error('STUN_URLS e TURN_URLS devem conter somente URLs ICE válidas, sem credenciais embutidas.');
    }
  }

  return { allowedHosts, stunUrls, turnUrls, turnSecret, ttlSeconds };
}

function normalizeConfiguredHostname(value) {
  const hostname = value.toLowerCase();
  if (isIP(hostname)) return hostname;
  if (hostname.length > 253
    || !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/.test(hostname)) {
    return null;
  }
  try {
    const parsed = new URL(`http://${hostname}`);
    return parsed.hostname.toLowerCase() === hostname && parsed.host.toLowerCase() === hostname
      ? hostname
      : null;
  } catch {
    return null;
  }
}

function applySecurityHeaders(response) {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=()');
  response.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; media-src 'self' blob:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
}

function sendJson(response, status, value, noStore = false) {
  response.statusCode = status;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (noStore) response.setHeader('Cache-Control', 'no-store, private');
  response.end(JSON.stringify(value));
}

function clientIp(request, trustProxy) {
  const forwardedIp = request.headers['x-real-ip'];
  if (trustProxy && typeof forwardedIp === 'string' && isIP(forwardedIp)) return forwardedIp;
  return request.socket.remoteAddress || 'unknown';
}

function getRateBucket(buckets, ip, now) {
  let bucket = buckets.get(ip);
  if (bucket) return bucket;

  for (const [key, value] of buckets) {
    if (now - value.updatedAt > RATE_BUCKET_TTL_MS) buckets.delete(key);
  }
  if (buckets.size >= MAX_RATE_BUCKETS) return null;

  bucket = { tokens: 10, updatedAt: now };
  buckets.set(ip, bucket);
  return bucket;
}

function rejectUpgrade(socket, status, message) {
  socket.write(`HTTP/1.1 ${status} ${message}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

function pathnameFromRequest(request) {
  try {
    return new URL(request.url || '/', 'http://localhost').pathname;
  } catch {
    return null;
  }
}

function takeRateToken(bucket, now, capacity, refillPerSecond) {
  const elapsed = Math.max(0, (now - bucket.updatedAt) / 1000);
  bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillPerSecond);
  bucket.updatedAt = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

function signalValidationError(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'Mensagem de sinalização inválida.';
  if (data.type === 'offer' || data.type === 'answer') {
    if (Object.keys(data).length !== 2 || typeof data.sdp !== 'string' || data.sdp.length === 0) {
      return 'Descrição SDP inválida.';
    }
    if (data.sdp.length > MAX_SIGNAL_SDP_LENGTH) {
      return `Descrição SDP excede o limite de ${MAX_SIGNAL_SDP_LENGTH} caracteres.`;
    }
    return null;
  }
  if (data.type === 'candidate') {
    if (Object.keys(data).length !== 2) return 'Candidato ICE inválido.';
    if (data.candidate === null) return null;
    const candidate = data.candidate;
    const isValid = candidate
      && typeof candidate === 'object'
      && !Array.isArray(candidate)
      && Object.keys(candidate).every(key => ['candidate', 'sdpMid', 'sdpMLineIndex', 'usernameFragment'].includes(key))
      && typeof candidate.candidate === 'string'
      && candidate.candidate.length <= 2048
      && (candidate.sdpMid === null || typeof candidate.sdpMid === 'string' && candidate.sdpMid.length <= 256)
      && (candidate.sdpMLineIndex === null || Number.isInteger(candidate.sdpMLineIndex)
        && candidate.sdpMLineIndex >= 0 && candidate.sdpMLineIndex <= 255)
      && (candidate.usernameFragment === undefined || candidate.usernameFragment === null
        || typeof candidate.usernameFragment === 'string' && candidate.usernameFragment.length <= 256);
    return isValid ? null : 'Candidato ICE inválido.';
  }
  return 'Tipo de sinalização não permitido.';
}

export function createNinhoServer({ env = process.env } = {}) {
  const config = getConfig(env);
  const trustProxy = env.TRUST_PROXY === 'true';
  const pendingPairings = new Map();
  const activeSockets = new Set();
  const socketCountsByIp = new Map();
  const connectionRatesByIp = new Map();
  const iceRatesByIp = new Map();

  function getIceConfiguration() {
    const iceServers = [{ urls: ['stun:stun.l.google.com:19302'] }, ...config.stunUrls.map(urls => ({ urls }))];
    if (config.turnUrls.length) {
      const expiry = Math.floor(Date.now() / 1000) + config.ttlSeconds;
      const username = `${expiry}:ninho`;
      const credential = createHmac('sha1', config.turnSecret).update(username).digest('base64');
      iceServers.push({ urls: config.turnUrls, username, credential, credentialType: 'password' });
    }
    return { iceServers, iceTransportPolicy: 'all' };
  }

  const server = createServer((request, response) => {
    applySecurityHeaders(response);
    if (!hostAndOriginAreAllowed(request, config.allowedHosts)) {
      response.writeHead(403).end('Host ou origem não permitidos.');
      return;
    }

    const requestPath = pathnameFromRequest(request);
    if (!requestPath) {
      response.writeHead(400).end('Requisição inválida.');
      return;
    }
    const pathname = requestPath === '/' ? '/index.html' : requestPath;
    if (pathname === '/healthz') {
      if (request.method !== 'GET') {
        response.setHeader('Allow', 'GET');
        response.writeHead(405).end();
        return;
      }
      sendJson(response, 200, { status: 'ok' }, true);
      return;
    }
    if (pathname === '/api/ice') {
      if (request.method !== 'GET') {
        response.setHeader('Allow', 'GET');
        response.writeHead(405).end();
        return;
      }
      const ip = clientIp(request, trustProxy);
      const bucket = getRateBucket(iceRatesByIp, ip, Date.now());
      if (!bucket || !takeRateToken(bucket, Date.now(), 10, 0.1)) {
        response.setHeader('Retry-After', '10');
        sendJson(response, 429, { error: 'Limite de solicitações excedido.' }, true);
        return;
      }
      sendJson(response, 200, getIceConfiguration(), true);
      return;
    }
    if (request.method !== 'GET' || !STATIC_FILES.has(pathname)) {
      response.writeHead(404).end('Não encontrado.');
      return;
    }

    const file = resolve(PUBLIC_DIR, `.${pathname}`);
    if (!file.startsWith(`${PUBLIC_DIR}${sep}`) || !statSync(file, { throwIfNoEntry: false })?.isFile()) {
      response.writeHead(404).end('Não encontrado.');
      return;
    }
    response.setHeader('Content-Type', MIME_TYPES.get(extname(file)) || 'application/octet-stream');
    response.setHeader('Cache-Control', 'no-cache');
    createReadStream(file).pipe(response);
  });
  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  server.maxRequestsPerSocket = 1000;

  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES, perMessageDeflate: false });

  server.on('upgrade', (request, socket, head) => {
    const pathname = pathnameFromRequest(request);
    const ip = clientIp(request, trustProxy);
    const now = Date.now();
    if (pathname !== '/signal' || !hostAndOriginAreAllowed(request, config.allowedHosts, true)) {
      rejectUpgrade(socket, 403, 'Forbidden');
      return;
    }
    if (activeSockets.size >= MAX_CONNECTIONS || (socketCountsByIp.get(ip) || 0) >= MAX_CONNECTIONS_PER_IP) {
      rejectUpgrade(socket, 429, 'Too Many Requests');
      return;
    }
    const rate = getRateBucket(connectionRatesByIp, ip, now);
    if (!rate || !takeRateToken(rate, now, 10, 0.1)) {
      rejectUpgrade(socket, 429, 'Too Many Requests');
      return;
    }

    sockets.handleUpgrade(request, socket, head, websocket => {
      sockets.emit('connection', websocket, request);
    });
  });

  sockets.on('connection', (ws, request) => {
    const ip = clientIp(request, trustProxy);
    const rate = { tokens: 120, updatedAt: Date.now() };
    const peer = { ws, ip, role: null, pairing: null, rate, violations: 0 };
    activeSockets.add(ws);
    ws.isAlive = true;
    socketCountsByIp.set(ip, (socketCountsByIp.get(ip) || 0) + 1);
    ws.on('pong', () => {
      ws.isAlive = true;
    });
    ws.on('error', error => {
      console.error('Erro em conexão WebSocket:', error.message);
    });

    function send(value) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(value));
    }
    function fail(message) {
      peer.violations += 1;
      send({ type: 'error', message });
      if (peer.violations >= 3) ws.close(1008, 'Protocolo inválido');
    }

    ws.on('message', (raw, isBinary) => {
      if (!takeRateToken(rate, Date.now(), 120, 2)) {
        ws.close(1008, 'Limite de mensagens excedido');
        return;
      }
      if (isBinary) {
        fail('Somente mensagens de texto são permitidas.');
        return;
      }

      let message;
      try {
        message = JSON.parse(raw.toString());
      } catch {
        fail('Mensagem inválida.');
        return;
      }
      if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.type !== 'string') {
        fail('Mensagem inválida.');
        return;
      }

      if (message.type === 'create' && peer.role === null && Object.keys(message).length === 1) {
        let code = makePairingCode();
        while (pendingPairings.has(code)) code = makePairingCode();
        const pairing = { code, camera: peer, monitor: null, expiresAt: Date.now() + PAIRING_TTL_MS };
        peer.role = 'camera';
        peer.pairing = pairing;
        pendingPairings.set(code, pairing);
        send({ type: 'created', code, expiresInSeconds: PAIRING_TTL_MS / 1000 });
        return;
      }

      if (message.type === 'join' && peer.role === null && Object.keys(message).length === 2
        && typeof message.code === 'string' && /^[A-Za-z0-9_-]{32}$/.test(message.code)) {
        const pairing = pendingPairings.get(message.code);
        if (!pairing || pairing.expiresAt <= Date.now()) {
          pendingPairings.delete(message.code);
          fail('Código inválido ou expirado. Peça um novo código à câmera.');
          return;
        }
        pendingPairings.delete(message.code);
        pairing.monitor = peer;
        peer.role = 'monitor';
        peer.pairing = pairing;
        send({ type: 'joined' });
        if (pairing.camera.ws.readyState === WebSocket.OPEN) {
          pairing.camera.ws.send(JSON.stringify({ type: 'peer-connected' }));
        }
        return;
      }

      if (message.type === 'signal') {
        if (Object.keys(message).length !== 2 || !peer.pairing) {
          fail('Ação de sinalização inválida ou sessão não pareada.');
          return;
        }
        const validationError = signalValidationError(message.data);
        if (validationError) {
          fail(validationError);
          return;
        }
        const counterpart = peer.role === 'camera' ? peer.pairing.monitor : peer.pairing.camera;
        if (!counterpart || counterpart.ws.readyState !== WebSocket.OPEN) {
          fail('O outro aparelho ainda não está conectado.');
          return;
        }
        if ((message.data.type === 'offer' && peer.role !== 'camera')
          || (message.data.type === 'answer' && peer.role !== 'monitor')) {
          fail('Descrição de conexão inválida para este aparelho.');
          return;
        }
        if (counterpart.ws.bufferedAmount > MAX_PEER_BUFFERED_BYTES) {
          ws.close(1013, 'O outro aparelho está recebendo dados lentamente');
          return;
        }
        counterpart.ws.send(JSON.stringify({ type: 'signal', data: message.data }));
        return;
      }

      fail('Ação não permitida.');
    });

    ws.on('close', () => {
      activeSockets.delete(ws);
      const count = (socketCountsByIp.get(ip) || 1) - 1;
      if (count > 0) socketCountsByIp.set(ip, count);
      else socketCountsByIp.delete(ip);

      const pairing = peer.pairing;
      if (!pairing) return;
      pendingPairings.delete(pairing.code);
      const counterpart = peer === pairing.camera ? pairing.monitor : pairing.camera;
      if (counterpart?.ws.readyState === WebSocket.OPEN) {
        counterpart.ws.send(JSON.stringify({ type: 'peer-disconnected' }));
        counterpart.ws.close(1000, 'O outro aparelho desconectou');
      }
    });
  });

  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [code, pairing] of pendingPairings) {
      if (pairing.expiresAt <= now) {
        pendingPairings.delete(code);
        if (pairing.camera.ws.readyState === WebSocket.OPEN) {
          pairing.camera.ws.send(JSON.stringify({ type: 'expired' }));
          pairing.camera.ws.close(1000, 'Código expirado');
        }
      }
    }
    for (const [ip, bucket] of connectionRatesByIp) {
      if (now - bucket.updatedAt > RATE_BUCKET_TTL_MS) connectionRatesByIp.delete(ip);
    }
    for (const [ip, bucket] of iceRatesByIp) {
      if (now - bucket.updatedAt > RATE_BUCKET_TTL_MS) iceRatesByIp.delete(ip);
    }
  }, 15_000);
  cleanup.unref();
  const heartbeat = setInterval(() => {
    for (const ws of activeSockets) {
      if (!ws.isAlive) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, SOCKET_HEARTBEAT_MS);
  heartbeat.unref();

  return {
    server,
    close() {
      clearInterval(cleanup);
      clearInterval(heartbeat);
      for (const ws of activeSockets) ws.close(1001, 'Servidor encerrando');
      sockets.close();
      server.close();
    }
  };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const { server } = createNinhoServer();
  const port = Number(process.env.PORT || '3000');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT inválida.');
  server.listen(port, '0.0.0.0', () => {
    console.log(`Ninho Monitor ouvindo na porta ${port}.`);
  });
}
