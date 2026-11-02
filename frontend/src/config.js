export const API_URL = import.meta.env.VITE_API_URL || "";

const DEVICE_ID_KEY = "smartsplit:device-id";
let fallbackDeviceId = "";

function createDeviceId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    return (char === "x" ? random : (random & 0x3) | 0x8).toString(16);
  });
}

export function getDeviceId() {
  try {
    let deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
      deviceId = createDeviceId();
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
    return deviceId;
  } catch {
    if (!fallbackDeviceId) fallbackDeviceId = createDeviceId();
    return fallbackDeviceId;
  }
}

export function getDeviceName() {
  const platform = navigator.userAgentData?.platform || navigator.platform || "Web browser";
  return `This browser · ${String(platform).slice(0, 72)}`;
}

export function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("X-Device-ID", getDeviceId());
  return fetch(`${API_URL}${path}`, { ...options, headers, credentials: "include" }).then((response) => {
    if (response.status === 401 && path !== "/api/auth/login" && path !== "/api/auth/register" && path !== "/api/auth/me") {
      window.dispatchEvent(new Event("smartsplit:unauthorized"));
    }
    return response;
  });
}
