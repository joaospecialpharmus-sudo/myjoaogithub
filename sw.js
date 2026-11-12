// Intencionalmente sem Cache Storage: dados, tokens, PDFs e respostas da API não ficam em cache offline.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) =>
  event.waitUntil(self.clients.claim()),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url),
    scope = new URL(self.registration.scope);
  if (
    event.request.method !== "GET" ||
    event.request.mode !== "navigate" ||
    url.origin !== scope.origin ||
    !url.pathname.startsWith(scope.pathname)
  )
    return;
  event.respondWith(
    fetch(event.request, { cache: "no-store" }).catch(
      () =>
        new Response(
          '<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>A dois · Sem conexão</title><body><h1>Sem conexão</h1><p>Conecte-se à internet para entrar no A dois. Seus dados financeiros não são disponibilizados offline.</p><a href="./">Tentar novamente</a></body></html>',
          {
            status: 503,
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "no-store",
              "Content-Security-Policy":
                "default-src 'none'; base-uri 'none'; form-action 'none'",
            },
          },
        ),
    ),
  );
});
