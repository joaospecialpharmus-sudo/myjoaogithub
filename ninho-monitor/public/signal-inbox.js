export function createSignalInbox() {
  const pending = [];
  let ready = false;

  return {
    receive(signal, handle) {
      if (ready) return handle(signal);
      pending.push(signal);
    },
    async flush(handle) {
      ready = true;
      for (const signal of pending.splice(0)) await handle(signal);
    },
    clear() {
      pending.length = 0;
      ready = false;
    }
  };
}
