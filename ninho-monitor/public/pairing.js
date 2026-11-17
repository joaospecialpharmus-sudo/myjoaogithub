const PAIRING_CODE_PATTERN = /^[A-Za-z0-9_-]{32}$/;

export function createPairingUrl(origin, code) {
  if (!PAIRING_CODE_PATTERN.test(code)) throw new TypeError('Código de pareamento inválido.');
  let url;
  try {
    url = new URL('/', origin);
  } catch {
    throw new TypeError('Origem de pareamento inválida.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new TypeError('Origem de pareamento inválida.');
  url.hash = new URLSearchParams({ join: code }).toString();
  return url.href;
}

export function readPairingCodeFromFragment(fragment) {
  const value = new URLSearchParams(fragment.startsWith('#') ? fragment.slice(1) : fragment).get('join');
  return value && PAIRING_CODE_PATTERN.test(value) ? value : null;
}
