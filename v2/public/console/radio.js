/** WebRTC data channels. HTTP only carries presence and negotiation, never content. */
export class PeerRadio {
  constructor(api, onChange) {
    this.api = api;
    this.onChange = onChange;
    this.peers = new Map();
    this.messages = [];
    this.session = null;
    this.generation = 0;
    this.status = "Desconectado";
    this.urls = [];
  }
  async connect(incidentId) {
    await this.disconnect();
    if (!globalThis.RTCPeerConnection)
      throw new Error("Este navegador no admite WebRTC.");
    const generation = ++this.generation;
    this.status = "Conectando…";
    this.onChange();
    const session = await this.api.request("/v1/peers", {
      body: { incidentId },
    });
    if (generation !== this.generation) return;
    this.session = session;
    this.incidentId = incidentId;
    this.cursor = 0;
    this.status = "Esperando participantes";
    this.poll(generation);
  }
  async disconnect() {
    ++this.generation;
    clearTimeout(this.timer);
    if (this.recording) this.stopRecording();
    const session = this.session;
    this.session = null;
    for (const peer of this.peers.values()) {
      peer.pc.close();
    }
    this.peers.clear();
    this.messages = [];
    this.incidentId = null;
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls = [];
    this.status = "Desconectado";
    this.onChange();
    if (session)
      await this.api
        .request("/v1/peer-leave", {
          body: { peerId: session.peerId },
          token: session.token,
        })
        .catch(() => {});
  }
  async poll(generation) {
    if (generation !== this.generation || !this.session) return;
    try {
      const session = this.session;
      const result = await this.api.request(
        `/v1/peers?peerId=${session.peerId}&after=${this.cursor}`,
        { token: session.token },
      );
      if (generation !== this.generation) return;
      const ids = new Set(result.peers.map((p) => p.id));
      for (const [id, peer] of this.peers)
        if (!ids.has(id)) {
          peer.pc.close();
          this.peers.delete(id);
        }
      for (const info of result.peers) {
        const peer =
          this.peers.get(info.id) || this.createPeer(info, generation);
        if (session.peerId < info.id && !peer.started) {
          peer.started = true;
          this.attachChannel(
            peer,
            peer.pc.createDataChannel("brigada", { ordered: true }),
          );
          await peer.pc.setLocalDescription(await peer.pc.createOffer());
          await this.signal(info.id, { description: peer.pc.localDescription });
        }
      }
      for (const signal of result.signals) {
        const peer = this.peers.get(signal.from);
        if (!peer) continue;
        if (signal.description) {
          await peer.pc.setRemoteDescription(signal.description);
          for (const candidate of peer.candidates.splice(0))
            await peer.pc.addIceCandidate(candidate);
          if (signal.description.type === "offer") {
            peer.started = true;
            await peer.pc.setLocalDescription(await peer.pc.createAnswer());
            await this.signal(signal.from, {
              description: peer.pc.localDescription,
            });
          }
        } else if (signal.candidate) {
          if (peer.pc.remoteDescription)
            await peer.pc.addIceCandidate(signal.candidate);
          else peer.candidates.push(signal.candidate);
        }
      }
      this.cursor = result.cursor;
      const open = [...this.peers.values()].filter(
        (p) => p.channel?.readyState === "open",
      ).length;
      this.status = open
        ? `Canal directo · ${open} participante${open === 1 ? "" : "s"}`
        : result.peers.length
          ? "Estableciendo conexión directa…"
          : "Esperando participantes";
      for (const message of this.messages)
        if (
          message.own &&
          message.pending?.size &&
          Date.now() - message.sentAt > 15000
        )
          message.status = "Sin confirmar";
      this.onChange();
    } catch (error) {
      if (generation !== this.generation) return;
      await this.disconnect();
      this.status = `Canal interrumpido: ${error.message}`;
      this.onChange();
      return;
    }
    if (generation === this.generation)
      this.timer = setTimeout(() => this.poll(generation), 1000);
  }
  createPeer(info, generation) {
    // No public STUN/TURN dependency for the loopback training environment.
    const pc = new RTCPeerConnection({ iceServers: [] });
    const peer = {
      ...info,
      pc,
      candidates: [],
      chunks: new Map(),
      received: new Set(),
      started: false,
    };
    this.peers.set(info.id, peer);
    pc.onicecandidate = (event) => {
      if (event.candidate && generation === this.generation)
        this.signal(info.id, { candidate: event.candidate }).catch(() => {});
    };
    pc.ondatachannel = (event) => this.attachChannel(peer, event.channel);
    pc.onconnectionstatechange = () => {
      if (["failed", "closed"].includes(pc.connectionState)) {
        if (this.peers.get(info.id) === peer) this.peers.delete(info.id);
      }
      this.onChange();
    };
    return peer;
  }
  signal(targetId, payload) {
    if (!this.session) return Promise.reject(new Error("Canal cerrado."));
    return this.api.request("/v1/signals", {
      body: { peerId: this.session.peerId, targetId, ...payload },
      token: this.session.token,
    });
  }
  attachChannel(peer, channel) {
    peer.channel = channel;
    channel.onopen = () => this.onChange();
    channel.onclose = () => this.onChange();
    channel.onmessage = (event) => {
      try {
        if (typeof event.data !== "string" || event.data.length > 18000) return;
        const packet = JSON.parse(event.data);
        if (typeof packet.id !== "string" || packet.id.length > 80) return;
        if (packet.type === "ack") {
          const message = this.messages.find(
            (m) => m.id === packet.id && m.own,
          );
          if (message) {
            message.pending.delete(peer.id);
            message.status = message.pending.size
              ? "Confirmación parcial"
              : "Recibido";
          }
        } else if (
          packet.type === "text" &&
          typeof packet.text === "string" &&
          packet.text.length <= 4000
        ) {
          if (!peer.received.has(packet.id))
            this.addReceived(peer, packet, { text: packet.text });
          channel.send(JSON.stringify({ type: "ack", id: packet.id }));
        } else if (packet.type === "voice") {
          if (
            ![
              "audio/webm",
              "audio/webm;codecs=opus",
              "audio/ogg;codecs=opus",
              "audio/mp4",
            ].includes(packet.mime) ||
            !Number.isInteger(packet.index) ||
            !Number.isInteger(packet.total) ||
            packet.total < 1 ||
            packet.total > 120 ||
            packet.index < 0 ||
            packet.index >= packet.total ||
            typeof packet.data !== "string" ||
            packet.data.length > 12000
          )
            return;
          for (const [id, transfer] of peer.chunks)
            if (Date.now() - transfer.at > 30000) peer.chunks.delete(id);
          if (!peer.chunks.has(packet.id) && peer.chunks.size >= 4) return;
          const transfer = peer.chunks.get(packet.id) || {
            total: packet.total,
            mime: packet.mime,
            parts: new Map(),
            at: Date.now(),
          };
          if (transfer.total !== packet.total || transfer.mime !== packet.mime)
            return;
          transfer.parts.set(packet.index, packet.data);
          peer.chunks.set(packet.id, transfer);
          if (transfer.parts.size === transfer.total) {
            const base64 = Array.from({ length: transfer.total }, (_, i) =>
              transfer.parts.get(i),
            ).join("");
            const bytes = Uint8Array.from(atob(base64), (char) =>
              char.charCodeAt(0),
            );
            const url = URL.createObjectURL(
              new Blob([bytes], { type: transfer.mime }),
            );
            this.urls.push(url);
            if (!peer.received.has(packet.id))
              this.addReceived(peer, packet, { audio: url });
            peer.chunks.delete(packet.id);
            channel.send(JSON.stringify({ type: "ack", id: packet.id }));
          }
        }
        this.onChange();
      } catch {
        /* Malformed peer content is ignored, never interpreted as HTML. */
      }
    };
  }
  addReceived(peer, packet, content) {
    peer.received.add(packet.id);
    if (peer.received.size > 500)
      peer.received.delete(peer.received.values().next().value);
    this.messages.push({
      id: packet.id,
      sender: peer.label,
      own: false,
      sentAt: Date.now(),
      status: "Recibido",
      ...content,
    });
    this.trimMessages();
  }
  trimMessages() {
    while (this.messages.length > 200) {
      const message = this.messages.shift();
      if (message.audio) URL.revokeObjectURL(message.audio);
    }
  }
  async send(text, voice) {
    const peers = [...this.peers.values()].filter(
      (peer) => peer.channel?.readyState === "open",
    );
    if (!peers.length)
      throw new Error("No hay otro participante conectado al canal.");
    if (!voice && (!text?.trim() || text.length > 4000))
      throw new Error("Escribe un mensaje de hasta 4000 caracteres.");
    const id = crypto.randomUUID();
    const message = {
      id,
      own: true,
      sender: "Tú",
      sentAt: Date.now(),
      text,
      pending: new Set(peers.map((p) => p.id)),
      status: "Enviando…",
    };
    let packets;
    if (voice) {
      if (voice.size > 1_000_000)
        throw new Error("La nota supera el límite de 1 MB.");
      const bytes = new Uint8Array(await voice.arrayBuffer());
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      const data = btoa(binary);
      const total = Math.ceil(data.length / 12000);
      packets = Array.from({ length: total }, (_, index) => ({
        type: "voice",
        id,
        index,
        total,
        mime: voice.type,
        data: data.slice(index * 12000, (index + 1) * 12000),
      }));
      message.audio = URL.createObjectURL(voice);
      this.urls.push(message.audio);
    } else packets = [{ type: "text", id, text: text.trim() }];
    this.messages.push(message);
    this.trimMessages();
    this.onChange();
    try {
      for (const peer of peers)
        for (const packet of packets) {
          const deadline = Date.now() + 10000;
          while (peer.channel.bufferedAmount > 65536) {
            if (Date.now() > deadline || peer.channel.readyState !== "open")
              throw new Error("Envío interrumpido.");
            await new Promise((resolve) => setTimeout(resolve, 30));
          }
          peer.channel.send(JSON.stringify(packet));
        }
      message.status = message.pending.size
        ? "Enviado · sin confirmar"
        : "Recibido";
    } catch (error) {
      message.status = "Envío incompleto";
      throw error;
    } finally {
      this.onChange();
    }
  }
  async startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder)
      throw new Error("La grabación no está disponible en este navegador.");
    if (![...this.peers.values()].some((p) => p.channel?.readyState === "open"))
      throw new Error("Conecta primero con otro participante.");
    const generation = this.generation;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (generation !== this.generation) {
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    const mimeType = [
      "audio/webm;codecs=opus",
      "audio/ogg;codecs=opus",
      "audio/mp4",
    ].find((mime) => MediaRecorder.isTypeSupported(mime));
    if (!mimeType) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error("Formato de audio no compatible.");
    }
    const recorder = new MediaRecorder(stream, { mimeType });
    const parts = [];
    recorder.ondataavailable = (event) => parts.push(event.data);
    recorder.onstop = async () => {
      clearTimeout(this.recordTimer);
      stream.getTracks().forEach((track) => track.stop());
      this.recording = null;
      if (generation === this.generation) {
        try {
          await this.send("", new Blob(parts, { type: mimeType }));
        } catch (error) {
          this.status = error.message;
        }
      }
      this.onChange();
    };
    recorder.start();
    this.recording = recorder;
    this.recordTimer = setTimeout(() => this.stopRecording(), 20000);
    this.onChange();
  }
  stopRecording() {
    if (this.recording?.state === "recording") this.recording.stop();
  }
}
