export function canUseLocalNotifications(windowObject, navigatorObject) {
  return windowObject.isSecureContext === true
    && typeof windowObject.Notification?.requestPermission === 'function'
    && navigatorObject.serviceWorker?.ready !== undefined;
}

export function motionThresholdForSensitivity(sensitivity) {
  const value = Number(sensitivity);
  if (!Number.isFinite(value)) throw new TypeError('A sensibilidade deve ser numérica.');
  return 22 - (Math.min(10, Math.max(1, value)) - 1) * 2;
}

export async function requestLocalNotificationPermission(windowObject, navigatorObject) {
  if (!canUseLocalNotifications(windowObject, navigatorObject)) {
    throw new Error('Este navegador não oferece notificações locais por service worker neste contexto.');
  }
  return windowObject.Notification.requestPermission();
}

export async function showLocalNotification(navigatorObject, title, body, tag) {
  const registration = await navigatorObject.serviceWorker.ready;
  if (typeof registration.showNotification !== 'function') {
    throw new Error('Este navegador não permite mostrar notificações pelo service worker.');
  }
  await registration.showNotification(title, {
    body,
    icon: '/icon.svg',
    badge: '/icon.svg',
    tag,
    renotify: false,
    data: { url: '/' }
  });
}
