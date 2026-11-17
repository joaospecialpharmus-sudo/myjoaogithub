export function canUseLocalNotifications(windowObject, navigatorObject) {
  return windowObject.isSecureContext === true
    && typeof windowObject.Notification?.requestPermission === 'function'
    && (navigatorObject.serviceWorker?.ready !== undefined
      || typeof windowObject.Notification === 'function');
}

export function getLocalNotificationAvailabilityMessage(windowObject, navigatorObject) {
  if (windowObject.isSecureContext !== true) {
    return 'Notificações do sistema exigem uma conexão segura HTTPS.';
  }
  if (typeof windowObject.Notification?.requestPermission !== 'function') {
    return 'Este modo do navegador não oferece notificações do sistema. Os alertas na página funcionam enquanto ela estiver aberta.';
  }
  if (navigatorObject.serviceWorker?.ready === undefined && typeof windowObject.Notification !== 'function') {
    return 'Este navegador não oferece notificações neste contexto. Os alertas na página funcionam enquanto ela estiver aberta.';
  }
  return '';
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

export async function showLocalNotification(navigatorObject, title, body, tag, windowObject = globalThis) {
  if (navigatorObject.serviceWorker?.ready !== undefined) {
    const registration = await navigatorObject.serviceWorker.ready;
    if (typeof registration.showNotification === 'function') {
      await registration.showNotification(title, {
        body,
        icon: '/icon.svg',
        badge: '/icon.svg',
        tag,
        renotify: false,
        data: { url: '/' }
      });
      return;
    }
  }
  const NotificationConstructor = windowObject.Notification;
  if (typeof NotificationConstructor !== 'function') {
    throw new Error('Este navegador não permite mostrar notificações neste contexto.');
  }
  new NotificationConstructor(title, { body, tag, icon: '/icon.svg' });
}
