/* global __native, __timer, __clearTimer, __request, __cancelRequest */
// JavaScriptCore supplies ECMAScript. These narrow host adapters cover the
// portable messenger's web primitives; no React Native runtime is loaded.
(() => {
  const native = (operation, input) => {
    const result = JSON.parse(__native(operation, JSON.stringify(input ?? null)));
    if (result.error) throw new Error(result.error);
    return result.value;
  };
  globalThis.TextEncoder = class {
    encode(value = '') {
      return Uint8Array.from(native('utf8Encode', String(value)));
    }
  };
  globalThis.TextDecoder = class {
    constructor(_encoding, options) {
      this.fatal = Boolean(options?.fatal);
    }
    decode(bytes = new Uint8Array()) {
      return native('utf8Decode', { bytes: Array.from(bytes), fatal: this.fatal });
    }
  };
  globalThis.btoa = (value) => native('btoa', value);
  globalThis.atob = (value) => native('atob', value);
  globalThis.URL = class {
    constructor(value) {
      Object.assign(this, native('url', String(value)));
    }
    toString() {
      return this.href;
    }
  };
  globalThis.AbortController = class {
    constructor() {
      const listeners = new Set();
      this.signal = {
        aborted: false,
        addEventListener: (_, fn) => listeners.add(fn),
        removeEventListener: (_, fn) => listeners.delete(fn),
      };
      this.abort = () => {
        this.signal.aborted = true;
        for (const listener of listeners) listener();
      };
    }
  };
  globalThis.setTimeout = (callback, delay = 0, ...args) =>
    __timer(() => callback(...args), Math.max(0, delay));
  globalThis.clearTimeout = (id) => __clearTimer(id);
  globalThis.fetch = (url, options) =>
    new Promise((resolve, reject) => {
      if (options?.signal?.aborted) return reject(new Error('PHONE_REQUEST_FAILED'));
      const id = __request(String(url), String(options?.body ?? ''), (encoded) => {
        options?.signal?.removeEventListener('abort', abort);
        const result = JSON.parse(encoded);
        if (result.error) reject(new Error(result.error));
        else
          resolve({
            ok: result.status >= 200 && result.status < 300,
            headers: {
              get: (name) =>
                name.toLowerCase() === 'content-length' ? String(result.text.length) : null,
            },
            text: async () => result.text,
          });
      });
      const abort = () => {
        __cancelRequest(id);
        reject(new Error('PHONE_REQUEST_FAILED'));
      };
      options?.signal?.addEventListener('abort', abort);
    });
})();
