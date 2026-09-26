export class Api {
  constructor() {
    this.setProfile("dispatcher");
  }
  setProfile(value) {
    this.actor = value.startsWith("unit:")
      ? {
          id: `local-${value.slice(5)}`,
          role: "crew_leader",
          unitId: value.slice(5),
        }
      : { id: `local-${value}`, role: value };
  }
  async request(path, { body, key, token, signal } = {}) {
    const actor = this.actor;
    const headers = { "x-actor-id": actor.id, "x-actor-role": actor.role };
    if (actor.unitId) headers["x-unit-id"] = actor.unitId;
    if (token) headers["x-peer-token"] = token;
    if (body) {
      headers["content-type"] = "application/json";
      headers["idempotency-key"] = key || crypto.randomUUID();
    }
    const response = await fetch(path, {
      method: body ? "POST" : "GET",
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: signal || AbortSignal.timeout(10000),
      cache: "no-store",
    });
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(
        result.error?.message || "No se pudo completar la solicitud.",
      );
      error.code = result.error?.code;
      throw error;
    }
    return result;
  }
}
