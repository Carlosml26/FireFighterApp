import { randomUUID } from "node:crypto";
import { DomainError } from "./domain.js";

/** Ephemeral rendezvous only: SDP/ICE, never text or voice content. */
export class SignalingHub {
  #peers = new Map();
  constructor(core, { clock = () => Date.now() } = {}) {
    this.core = core;
    this.clock = clock;
  }

  #authorize(actor, incidentId) {
    const state = this.core.snapshot(actor);
    const incident = state.incidents.find(
      (item) => item.id === incidentId && item.status === "open",
    );
    const crewAssigned =
      actor.role === "crew_leader" &&
      state.assignments.some(
        (a) =>
          a.incidentId === incidentId &&
          a.unitId === actor.unitId &&
          ["pending", "acknowledged"].includes(a.status),
      );
    if (
      !incident ||
      (!["dispatcher", "incident_commander"].includes(actor.role) &&
        !crewAssigned)
    ) {
      throw new DomainError(
        "forbidden",
        "Solo los participantes de una intervención abierta pueden acceder al canal.",
        403,
      );
    }
    return actor.role === "crew_leader"
      ? state.units.find((u) => u.id === actor.unitId)?.callSign
      : "Central";
  }

  #prune() {
    for (const [id, peer] of this.#peers) {
      try {
        if (this.clock() - peer.seenAt > 30_000) throw new Error("expired");
        this.#authorize(peer.actor, peer.incidentId);
      } catch {
        this.#peers.delete(id);
      }
    }
  }

  join(actor, { incidentId }) {
    this.#prune();
    const label = this.#authorize(actor, incidentId);
    if (this.#peers.size >= 100)
      throw new DomainError(
        "capacity",
        "Canal ocupado. Inténtalo de nuevo.",
        429,
      );
    const peer = {
      id: randomUUID(),
      token: randomUUID(),
      actor: structuredClone(actor),
      label,
      incidentId,
      seenAt: this.clock(),
      inbox: [],
      sequence: 0,
    };
    this.#peers.set(peer.id, peer);
    return { peerId: peer.id, token: peer.token };
  }

  #get(actor, peerId, token) {
    this.#prune();
    const peer = this.#peers.get(peerId);
    if (
      !peer ||
      peer.token !== token ||
      peer.actor.id !== actor.id ||
      peer.actor.role !== actor.role ||
      peer.actor.unitId !== actor.unitId
    ) {
      throw new DomainError(
        "peer_expired",
        "La sesión del canal ha caducado. Vuelve a conectar.",
        403,
      );
    }
    this.#authorize(actor, peer.incidentId);
    peer.seenAt = this.clock();
    return peer;
  }

  poll(actor, peerId, token, after = 0) {
    const peer = this.#get(actor, peerId, token);
    if (!Number.isSafeInteger(after) || after < 0)
      throw new DomainError("validation_error", "Cursor inválido.");
    peer.inbox = peer.inbox.filter((message) => message.sequence > after);
    const peers = [...this.#peers.values()]
      .filter((p) => p.id !== peer.id && p.incidentId === peer.incidentId)
      .map(({ id, label }) => ({ id, label }));
    return { peers, signals: peer.inbox, cursor: peer.sequence };
  }

  signal(actor, input, token) {
    const peer = this.#get(actor, input.peerId, token);
    const target = this.#peers.get(input.targetId);
    if (
      !target ||
      target.incidentId !== peer.incidentId ||
      target.id === peer.id
    ) {
      throw new DomainError(
        "forbidden",
        "El destinatario no está en este canal.",
        403,
      );
    }
    // Accept only browser-generated negotiation fields, bounded by HTTP body size.
    const payload = input.description
      ? {
          description: {
            type: input.description.type,
            sdp: input.description.sdp,
          },
        }
      : input.candidate
        ? { candidate: input.candidate }
        : null;
    if (
      !payload ||
      (payload.description &&
        (!["offer", "answer"].includes(payload.description.type) ||
          typeof payload.description.sdp !== "string")) ||
      (payload.candidate &&
        (typeof payload.candidate !== "object" ||
          typeof payload.candidate.candidate !== "string"))
    ) {
      throw new DomainError("validation_error", "Señal WebRTC inválida.");
    }
    if (target.inbox.length >= 256)
      throw new DomainError("capacity", "Demasiadas señales pendientes.", 429);
    target.inbox.push({
      sequence: ++target.sequence,
      from: peer.id,
      ...payload,
    });
    return { accepted: true };
  }

  leave(actor, peerId, token) {
    this.#get(actor, peerId, token);
    this.#peers.delete(peerId);
    return { disconnected: true };
  }
}
