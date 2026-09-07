import Peer from 'simple-peer';

/**
 * Guardrails for the simple-peer full mesh so a room of N players cannot turn
 * into N*(N-1)/2 unbounded peer objects on every client:
 *
 *  - Peer objects are only created for ELIGIBLE partners (connected + alive;
 *    dead and cryoslept players are server-side alive=false, and disconnected
 *    players must rejoin to be reachable again).
 *  - MAX_PEERS caps how many simultaneous peers this client holds. Initiations
 *    stop past the ceiling and incoming offers are ignored past it.
 *  - Peer creation is PACED (MAX_NEW_PER_SWEEP) and the offer/answer role is
 *    deterministic (lexicographically smaller id), so a burst join does not
 *    produce a signaling storm of N^2 offers at once.
 *  - Failed negotiations (error / iceStateChange 'failed' / hangup) tear the
 *    peer down and reconnect with backoff up to MAX_RETRIES. Late or duplicate
 *    signals for an existing peer are forwarded into it instead of re-creating.
 *  - teardown() destroys every peer and is the only force that releases local
 *    mic after room exit, so Peer objects cannot leak across rooms.
 */

// Hard cap on simultaneous peer objects per client.
const MAX_PEERS = 7;

// Pacing: at most this many new peers are created per synchronize() pass.
const MAX_NEW_PER_SWEEP = 3;

// Reconnect attempts per partner before giving up (fresh attempt only if the
// partner becomes eligible again, e.g. reconnected after leaving the room).
const MAX_RETRIES = 2;

// Timeout for a peer whose negotiation neither connects nor errors out server-side.
const NEGOTIATION_TIMEOUT_MS = 30000;

// Backoff base for reconnect attempts.
const RETRY_BASE_DELAY_MS = 2000;

// stun:l.google.com is primary; cloudflare is a fallback that survives Google
// outages. TURN (set via VITE_TURN_URL/…) is appended when configured so hosts
// behind symmetric NATs can fall back to a relay instead of failing the call.
const STUN_SERVERS = [
  'stun:stun.l.google.com:19302',
  'stun:stun.cloudflare.com:3478',
];

const isEligible = (player, selfId) =>
  player.id !== selfId && player.isConnected && player.isAlive;

export class MeshPeerManager {
  constructor({ sendSignal, getLocalStream, onRemoteStream, onPeerRemoved }) {
    this.sendSignal = sendSignal; // ({ signal, targetId }) => void
    this.getLocalStream = getLocalStream;
    this.onRemoteStream = onRemoteStream; // (targetId, MediaStream) => void
    this.onPeerRemoved = onPeerRemoved; // (targetId) => void
    this.selfId = null;
    this.tornDown = false;
    this.peers = new Map(); // targetId -> { peer, stopping }
    this.attempts = new Map(); // targetId -> consecutive failures
    this.gaveUp = new Set(); // targetId -> partner currently unreachable
  }

  buildIceServers() {
    const servers = [];
    const primary = import.meta.env.VITE_STUN_URL || STUN_SERVERS[0];
    servers.push({ urls: primary });
    if (!primary.includes('cloudflare')) {
      servers.push({ urls: STUN_SERVERS[1] });
    }
    const turnUrl = import.meta.env.VITE_TURN_URL;
    if (turnUrl) {
      const turn = {
        urls: turnUrl,
        username: import.meta.env.VITE_TURN_USERNAME,
        credential: import.meta.env.VITE_TURN_CREDENTIAL,
      };
      servers.push(turn);
      if (turnUrl.includes(':80')) {
        servers.push({ ...turn, urls: turnUrl.replace(':80', ':80?transport=tcp') });
      }
      if (turnUrl.includes(':443')) {
        servers.push({ ...turn, urls: turnUrl.replace(':443', ':443?transport=tcp') });
      }
    }
    return servers;
  }

  /**
   * Reconcile the mesh against the current room roster: drop peers whose
   * partner is no longer eligible, then initiate (paced + bounded) toward the
   * eligible partners we are missing.
   */
  synchronize(players, selfId) {
    if (selfId) this.selfId = selfId;
    if (!this.selfId || this.tornDown) return;

    const eligible = new Set();
    players.forEach(p => {
      if (isEligible(p, this.selfId)) eligible.add(p.id);
    });

    // A partner that left the eligible roster means a fresh lifecycle — clear
    // any give-up state so a later rejoin can be re-established.
    this.gaveUp.forEach(id => {
      if (!eligible.has(id)) this.gaveUp.delete(id);
    });

    this.peers.forEach((entry, targetId) => {
      if (!eligible.has(targetId)) this.destroyPeer(targetId, entry, 'partner ineligible');
    });

    let created = 0;
    [...eligible]
      .sort((a, b) => (a < b ? -1 : 1))
      .forEach(targetId => {
        if (created >= MAX_NEW_PER_SWEEP) return;
        if (this.peers.size >= MAX_PEERS) return;
        if (this.peers.has(targetId) || this.gaveUp.has(targetId)) return;
        this.ensurePeer(targetId, this.selfId < targetId, null);
        created += 1;
      });
  }

  handleSignal(fromId, signal) {
    if (this.tornDown || !fromId || fromId === this.selfId) return;

    const existing = this.peers.get(fromId);
    if (existing) {
      // Late or duplicate signals are forwarded into the live peer — routing a
      // duplicate into a second Peer object would create a duplicated channel.
      try {
        existing.peer.signal(signal);
      } catch (err) {
        this.logFailure(fromId, 'signal forward', err);
      }
      return;
    }

    // The partner is actively renegotiating after our give-up — allow a fresh
    // attempt instead of blacklisting forever.
    if (this.gaveUp.has(fromId)) {
      this.gaveUp.delete(fromId);
      this.attempts.delete(fromId);
    }

    if (this.peers.size >= MAX_PEERS) {
      this.logFailure(fromId, 'incoming offer', 'peer cap reached — ignored');
      return;
    }
    this.ensurePeer(fromId, false, signal);
  }

  ensurePeer(targetId, initiator, initialSignal) {
    if (this.tornDown || this.peers.has(targetId)) return;
    const stream = this.getLocalStream();
    if (!stream) return;

    const peer = new Peer({
      initiator,
      trickle: false, // batched candidates = far fewer signaling frames
      timeout: NEGOTIATION_TIMEOUT_MS,
      stream,
      config: { iceServers: this.buildIceServers() },
    });
    const entry = { peer, stopping: false };
    this.peers.set(targetId, entry);

    peer.on('signal', signal => this.sendSignal({ signal, targetId }));

    peer.on('connect', () => {
      this.attempts.delete(targetId);
      this.gaveUp.delete(targetId);
    });

    peer.on('stream', stream => this.onRemoteStream?.(targetId, stream));

    peer.on('error', err => this.handlePeerFailure(targetId, entry, err));

    peer.on('close', () => {
      // Our own destroyPeer() sets stopping first, so this only fires on a real
      // hangup — treat it as a failure to re-establish.
      if (!entry.stopping) this.handlePeerFailure(targetId, entry, new Error('peer closed'));
    });

    peer.on('iceStateChange', state => {
      if (state === 'failed') this.handlePeerFailure(targetId, entry, new Error('ice failed'));
    });

    if (initialSignal) {
      try {
        peer.signal(initialSignal);
      } catch (err) {
        this.handlePeerFailure(targetId, entry, err);
      }
    }
  }

  handlePeerFailure(targetId, entry, reason) {
    this.logFailure(targetId, 'peer failure', reason);
    if (this.peers.get(targetId) !== entry) return;
    this.destroyPeer(targetId, entry, 'failure');
    this.scheduleReconnect(targetId);
  }

  scheduleReconnect(targetId) {
    if (this.tornDown || this.peers.has(targetId) || this.gaveUp.has(targetId)) return;

    const attempt = (this.attempts.get(targetId) || 0) + 1;
    this.attempts.set(targetId, attempt);

    if (attempt > MAX_RETRIES) {
      this.logFailure(targetId, 'gave up', `after ${attempt} attempts`);
      this.gaveUp.add(targetId);
      this.attempts.delete(targetId);
      return;
    }

    const delay = RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
    setTimeout(() => {
      if (this.tornDown || this.gaveUp.has(targetId) || this.peers.has(targetId)) return;
      if (this.peers.size >= MAX_PEERS) return;
      this.ensurePeer(targetId, this.selfId < targetId, null);
    }, delay);
  }

  destroyPeer(targetId, entry, reason) {
    if (entry.stopping) return;
    entry.stopping = true;
    if (this.peers.get(targetId) === entry) this.peers.delete(targetId);
    this.onPeerRemoved?.(targetId);
    try {
      entry.peer.destroy();
    } catch (err) {
      // simple-peer already stopped.
    }
  }

  peerCount() {
    return this.peers.size;
  }

  teardown() {
    this.tornDown = true;
    this.peers.forEach((entry, targetId) => this.destroyPeer(targetId, entry, 'teardown'));
    this.peers.clear();
    this.attempts.clear();
    this.gaveUp.clear();
    this.selfId = null;
  }

  logFailure(targetId, what, detail) {
    const message = detail instanceof Error ? detail.message : detail;
    console.warn(`[WebRTC] ${what} with ${targetId}:`, message);
  }
}