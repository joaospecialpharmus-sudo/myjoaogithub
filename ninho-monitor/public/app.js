import qrcode from './vendor/qrcode.mjs';
import { createPairingUrl, readPairingCodeFromFragment } from './pairing.js';
import { createSignalInbox } from './signal-inbox.js';

const $ = selector => document.querySelector(selector);
const homeScreen = $('#home-screen');
const cameraScreen = $('#camera-screen');
const monitorScreen = $('#monitor-screen');
const cameraVideo = $('#local-video');
const remoteVideo = $('#remote-video');
const cameraSelect = $('#camera-select');
const microphoneSelect = $('#microphone-select');
const cameraStatus = $('#camera-status');
const monitorStatus = $('#monitor-status');

let socket;
let peer;
let localStream;
let dataChannel;
let selectedRole;
let pairTimer;
let pairDeadline;
let remoteMuted = false;
let remoteTorch = false;
let cameraFacing = 'environment';
let remoteCapabilities = {};
let motionTimer;
let volumeFrame;
let analysisSource;
let analysisContext;
let iceConfiguration;
let previousFrame;
let lastAlertAt = 0;
let pendingIceCandidates = [];
let pairingUrl;
let peerConnectTimer;
const pendingMonitorSignals = createSignalInbox();

function showScreen(screen) {
  for (const candidate of [homeScreen, cameraScreen, monitorScreen]) candidate.hidden = candidate !== screen;
}

function explainError(error) {
  const messages = {
    NotAllowedError: 'Permissão de câmera ou microfone negada. Autorize o acesso nas configurações do navegador.',
    NotFoundError: 'Não foi encontrada uma câmera ou um microfone neste aparelho.',
    NotReadableError: 'O dispositivo está em uso por outro aplicativo ou não pôde ser iniciado.',
    SecurityError: 'O navegador bloqueou o acesso. Abra o site em HTTPS ou em localhost.',
    TypeError: 'Este navegador não oferece os recursos necessários para iniciar a câmera.'
  };
  return messages[error?.name] || error?.message || 'Não foi possível iniciar. Tente novamente.';
}

function websocketUrl() {
  const scheme = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${scheme}//${location.host}/signal`;
}

function connectSocket(onMessage) {
  return new Promise((resolve, reject) => {
    if (!('WebSocket' in window)) {
      reject(new Error('Este navegador não oferece WebSocket.'));
      return;
    }
    const ws = new WebSocket(websocketUrl());
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('O servidor não respondeu. Em uma demo gratuita, ele pode estar acordando; tente novamente em alguns segundos.'));
    }, 60000);
    ws.addEventListener('open', () => {
      clearTimeout(timeout);
      resolve(ws);
    }, { once: true });
    ws.addEventListener('error', () => {
      clearTimeout(timeout);
      reject(new Error('Não foi possível conectar ao servidor de sinalização.'));
    }, { once: true });
    ws.addEventListener('message', event => {
      try {
        onMessage(JSON.parse(event.data));
      } catch {
        reportError('O servidor enviou uma resposta inválida.');
      }
    });
    $('#copy-link').addEventListener('click', async () => {
      if (!pairingUrl) {
        cameraStatus.textContent = 'O link de pareamento ainda não está disponível.';
        return;
      }
      try {
        await navigator.clipboard.writeText(pairingUrl);
        $('#copy-link').textContent = 'Link copiado';
      } catch {
        cameraStatus.textContent = 'Não foi possível copiar. Use o QR ou compartilhe o código manualmente.';
      }
    });
    ws.addEventListener('close', event => {
      if (event.code !== 1000 && event.code !== 1001) reportError('A conexão com o servidor foi encerrada.');
    });
  });
}

function reportError(message) {
  if (selectedRole === 'camera') cameraStatus.textContent = message;
  if (selectedRole === 'monitor') {
    monitorStatus.textContent = message;
    if (!$('#monitor-session').hidden) $('#connection-detail').textContent = message;
  }
}

function closeSession() {
  clearInterval(pairTimer);
  clearTimeout(peerConnectTimer);
  clearTimeout(motionTimer);
  cancelAnimationFrame(volumeFrame);
  motionTimer = undefined;
  volumeFrame = undefined;
  if (analysisSource) analysisSource.disconnect();
  analysisSource = undefined;
  if (analysisContext) analysisContext.close();
  analysisContext = undefined;
  if (dataChannel) dataChannel.close();
  dataChannel = undefined;
  if (peer) peer.close();
  peer = undefined;
  pairingUrl = undefined;
  pendingIceCandidates = [];
  pendingMonitorSignals.clear();
  if (socket) socket.close(1000, 'Sessão encerrada');
  socket = undefined;
  if (localStream) {
    for (const track of localStream.getTracks()) track.stop();
    localStream = undefined;
  }
  cameraVideo.srcObject = null;
  remoteVideo.srcObject = null;
  $('#monitor-session').hidden = true;
  $('#join-form').hidden = false;
  $('#pairing-card').hidden = true;
  $('#pairing-code').textContent = '';
  $('#pairing-qr').getContext('2d')?.clearRect(0, 0, $('#pairing-qr').width, $('#pairing-qr').height);
  $('#pairing-input').value = '';
  $('#camera-placeholder').hidden = false;
  $('#camera-live').hidden = true;
  $('#monitor-placeholder').hidden = false;
  $('#play-video').hidden = true;
  $('#connection-badge').innerHTML = '<span></span> Conectando';
  for (const control of [$('#switch-camera'), $('#mute-camera'), $('#resolution-select'), $('#zoom-range'), $('#torch-button')]) {
    control.disabled = true;
  }
  $('#torch-button').hidden = true;
  $('#zoom-control').hidden = true;
  remoteCapabilities = {};
  remoteMuted = false;
  remoteTorch = false;
  selectedRole = undefined;
}

async function loadIceConfiguration() {
  const response = await fetch('/api/ice', { cache: 'no-store', credentials: 'same-origin' });
  if (!response.ok) throw new Error('Não foi possível obter a configuração de conexão. Tente novamente.');
  return response.json();
}

function sendSignal(data) {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'signal', data }));
}

function createPeer(configuration, role) {
  if (!('RTCPeerConnection' in window)) throw new Error('Este navegador não oferece WebRTC.');
  pendingIceCandidates = [];
  peer = new RTCPeerConnection(configuration);
  const activePeer = peer;
  clearTimeout(peerConnectTimer);
  peerConnectTimer = setTimeout(() => {
    if (peer !== activePeer || peer.connectionState === 'connected') return;
    const message = 'A mídia ainda não conectou. Confira a rede dos dois aparelhos; STUN não atravessa todas as redes e talvez seja necessário configurar TURN.';
    if (role === 'monitor') $('#connection-detail').textContent = message;
    else $('#pairing-status').textContent = message;
  }, 30000);
  peer.onicecandidate = event => {
    if (event.candidate) sendSignal({ type: 'candidate', candidate: event.candidate.toJSON() });
  };
  peer.oniceconnectionstatechange = () => {
    const state = peer?.iceConnectionState;
    const messages = {
      checking: 'Procurando uma rota de mídia entre os aparelhos (ICE)…',
      connected: 'Rota de mídia encontrada; concluindo a conexão segura.',
      completed: 'Rota de mídia pronta; aguardando o fluxo de vídeo.',
      disconnected: 'A rota de mídia foi interrompida; tentando recuperar a conexão…',
      failed: 'A negociação de mídia falhou. STUN público não atravessa todas as redes; configure um servidor TURN confiável.',
      closed: 'A negociação de mídia foi encerrada.'
    };
    if (!messages[state]) return;
    if (role === 'monitor') $('#connection-detail').textContent = messages[state];
    else $('#pairing-status').textContent = messages[state];
    if (state === 'failed') reportError(messages[state]);
  };
  peer.onicegatheringstatechange = () => {
    if (role === 'monitor' && peer?.iceGatheringState === 'gathering'
      && peer.iceConnectionState === 'new') {
      $('#connection-detail').textContent = 'Coletando rotas de rede para tentar estabelecer a conexão…';
    }
  };
  peer.onicecandidateerror = event => {
    if (role === 'monitor' && peer?.iceConnectionState !== 'connected') {
      const code = event.errorCode ? ` (${event.errorCode})` : '';
      $('#connection-detail').textContent = `Um servidor STUN/TURN não respondeu${code}. Verifique a rede ou configure TURN.`;
    }
  };
  peer.onconnectionstatechange = () => {
    const state = peer?.connectionState;
    if (role === 'monitor') {
      const badge = $('#connection-badge');
      badge.lastChild.textContent = ` ${state === 'connected' ? 'Conectado ponto a ponto' : state === 'failed' ? 'Conexão indisponível' : state === 'disconnected' ? 'Conexão interrompida' : 'Conectando'}`;
      if (state === 'connected') clearTimeout(peerConnectTimer);
      $('#connection-detail').textContent = state === 'connected'
        ? 'Mídia conectada diretamente ou por retransmissão TURN.'
        : state === 'failed'
          ? 'A negociação WebRTC falhou. Confira se os dois aparelhos estão online e se a rede permite STUN/TURN.'
          : state === 'disconnected'
            ? 'A conexão de mídia foi interrompida; aguardando recuperação da rede.'
            : 'Código aceito. Acordando o serviço e negociando a conexão de mídia…';
    } else if (role === 'camera' && state === 'connected') {
      clearTimeout(peerConnectTimer);
      $('#pairing-status').textContent = 'Conectado. O áudio e o vídeo estão sendo transmitidos diretamente.';
    }
    if (state === 'failed') reportError('A conexão de mídia falhou. Verifique a rede e a configuração STUN/TURN.');
  };
  if (role === 'camera') {
    for (const track of localStream.getTracks()) peer.addTrack(track, localStream);
    dataChannel = peer.createDataChannel('ninho-controls');
    bindDataChannel(dataChannel);
    peer.onnegotiationneeded = async () => {
      try {
        await peer.setLocalDescription(await peer.createOffer());
        sendSignal({ type: 'offer', sdp: peer.localDescription.sdp });
      } catch (error) {
        reportError(`Não foi possível iniciar a conexão: ${explainError(error)}`);
      }
    };
  } else {
    peer.ondatachannel = event => {
      dataChannel = event.channel;
      bindDataChannel(dataChannel);
    };
    peer.ontrack = event => {
      remoteVideo.srcObject = event.streams[0] || new MediaStream([event.track]);
      $('#monitor-placeholder').hidden = true;
      $('#connection-detail').textContent = 'Mídia recebida. Iniciando reprodução neste aparelho…';
      playRemoteVideo();
      startLocalAlerts();
    };
  }
  return peer;
}

function bindDataChannel(channel) {
  channel.onopen = () => {
    enableRemoteControls(true);
    if (selectedRole === 'camera') {
      sendControlMessage({ type: 'capabilities', capabilities: getCameraCapabilities() });
    } else if (selectedRole === 'monitor') {
      sendControl('resolution', Number($('#resolution-select').value));
    }
  };
  channel.onclose = () => enableRemoteControls(false);
  channel.onmessage = event => {
    let message;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (selectedRole === 'monitor') {
      if (message?.type === 'capabilities' && message.capabilities && typeof message.capabilities === 'object') {
        remoteCapabilities = message.capabilities;
        configureRemoteControls();
      } else if (message?.type === 'state' && message.muted === true) {
        remoteMuted = message.value === true;
        $('#mute-camera').textContent = remoteMuted ? 'Ativar microfone' : 'Silenciar microfone';
      }
      return;
    }
    if (selectedRole === 'camera' && message?.type === 'control') applyRemoteControl(message.action, message.value);
  };
}

function sendControlMessage(message) {
  if (dataChannel?.readyState === 'open') dataChannel.send(JSON.stringify(message));
}

function enableRemoteControls(enabled) {
  for (const control of [$('#switch-camera'), $('#mute-camera'), $('#resolution-select')]) control.disabled = !enabled;
  configureRemoteControls();
}

function getCameraCapabilities() {
  const track = localStream?.getVideoTracks()[0];
  const capabilities = track?.getCapabilities?.() || {};
  return {
    zoom: Number.isFinite(capabilities.zoom?.min) && Number.isFinite(capabilities.zoom?.max)
      ? { min: capabilities.zoom.min, max: capabilities.zoom.max, step: capabilities.zoom.step || 0.1 }
      : null,
    torch: Array.isArray(capabilities.torch) ? capabilities.torch.includes(true) : capabilities.torch === true
  };
}

function configureRemoteControls() {
  const enabled = dataChannel?.readyState === 'open';
  const zoom = remoteCapabilities.zoom;
  $('#zoom-control').hidden = !enabled || !zoom;
  if (zoom) {
    const range = $('#zoom-range');
    range.min = String(zoom.min);
    range.max = String(zoom.max);
    range.step = String(zoom.step);
    range.value = String(zoom.min);
    range.disabled = !enabled;
    $('#zoom-value').textContent = `${zoom.min}×`;
  }
  const torchButton = $('#torch-button');
  torchButton.hidden = !enabled || remoteCapabilities.torch !== true;
  torchButton.disabled = !enabled || remoteCapabilities.torch !== true;
}

async function startCamera() {
  selectedRole = 'camera';
  cameraStatus.textContent = '';
  $('#start-camera').disabled = true;
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador não oferece acesso à câmera. Abra o site em HTTPS.');
    const video = {
      ...(cameraSelect.value ? { deviceId: { exact: cameraSelect.value } } : { facingMode: cameraFacing }),
      width: { ideal: 1280 },
      height: { ideal: 720 }
    };
    const audio = microphoneSelect.value ? { deviceId: { exact: microphoneSelect.value } } : true;
    localStream = await navigator.mediaDevices.getUserMedia({ audio, video });
    cameraVideo.srcObject = localStream;
    $('#camera-placeholder').hidden = true;
    $('#camera-live').hidden = false;
    await refreshDevices();
    cameraStatus.textContent = 'Conectando ao serviço de sinalização…';
    socket = await connectSocket(handleCameraMessage);
    cameraStatus.textContent = '';
    socket.send(JSON.stringify({ type: 'create' }));
  } catch (error) {
    cameraStatus.textContent = explainError(error);
    if (localStream) {
      for (const track of localStream.getTracks()) track.stop();
      localStream = undefined;
      cameraVideo.srcObject = null;
    }
    $('#camera-placeholder').hidden = false;
    $('#camera-live').hidden = true;
    $('#start-camera').disabled = false;
  }
}

function handleCameraMessage(message) {
  if (message.type === 'created') {
    $('#pairing-card').hidden = false;
    $('#pairing-code').textContent = message.code;
    try {
      pairingUrl = createPairingUrl(location.origin, message.code);
      renderPairingQr(pairingUrl);
    } catch (error) {
      reportError(`Não foi possível gerar o QR localmente: ${explainError(error)}`);
    }
    $('#start-camera').textContent = 'Código criado';
    $('#pairing-status').textContent = 'Aguardando o monitor conectar…';
    pairDeadline = Date.now() + message.expiresInSeconds * 1000;
    pairTimer = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((pairDeadline - Date.now()) / 1000));
      $('#pairing-status').textContent = remaining
        ? `Aguardando o monitor conectar… ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`
        : 'Código expirado. Encerre e crie outro para tentar novamente.';
    }, 500);
  } else if (message.type === 'peer-connected') {
    clearInterval(pairTimer);
    $('#pairing-status').textContent = 'Monitor conectado. Estabelecendo transmissão…';
    $('#connection-detail').textContent = 'Monitor pareado. Negociando a conexão WebRTC…';
    loadIceConfiguration()
      .then(configuration => createPeer(configuration, 'camera'))
      .catch(error => reportError(explainError(error)));
  } else if (message.type === 'signal') {
    handleCameraSignal(message.data).catch(error => reportError(explainError(error)));
  } else if (message.type === 'error') {
    cameraStatus.textContent = message.message;
  } else if (message.type === 'expired') {
    $('#pairing-status').textContent = 'Código expirado. Encerre e crie outro para tentar novamente.';
  } else if (message.type === 'peer-disconnected') {
    $('#pairing-status').textContent = 'O outro aparelho desconectou.';
  }
}

async function handleCameraSignal(data) {
  if (!peer || !data) return;
  if (data.type === 'answer') {
    await peer.setRemoteDescription({ type: 'answer', sdp: data.sdp });
    await flushPendingIceCandidates();
  } else if (data.type === 'candidate' && data.candidate) {
    await addIceCandidate(data.candidate);
  }
}

async function refreshDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const devices = await navigator.mediaDevices.enumerateDevices();
  updateDeviceList(cameraSelect, devices.filter(device => device.kind === 'videoinput'), 'Câmera padrão');
  updateDeviceList(microphoneSelect, devices.filter(device => device.kind === 'audioinput'), 'Microfone padrão');
}

function updateDeviceList(select, devices, defaultLabel) {
  const selected = select.value;
  select.replaceChildren(new Option(defaultLabel, ''));
  devices.forEach((device, index) => {
    select.add(new Option(device.label || `Dispositivo ${index + 1}`, device.deviceId));
  });
  if (devices.some(device => device.deviceId === selected)) select.value = selected;
}

async function replaceDevice(kind, deviceId) {
  if (!localStream) return;
  try {
    const constraints = kind === 'video'
      ? { video: deviceId ? { deviceId: { exact: deviceId } } : { facingMode: cameraFacing }, audio: false }
      : { audio: deviceId ? { deviceId: { exact: deviceId } } : true, video: false };
    const replacement = await navigator.mediaDevices.getUserMedia(constraints);
    const nextTrack = kind === 'video' ? replacement.getVideoTracks()[0] : replacement.getAudioTracks()[0];
    const previousTrack = kind === 'video' ? localStream.getVideoTracks()[0] : localStream.getAudioTracks()[0];
    if (previousTrack && peer) {
      const sender = peer.getSenders().find(item => item.track === previousTrack);
      if (sender) await sender.replaceTrack(nextTrack);
    }
    if (previousTrack) {
      localStream.removeTrack(previousTrack);
      previousTrack.stop();
    }
    localStream.addTrack(nextTrack);
    replacement.getTracks().filter(track => track !== nextTrack).forEach(track => track.stop());
    if (kind === 'video') cameraVideo.srcObject = localStream;
    if (dataChannel?.readyState === 'open') sendControlMessage({ type: 'capabilities', capabilities: getCameraCapabilities() });
  } catch (error) {
    cameraStatus.textContent = `Não foi possível trocar o dispositivo: ${explainError(error)}`;
    await refreshDevices();
  }
}

async function applyRemoteControl(action, value) {
  const track = localStream?.getVideoTracks()[0];
  const audioTrack = localStream?.getAudioTracks()[0];
  try {
    if (action === 'switch-camera' && track) {
      cameraFacing = cameraFacing === 'environment' ? 'user' : 'environment';
      const next = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: cameraFacing } },
        audio: false
      });
      const nextTrack = next.getVideoTracks()[0];
      const sender = peer?.getSenders().find(item => item.track === track);
      if (sender) await sender.replaceTrack(nextTrack);
      localStream.removeTrack(track);
      track.stop();
      localStream.addTrack(nextTrack);
      cameraVideo.srcObject = localStream;
      await refreshDevices();
      sendControlMessage({ type: 'capabilities', capabilities: getCameraCapabilities() });
    } else if (action === 'mute' && audioTrack && typeof value === 'boolean') {
      audioTrack.enabled = !value;
      sendControlMessage({ type: 'state', muted: true, value });
    } else if (action === 'resolution' && track && [360, 720, 1080].includes(value)) {
      const height = value;
      await track.applyConstraints({ width: { ideal: Math.round(height * 16 / 9) }, height: { ideal: height } });
    } else if (action === 'zoom' && track && Number.isFinite(value)) {
      const caps = track.getCapabilities?.();
      if (caps?.zoom && value >= caps.zoom.min && value <= caps.zoom.max) {
        await track.applyConstraints({ advanced: [{ zoom: value }] });
      }
    } else if (action === 'torch' && track && typeof value === 'boolean') {
      const caps = track.getCapabilities?.();
      if (caps?.torch === true || Array.isArray(caps?.torch) && caps.torch.includes(true)) {
        await track.applyConstraints({ advanced: [{ torch: value }] });
        remoteTorch = value;
      }
    }
  } catch {
    cameraStatus.textContent = 'O navegador ou dispositivo não conseguiu aplicar esse controle.';
  }
}

function sendControl(action, value) {
  sendControlMessage({ type: 'control', action, value });
}

async function joinCamera(event) {
  event.preventDefault();
  selectedRole = 'monitor';
  const code = $('#pairing-input').value.trim();
  if (!/^[A-Za-z0-9_-]{32}$/.test(code)) {
    monitorStatus.textContent = 'Digite o código completo de 32 caracteres.';
    return;
  }
  $('#join-button').disabled = true;
  monitorStatus.textContent = 'Conectando ao serviço de sinalização… Se a demo gratuita estiver suspensa, aguarde o serviço acordar.';
  try {
    iceConfiguration = await loadIceConfiguration();
    socket = await connectSocket(handleMonitorMessage);
    socket.send(JSON.stringify({ type: 'join', code }));
    monitorStatus.textContent = 'Validando código…';
  } catch (error) {
    monitorStatus.textContent = explainError(error);
    $('#join-button').disabled = false;
  }
}

function handleMonitorMessage(message) {
  if (message.type === 'joined') {
    $('#join-form').hidden = true;
    $('#monitor-session').hidden = false;
    monitorStatus.textContent = '';
    $('#connection-detail').textContent = 'Código aceito. Negociando a conexão de mídia…';
    try {
      createPeer(iceConfiguration, 'monitor');
      pendingMonitorSignals.flush(handleMonitorSignal)
        .catch(error => reportError(`Não foi possível negociar a conexão: ${explainError(error)}`));
    } catch (error) {
      reportError(explainError(error));
    }
  } else if (message.type === 'signal') {
    pendingMonitorSignals.receive(message.data, data => handleMonitorSignal(data)
      .catch(error => reportError(`Não foi possível negociar a conexão: ${explainError(error)}`)));
  } else if (message.type === 'error') {
    monitorStatus.textContent = message.message;
    $('#join-button').disabled = false;
    socket?.close(1000, 'Pareamento recusado');
    socket = undefined;
  } else if (message.type === 'peer-disconnected') {
    reportError('A câmera encerrou a conexão. Volte à tela inicial e peça um novo código para reconectar.');
    $('#connection-badge').lastChild.textContent = ' Câmera desconectada';
    $('#monitor-placeholder').textContent = 'A câmera encerrou a conexão.';
    $('#monitor-placeholder').hidden = false;
    $('#play-video').hidden = true;
    enableRemoteControls(false);
    if (peer) peer.close();
    peer = undefined;
  } else if (message.type === 'expired') {
    monitorStatus.textContent = 'O código expirou. Peça outro código à câmera.';
  }
}

async function playRemoteVideo() {
  try {
    await remoteVideo.play();
    $('#play-video').hidden = true;
    $('#connection-detail').textContent = 'Áudio e vídeo recebidos neste aparelho.';
  } catch {
    $('#play-video').hidden = false;
    $('#connection-detail').textContent = 'O navegador bloqueou a reprodução automática. Toque no botão sobre o vídeo para iniciar áudio e imagem.';
  }
}

async function handleMonitorSignal(data) {
  if (!peer || !data) return;
  if (data.type === 'offer') {
    $('#connection-detail').textContent = 'Oferta recebida. Preparando a resposta WebRTC…';
    await peer.setRemoteDescription({ type: 'offer', sdp: data.sdp });
    await flushPendingIceCandidates();
    await peer.setLocalDescription(await peer.createAnswer());
    sendSignal({ type: 'answer', sdp: peer.localDescription.sdp });
    $('#connection-detail').textContent = 'Resposta enviada. Aguardando conexão de mídia; redes restritas podem exigir TURN.';
  } else if (data.type === 'candidate' && data.candidate) {
    await addIceCandidate(data.candidate);
  }
}

async function addIceCandidate(candidate) {
  if (!peer?.remoteDescription) {
    pendingIceCandidates.push(candidate);
    return;
  }
  await peer.addIceCandidate(candidate);
}

async function flushPendingIceCandidates() {
  const candidates = pendingIceCandidates;
  pendingIceCandidates = [];
  for (const candidate of candidates) await peer.addIceCandidate(candidate);
}

function startLocalAlerts() {
  stopLocalAlerts();
  if ($('#motion-alert').checked) startMotionAnalysis();
  if ($('#volume-alert').checked) startVolumeAnalysis();
}

function stopLocalAlerts() {
  clearTimeout(motionTimer);
  cancelAnimationFrame(volumeFrame);
  motionTimer = undefined;
  volumeFrame = undefined;
  if (analysisSource) analysisSource.disconnect();
  analysisSource = undefined;
  if (analysisContext) analysisContext.close();
  analysisContext = undefined;
  previousFrame = undefined;
}

function triggerLocalAlert(kind) {
  const now = Date.now();
  if (now - lastAlertAt < 5000) return;
  lastAlertAt = now;
  $('#alert-status').textContent = `Atividade de ${kind} percebida neste aparelho.`;
  if ('vibrate' in navigator) navigator.vibrate(150);
}

function startMotionAnalysis() {
  const video = remoteVideo;
  const canvas = $('#analysis-canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) {
    $('#alert-status').textContent = 'Análise de movimento indisponível neste navegador.';
    return;
  }
  canvas.width = 32;
  canvas.height = 24;
  const sample = () => {
    if (!$('#motion-alert').checked) return;
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const frame = new Uint8Array(canvas.width * canvas.height);
      for (let i = 0, p = 0; i < pixels.length; i += 4, p += 1) {
        frame[p] = (pixels[i] * 3 + pixels[i + 1] * 6 + pixels[i + 2]) / 10;
      }
      if (previousFrame) {
        let diff = 0;
        for (let i = 0; i < frame.length; i += 1) diff += Math.abs(frame[i] - previousFrame[i]);
        if (diff / frame.length > 10) triggerLocalAlert('movimento');
      }
      previousFrame = frame;
    }
    motionTimer = setTimeout(sample, 500);
  };
  sample();
}

async function startVolumeAnalysis() {
  const stream = remoteVideo.srcObject;
  if (!stream || !window.AudioContext) {
    $('#alert-status').textContent = 'Análise de volume indisponível neste navegador.';
    return;
  }
  try {
    analysisContext = new AudioContext();
    await analysisContext.resume();
    analysisSource = analysisContext.createMediaStreamSource(stream);
    const analyser = analysisContext.createAnalyser();
    analyser.fftSize = 512;
    analysisSource.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    const inspect = () => {
      if (!$('#volume-alert').checked || !analysisContext) return;
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const sample of data) {
        const normalized = (sample - 128) / 128;
        sum += normalized * normalized;
      }
      const rms = Math.sqrt(sum / data.length) * 100;
      if (rms > Number($('#volume-threshold').value)) triggerLocalAlert('volume');
      volumeFrame = requestAnimationFrame(inspect);
    };
    inspect();
  } catch {
    $('#alert-status').textContent = 'O navegador não permitiu iniciar a análise local de volume.';
  }
}

function updateAlertMonitoring() {
  stopLocalAlerts();
  const motion = $('#motion-alert').checked;
  const volume = $('#volume-alert').checked;
  if (motion && remoteVideo.srcObject) startMotionAnalysis();
  if (volume && remoteVideo.srcObject) startVolumeAnalysis();
  $('#alert-status').textContent = motion || volume ? 'Análise experimental ativa apenas enquanto esta tela estiver aberta.' : 'Alertas desligados.';
}

function renderPairingQr(url) {
  const qr = qrcode(0, 'M');
  qr.addData(url, 'Byte');
  qr.make();
  const canvas = $('#pairing-qr');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas indisponível neste navegador.');
  const count = qr.getModuleCount();
  const cellSize = 4;
  const margin = 4;
  canvas.width = canvas.height = (count + margin * 2) * cellSize;
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.translate(margin * cellSize, margin * cellSize);
  qr.renderTo2dContext(context, cellSize);
  context.restore();
}

function consumePairingFragment() {
  if (!location.hash) return;
  const code = readPairingCodeFromFragment(location.hash);
  history.replaceState(null, '', `${location.pathname}${location.search}`);
  if (code) {
    $('#pairing-input').value = code;
    monitorStatus.textContent = 'Link de pareamento recebido. Confira o aparelho da câmera e toque em Conectar.';
    showScreen(monitorScreen);
  }
}

for (const button of document.querySelectorAll('[data-role]')) {
  button.addEventListener('click', () => {
    if (button.dataset.role === 'camera') {
      selectedRole = 'camera';
      showScreen(cameraScreen);
    } else {
      selectedRole = 'monitor';
      showScreen(monitorScreen);
    }
  });
}
document.querySelectorAll('[data-home]').forEach(button => button.addEventListener('click', () => {
  closeSession();
  $('#start-camera').disabled = false;
  $('#start-camera').textContent = 'Iniciar câmera e criar código';
  $('#join-button').disabled = false;
  $('#camera-status').textContent = '';
  $('#monitor-status').textContent = 'A conexão usa WebRTC com criptografia ponto a ponto.';
  showScreen(homeScreen);
}));
$('#start-camera').addEventListener('click', startCamera);
$('#join-form').addEventListener('submit', joinCamera);
$('#end-session').addEventListener('click', () => {
  closeSession();
  $('#join-button').disabled = false;
  $('#monitor-status').textContent = 'Conexão encerrada.';
});
$('#play-video').addEventListener('click', playRemoteVideo);
$('#camera-select').addEventListener('change', () => replaceDevice('video', cameraSelect.value));
$('#microphone-select').addEventListener('change', () => replaceDevice('audio', microphoneSelect.value));
$('#copy-code').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('#pairing-code').textContent);
    $('#copy-code').textContent = 'Código copiado';
  } catch {
    cameraStatus.textContent = 'Não foi possível copiar. Selecione e copie o código manualmente.';
  }
});
$('#switch-camera').addEventListener('click', () => sendControl('switch-camera', true));
$('#mute-camera').addEventListener('click', () => {
  remoteMuted = !remoteMuted;
  sendControl('mute', remoteMuted);
  $('#mute-camera').textContent = remoteMuted ? 'Ativar microfone' : 'Silenciar microfone';
});
$('#resolution-select').addEventListener('change', () => sendControl('resolution', Number($('#resolution-select').value)));
$('#zoom-range').addEventListener('input', () => {
  const zoom = Number($('#zoom-range').value);
  $('#zoom-value').textContent = `${zoom.toFixed(1)}×`;
  sendControl('zoom', zoom);
});
$('#torch-button').addEventListener('click', () => {
  remoteTorch = !remoteTorch;
  sendControl('torch', remoteTorch);
  $('#torch-button').textContent = remoteTorch ? 'Desligar flash' : 'Ligar flash';
});
$('#motion-alert').addEventListener('change', updateAlertMonitoring);
$('#volume-alert').addEventListener('change', updateAlertMonitoring);
$('#volume-threshold').addEventListener('input', updateAlertMonitoring);
navigator.mediaDevices?.addEventListener?.('devicechange', refreshDevices);
window.addEventListener('pagehide', closeSession);
window.addEventListener('hashchange', consumePairingFragment);
consumePairingFragment();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('/sw.js').catch(() => {
    console.warn('O modo instalável não pôde ser ativado neste navegador.');
  });
}
