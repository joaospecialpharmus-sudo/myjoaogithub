export function createCameraMediaConstraints({
  cameraDeviceId = '',
  microphoneDeviceId = '',
  cameraFacing = 'environment'
} = {}) {
  return {
    audio: {
      ...(microphoneDeviceId ? { deviceId: { exact: microphoneDeviceId } } : {}),
      echoCancellation: { ideal: false },
      noiseSuppression: { ideal: false },
      autoGainControl: { ideal: false }
    },
    video: {
      ...(cameraDeviceId ? { deviceId: { exact: cameraDeviceId } } : { facingMode: cameraFacing }),
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  };
}
