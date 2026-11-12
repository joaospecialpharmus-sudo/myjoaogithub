export function initializeInstall() {
  let pending = null;
  const root = document.createElement("div");
  root.id = "install-controls";
  root.innerHTML =
    '<button id="install-app" type="button">↓ Instalar app</button><dialog id="install-help"><div class="section-head"><h2>Instalar A dois</h2><button type="button" id="close-install" aria-label="Fechar instruções">×</button></div><p>No <strong>iPhone</strong>, abra o site no Safari, toque em <strong>Compartilhar → Adicionar à Tela de Início</strong> e confirme.</p><p>No <strong>Android</strong>, abra no Chrome, toque no menu <strong>⋮ → Instalar aplicativo</strong> ou <strong>Adicionar à tela inicial</strong>.</p><p>O app usa seu mesmo login e autenticador. É necessária conexão à internet para acessar as contas.</p></dialog>';
  document.body.append(root);
  const button = root.querySelector("#install-app"),
    help = root.querySelector("dialog");
  const standalone = () =>
    matchMedia("(display-mode: standalone)").matches ||
    navigator.standalone === true;
  const sync = () => {
    button.hidden = standalone();
  };
  sync();
  matchMedia("(display-mode: standalone)").addEventListener("change", sync);
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    pending = event;
    sync();
  });
  window.addEventListener("appinstalled", () => {
    pending = null;
    button.hidden = true;
    help.close();
  });
  root.querySelector("#close-install").onclick = () => help.close();
  button.onclick = async () => {
    if (pending) {
      const request = pending;
      pending = null;
      await request.prompt();
      await request.userChoice;
      return;
    }
    help.showModal();
  };
  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    navigator.serviceWorker
      .register(
        new URL("sw.js", new URL(import.meta.env.BASE_URL, document.baseURI)),
        { scope: import.meta.env.BASE_URL, updateViaCache: "none" },
      )
      .catch(() => {
        /* A instalação manual continua disponível se o navegador não oferecer service worker. */
      });
  }
}
