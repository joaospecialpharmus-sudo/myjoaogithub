import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { after, before, test } from 'node:test';
import { WebSocket } from 'ws';
import { createNinhoServer, hostAndOriginAreAllowed, makePairingCode } from '../server.js';
import qrcode from 'qrcode-generator';
import { createPairingUrl, readPairingCodeFromFragment } from '../public/pairing.js';
import { isPictureInPictureActive, supportsPictureInPicture, togglePictureInPicture } from '../public/picture-in-picture.js';
import { createSignalInbox } from '../public/signal-inbox.js';

const app = createNinhoServer({
  env: {
    NODE_ENV: 'test',
    ALLOWED_HOSTS: 'localhost,127.0.0.1',
    TURN_SECRET: '',
    TURN_URLS: '',
    TURN_CREDENTIAL_TTL_SECONDS: '3600'
  }
});
let address;

before(async () => {
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  address = app.server.address();
});

test('Picture-in-Picture detects standard and WebKit video APIs and reports unsupported browsers', async () => {
  const calls = [];
  const video = {
    requestPictureInPicture: async () => {
      calls.push('enter-standard');
      standardDocument.pictureInPictureElement = video;
    }
  };
  const standardDocument = {
    pictureInPictureEnabled: true,
    pictureInPictureElement: null,
    exitPictureInPicture: async () => {
      calls.push('exit-standard');
      standardDocument.pictureInPictureElement = null;
    }
  };

  assert.equal(supportsPictureInPicture(video, standardDocument), true);
  assert.equal(await togglePictureInPicture(video, standardDocument), true);
  assert.equal(isPictureInPictureActive(video, standardDocument), true);
  assert.equal(await togglePictureInPicture(video, standardDocument), false);
  assert.equal(isPictureInPictureActive(video, standardDocument), false);

  const webkitVideo = {
    webkitPresentationMode: 'inline',
    webkitSupportsPresentationMode: mode => mode === 'picture-in-picture',
    webkitSetPresentationMode(mode) {
      webkitVideo.webkitPresentationMode = mode;
      calls.push(mode);
    }
  };
  const webkitDocument = {};
  assert.equal(supportsPictureInPicture(webkitVideo, webkitDocument), true);
  assert.equal(await togglePictureInPicture(webkitVideo, webkitDocument), true);
  assert.equal(isPictureInPictureActive(webkitVideo, webkitDocument), true);
  assert.equal(await togglePictureInPicture(webkitVideo, webkitDocument), false);
  assert.deepEqual(calls, ['enter-standard', 'exit-standard', 'picture-in-picture', 'inline']);

  assert.equal(supportsPictureInPicture({}, {}), false);
  await assert.rejects(() => togglePictureInPicture({}, {}), /não oferece mini janela/);
});

after(() => app.close());

function connect() {
  return new Promise((resolve, reject) => {
    const url = `ws://127.0.0.1:${address.port}/signal`;
    const ws = new WebSocket(url, { origin: `http://127.0.0.1:${address.port}` });
    ws.once('open', () => resolve(ws));
    ws.once('error', reject);
  });
}

function nextMessage(ws) {
  return new Promise((resolve, reject) => {
    const onMessage = data => {
      cleanup();
      resolve(JSON.parse(data.toString()));
    };
    const onError = error => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      ws.off('message', onMessage);
      ws.off('error', onError);
    };
    ws.on('message', onMessage);
    ws.on('error', onError);
  });
}

function getWithHeaders(port, headers) {
  return new Promise((resolve, reject) => {
    const request = httpRequest({ host: '127.0.0.1', port, path: '/healthz', headers }, response => {
      response.resume();
      response.on('end', () => resolve(response.statusCode));
    });
    request.on('error', reject);
    request.end();
  });
}

test('pairing code carries 192 random bits in a URL-safe 32-character token', () => {
  const code = makePairingCode();
  assert.match(code, /^[A-Za-z0-9_-]{32}$/);
  assert.notEqual(makePairingCode(), code);
});

test('pairing URL keeps its bearer code in a validated, local fragment and creates a QR payload', async () => {
  const code = makePairingCode();
  const link = createPairingUrl('https://ninho.example.com', code);
  const url = new URL(link);
  assert.equal(url.origin, 'https://ninho.example.com');
  assert.equal(url.pathname, '/');
  assert.equal(url.search, '');
  assert.equal(readPairingCodeFromFragment(url.hash), code);
  assert.equal(readPairingCodeFromFragment('#join=invalid'), null);
  assert.throws(() => createPairingUrl('javascript:alert(1)', code), /Origem/);
  assert.throws(() => createPairingUrl('https://ninho.example.com', 'short'), /Código/);

  const qr = qrcode(0, 'M');
  qr.addData(link, 'Byte');
  qr.make();
  assert.ok(qr.getModuleCount() >= 21);
  assert.equal(qr.isDark(0, 0), true);

  const response = await fetch(`http://127.0.0.1:${address.port}/vendor/qrcode.mjs`, {
    headers: { Host: `127.0.0.1:${address.port}` }
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /javascript/);
  assert.equal(response.headers.get('cache-control'), 'no-cache');
  assert.match(await response.text(), /export default qrcode/);

  const pipModule = await fetch(`http://127.0.0.1:${address.port}/picture-in-picture.js`, {
    headers: { Host: `127.0.0.1:${address.port}` }
  });
  assert.equal(pipModule.status, 200);
  assert.match(pipModule.headers.get('content-type'), /javascript/);
  assert.match(await pipModule.text(), /requestPictureInPicture/);
});

test('monitor buffers offer before joined and early ICE until its peer connection is initialized', async () => {
  const inbox = createSignalInbox();
  const delivered = [];
  const handle = async signal => delivered.push(signal.type);

  inbox.receive({ type: 'offer' }, handle);
  inbox.receive({ type: 'candidate' }, handle);
  assert.deepEqual(delivered, []);

  await inbox.flush(handle);
  assert.deepEqual(delivered, ['offer', 'candidate']);

  await inbox.receive({ type: 'candidate' }, handle);
  assert.deepEqual(delivered, ['offer', 'candidate', 'candidate']);
  inbox.clear();
  inbox.receive({ type: 'candidate' }, handle);
  inbox.receive({ type: 'offer' }, handle);
  await inbox.flush(handle);
  assert.deepEqual(delivered, ['offer', 'candidate', 'candidate', 'candidate', 'offer']);
  inbox.clear();
  inbox.receive({ type: 'answer' }, handle);
  assert.deepEqual(delivered, ['offer', 'candidate', 'candidate', 'candidate', 'offer']);
});

test('same-origin host validation rejects mismatched and malformed origins', () => {
  const allowedHosts = new Set(['ninho.example.com']);
  const request = origin => ({ headers: { host: 'ninho.example.com', origin } });
  assert.equal(hostAndOriginAreAllowed(request('https://ninho.example.com'), allowedHosts, true), true);
  assert.equal(hostAndOriginAreAllowed(request('https://attacker.example'), allowedHosts, true), false);
  assert.equal(hostAndOriginAreAllowed(request('null'), allowedHosts, true), false);
  assert.equal(hostAndOriginAreAllowed({ headers: { host: 'attacker.example', origin: 'https://attacker.example' } }, allowedHosts), false);
  assert.equal(hostAndOriginAreAllowed({ headers: { host: 'ninho.example.com' } }, allowedHosts), true);
  assert.equal(hostAndOriginAreAllowed({ headers: { host: 'ninho.example.com' } }, allowedHosts, true), false);
});

test('Render external hostname is allowed exactly and never as a wildcard', async () => {
  assert.throws(() => createNinhoServer({
    env: { ALLOWED_HOSTS: 'localhost', RENDER_EXTERNAL_HOSTNAME: '*.onrender.com' }
  }), /Hostname inválido/);
  assert.throws(() => createNinhoServer({
    env: { ALLOWED_HOSTS: 'localhost', RENDER_EXTERNAL_HOSTNAME: 'https://ninho.onrender.com/path' }
  }), /Hostname inválido/);

  const renderApp = createNinhoServer({
    env: { ALLOWED_HOSTS: 'localhost', RENDER_EXTERNAL_HOSTNAME: 'ninho.onrender.com' }
  });
  await new Promise(resolve => renderApp.server.listen(0, '127.0.0.1', resolve));
  const port = renderApp.server.address().port;
  try {
    const accepted = await getWithHeaders(port, {
      host: 'ninho.onrender.com',
      origin: 'https://ninho.onrender.com'
    });
    assert.equal(accepted, 200);

    const rejected = await getWithHeaders(port, {
      host: 'sub.ninho.onrender.com',
      origin: 'https://sub.ninho.onrender.com'
    });
    assert.equal(rejected, 403);
  } finally {
    renderApp.close();
  }
});

test('WebSocket upgrade rejects a cross-origin browser request', async () => {
  const status = await new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${address.port}/signal`, {
      origin: 'https://attacker.example'
    });
    ws.once('unexpected-response', (_request, response) => resolve(response.statusCode));
    ws.once('error', () => {});
    setTimeout(() => reject(new Error('WebSocket origin check timed out')), 2000).unref();
  });
  assert.equal(status, 403);
});

test('HTTP serves the app at root and ICE configuration is never cacheable', async () => {
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const home = await fetch(baseUrl, { headers: { Host: `127.0.0.1:${address.port}` } });
  assert.equal(home.status, 200);
  assert.match(home.headers.get('content-type'), /text\/html/);
  assert.equal(home.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(home.headers.get('set-cookie'), null);

  const health = await fetch(`${baseUrl}/healthz`, { headers: { Host: `127.0.0.1:${address.port}` } });
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('cache-control'), 'no-store, private');
  assert.deepEqual(await health.json(), { status: 'ok' });

  const ice = await fetch(`${baseUrl}/api/ice`, { headers: { Host: `127.0.0.1:${address.port}` } });
  assert.equal(ice.status, 200);
  assert.match(ice.headers.get('cache-control'), /no-store/);
  assert.equal((await ice.json()).iceServers[0].urls[0], 'stun:stun.l.google.com:19302');

  const requests = await Promise.all(Array.from({ length: 12 }, () => fetch(`${baseUrl}/api/ice`, {
    headers: { Host: `127.0.0.1:${address.port}` }
  })));
  assert.ok(requests.some(response => response.status === 429));
});

test('TURN credentials are temporary and secret-bearing URLs are rejected', async () => {
  const secret = 'a-test-secret-longer-than-thirty-two-characters';
  assert.throws(() => createNinhoServer({
    env: {
      ALLOWED_HOSTS: '127.0.0.1',
      TURN_SECRET: secret,
      TURN_URLS: 'turn:user:password@turn.example.com:3478'
    }
  }), /sem credenciais embutidas/);

  const turnApp = createNinhoServer({
    env: {
      ALLOWED_HOSTS: '127.0.0.1',
      TURN_SECRET: secret,
      TURN_URLS: 'turn:turn.example.com:3478?transport=udp'
    }
  });
  await new Promise(resolve => turnApp.server.listen(0, '127.0.0.1', resolve));
  const port = turnApp.server.address().port;
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/ice`, {
      headers: { Host: `127.0.0.1:${port}` }
    });
    const configuration = await response.json();
    const turn = configuration.iceServers.find(server => server.username);
    assert.ok(turn);
    assert.match(turn.username, /^\d+:ninho$/);
    assert.equal(typeof turn.credential, 'string');
    assert.equal(turn.credentialType, 'password');
    assert.equal(JSON.stringify(configuration).includes(secret), false);
  } finally {
    turnApp.close();
  }
});

test('pairing is single-use and relays the complete offer/answer/ICE signaling flow only to its peer', async () => {
  const camera = await connect();
  const createdPromise = nextMessage(camera);
  camera.send(JSON.stringify({ type: 'create' }));
  const created = await createdPromise;
  assert.equal(created.type, 'created');
  assert.equal(created.expiresInSeconds, 120);

  const monitor = await connect();
  const connectedPromise = nextMessage(camera);
  const joinedPromise = nextMessage(monitor);
  monitor.send(JSON.stringify({ type: 'join', code: created.code }));
  assert.equal((await joinedPromise).type, 'joined');
  assert.equal((await connectedPromise).type, 'peer-connected');

  const offerSdp = `v=0\r\n${'a=candidate:1 1 UDP 2122252543 192.0.2.1 50000 typ host\r\n'.repeat(110)}`;
  assert.ok(offerSdp.length > 6000);
  assert.ok(offerSdp.length < 7600);
  const forwardedPromise = nextMessage(monitor);
  camera.send(JSON.stringify({ type: 'signal', data: { type: 'offer', sdp: offerSdp } }));
  assert.deepEqual(await forwardedPromise, {
    type: 'signal',
    data: { type: 'offer', sdp: offerSdp }
  });

  const answerPromise = nextMessage(camera);
  monitor.send(JSON.stringify({ type: 'signal', data: { type: 'answer', sdp: 'v=0\r\n' } }));
  assert.deepEqual(await answerPromise, {
    type: 'signal',
    data: { type: 'answer', sdp: 'v=0\r\n' }
  });

  const candidateFromCamera = {
    candidate: 'candidate:1 1 UDP 2122252543 192.0.2.1 50000 typ host',
    sdpMid: '0',
    sdpMLineIndex: 0,
    usernameFragment: 'abcd'
  };
  const candidateFromMonitor = {
    candidate: 'candidate:2 1 UDP 2122252543 192.0.2.2 50001 typ host',
    sdpMid: '0',
    sdpMLineIndex: 0,
    usernameFragment: 'efgh'
  };
  const monitorCandidatePromise = nextMessage(monitor);
  camera.send(JSON.stringify({ type: 'signal', data: { type: 'candidate', candidate: candidateFromCamera } }));
  assert.deepEqual(await monitorCandidatePromise, {
    type: 'signal',
    data: { type: 'candidate', candidate: candidateFromCamera }
  });

  const cameraCandidatePromise = nextMessage(camera);
  monitor.send(JSON.stringify({ type: 'signal', data: { type: 'candidate', candidate: candidateFromMonitor } }));
  assert.deepEqual(await cameraCandidatePromise, {
    type: 'signal',
    data: { type: 'candidate', candidate: candidateFromMonitor }
  });

  const oversizedSdp = `v=0\r\n${'x'.repeat(7596)}`;
  assert.equal(oversizedSdp.length, 7601);
  const oversizedErrorPromise = nextMessage(camera);
  camera.send(JSON.stringify({ type: 'signal', data: { type: 'offer', sdp: oversizedSdp } }));
  assert.deepEqual(await oversizedErrorPromise, {
    type: 'error',
    message: 'Descrição SDP excede o limite de 7600 caracteres.'
  });

  const invalidActionPromise = nextMessage(camera);
  camera.send(JSON.stringify({ type: 'restart' }));
  assert.deepEqual(await invalidActionPromise, {
    type: 'error',
    message: 'Ação não permitida.'
  });

  const replay = await connect();
  const rejectedPromise = nextMessage(replay);
  replay.send(JSON.stringify({ type: 'join', code: created.code }));
  assert.equal((await rejectedPromise).type, 'error');

  for (const ws of [camera, monitor, replay]) ws.close();
});
