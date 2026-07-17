/**
 * Small HTTP client shared by every dashboard page.
 *
 * Raspberry requests can fail because the service is restarting, a sensor
 * route is busy, or the SSH tunnel has dropped. Keeping response parsing and
 * timeout handling here gives every action the same predictable contract.
 */
const DashboardApi = (() => {
  const DEFAULT_TIMEOUT_MS = 8000;

  async function request(url, options = {}) {
    const controller = new AbortController();
    const timeoutMs = Number(options.timeoutMs || DEFAULT_TIMEOUT_MS);
    const timeoutId = window.setTimeout(() => controller.abort(), timeoutMs);
    const headers = new Headers(options.headers || {});
    const requestOptions = {
      cache: "no-store",
      ...options,
      headers,
      signal: options.signal || controller.signal,
    };
    delete requestOptions.timeoutMs;

    if (requestOptions.body && !(requestOptions.body instanceof FormData) && typeof requestOptions.body !== "string") {
      headers.set("Content-Type", "application/json");
      requestOptions.body = JSON.stringify(requestOptions.body);
    }
    headers.set("Accept", "application/json");

    try {
      const response = await fetch(url, requestOptions);
      let data = null;
      try {
        data = await response.json();
      } catch (error) {
        data = null;
      }
      return { ok: response.ok, status: response.status, data };
    } catch (error) {
      const message = error?.name === "AbortError"
        ? "The Raspberry Pi did not respond within the expected time."
        : "Dashboard non raggiungibile";
      return { ok: false, status: 0, data: null, error, message };
    } finally {
      window.clearTimeout(timeoutId);
    }
  }

  async function action(url, body = null, options = {}) {
    const result = await request(url, {
      method: "POST",
      body,
      ...options,
    });
    const payload = result.data;
    if (!result.ok || payload?.ok === false) {
      throw new Error(payload?.error || payload?.message || result.message || `Richiesta non riuscita (${result.status})`);
    }
    return payload;
  }

  return { request, action };
})();
