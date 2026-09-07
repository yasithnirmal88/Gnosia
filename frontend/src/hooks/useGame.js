import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { LeviAudio } from '../audio/LeviAudio';
import { MeshPeerManager } from '../webrtc/peerManager';
import { makeRouter } from '../ws/messageRouter';
import { pushBounded, MAX_PUBLIC_MESSAGES, MAX_GNOSIA_CHAT_MESSAGES, MAX_DM_MESSAGES_PER_PARTNER } from '../utils/collections';

const SOCKET_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080/game-ws';

export const useGame = (initialRoomCode) => {
  const [room, setRoomState] = useState(null);
  const [messages, setMessages] = useState([]);
  const [dmMessages, setDmMessages] = useState({}); // { partnerId: [msg, msg] }
  const [privateInfo, setPrivateInfo] = useState(null);
  const [scanResult, setScanResult] = useState(null);
  const [doctorResult, setDoctorResult] = useState(null);
  const [joinError, setJoinError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [gnosiaChatMessages, setGnosiaChatMessages] = useState([]);
  const [stompReady, setStompReady] = useState(false);
  const [streamReady, setStreamReady] = useState(false);
  // Countdown ticks in every room are pushed as lightweight TIMER_UPDATE
  // frames. They live in their own state slice so re-rendering on the countdown
  // never re-runs the whole game tree (the `room` object identity is untouched
  // until an actual state frame arrives).
  const [timer, setTimer] = useState({ phase: null, remainingTimeSeconds: 0 });
  const [streams, setStreams] = useState({});
  const [playerId] = useState(() => {
    const stored = localStorage.getItem('gnosia_player_id');
    if (stored) return stored;
    const newId = crypto.randomUUID();
    localStorage.setItem('gnosia_player_id', newId);
    return newId;
  });

  // Identity key: persistent secret that binds playerId to this client's session.
  const [identityKey] = useState(() => {
    const stored = localStorage.getItem('gnosia_identity_key');
    if (stored) return stored;
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const newKey = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('gnosia_identity_key', newKey);
    return newKey;
  });

  // ─── Refs kept in sync for use inside stable callbacks ──────────────────────

  const stompClient = useRef(null);
  const pinRef = useRef('');
  const roomCodeRef = useRef('');
  const roomRef = useRef(null);
  const initialRoomCodeRef = useRef(initialRoomCode);
  const userStream = useRef(null);
  const peerManagerRef = useRef(null);
  // Generations let a superseded connect() ignore callbacks from its zombie
  // client while deactivate() is still winding it down.
  const connectGenRef = useRef(0);
  // Timeouts that must not fire after unmount / after being superseded.
  const actionErrorTimerRef = useRef(null);
  const leviTimersRef = useRef(new Set());

  // Keep refs in sync so stable callbacks never read stale render closures.
  useEffect(() => { initialRoomCodeRef.current = initialRoomCode; }, [initialRoomCode]);

  /** setter wrapper: mirrors `room` into a ref for stable callbacks. */
  const setRoom = useCallback((next) => {
    roomRef.current = next;
    setRoomState(next);
  }, []);

  const clearTimers = useCallback(() => {
    leviTimersRef.current.forEach(id => clearTimeout(id));
    leviTimersRef.current.clear();
    if (actionErrorTimerRef.current) {
      clearTimeout(actionErrorTimerRef.current);
      actionErrorTimerRef.current = null;
    }
  }, []);

  const schedule = useCallback((fn, delay) => {
    const id = setTimeout(() => {
      leviTimersRef.current.delete(id);
      fn();
    }, delay);
    leviTimersRef.current.add(id);
    return id;
  }, []);

  const flashActionError = useCallback((err) => {
    setActionError(err);
    if (actionErrorTimerRef.current) clearTimeout(actionErrorTimerRef.current);
    actionErrorTimerRef.current = setTimeout(() => {
      setActionError(null);
      actionErrorTimerRef.current = null;
    }, 6000);
  }, []);

  // ─── Message layer (STOMP → parser → validation → router → React state) ─────

  const resetConversation = useCallback(() => {
    setMessages([]);
    setDmMessages({});
    setGnosiaChatMessages([]);
  }, []);

  const router = useMemo(() => makeRouter({
    onRoom: setRoom,
    onTimer: (t) => setTimer(t),
    onChat: (msg) => setMessages(prev => pushBounded(prev, msg, MAX_PUBLIC_MESSAGES)),
    onEvent: () => {}, // unused for now; kept so events frames are validated
    onRoomCreated: (code) => {
      setRoomCodeRefFor(code);
      // The room state subscription happens in subscribeToState below; trigger
      // it only if this wasn't already the active room.
      if (stompClient.current?.connected) subscribeToState(code);
    },
    onPrivateInfo: setPrivateInfo,
    onScanResult: setScanResult,
    onDoctorResult: setDoctorResult,
    onJoinError: (message) => {
      setJoinError(message);
      localStorage.removeItem('gnosia_room_code');
    },
    onActionRejected: ({ action, reason }) => flashActionError({ action, reason }),
    onGnosiaChat: (msg) => setGnosiaChatMessages(prev => pushBounded(prev, msg, MAX_GNOSIA_CHAT_MESSAGES)),
    onDm: ({ withId, message }) => setDmMessages(prev => ({
      ...prev,
      [withId]: pushBounded(prev[withId] || [], message, MAX_DM_MESSAGES_PER_PARTNER),
    })),
    onSignal: ({ fromId, signal }) => peerManagerRef.current?.handleSignal(fromId, signal),
  }),
  // React-triggered a11y: setRoomCodeRefFor + setRoom are stable; the rest are
  // stable setters passed by value. `subscribeToState` is stable (below).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  []);

  // Habitual setter for hook-internal roomCode state (used by onRoomCreated). We
  // keep the code authoritative in refs, so this only feeds existing renders.
  const [, setRoomCode] = useState('');
  const setRoomCodeRefFor = useCallback((code) => {
    roomCodeRef.current = code;
    localStorage.setItem('gnosia_room_code', code);
    setRoomCode(code);
  }, []);

  // ─── WebSocket Connection ────────────────────────────────────────────────────

  /** Subscribe this client to the room + timer + chat + events topics once. */
  const subscribeToState = useCallback((code, clientArg) => {
    const client = clientArg || stompClient.current;
    if (!client || !client.connected || !code) {
      console.warn('[Gnosia] Cannot subscribe, STOMP not connected');
      return;
    }
    // Dedupe: subscribe at most once per code per connection. The set is
    // cleared whenever the transport drops so a reconnect re-subscribes.
    if (!client.__gnosiaSubs) client.__gnosiaSubs = new Set();
    if (client.__gnosiaSubs.has(code)) return;
    client.__gnosiaSubs.add(code);

    const isNewRoom = code !== roomCodeRef.current;
    roomCodeRef.current = code;
    localStorage.setItem('gnosia_room_code', code);
    if (isNewRoom) {
      resetConversation();
      setScanResult(null);
      setDoctorResult(null);
      setActionError(null);
      setJoinError(null);
    }

    // Basic room state (players, phase, etc). Frames from a superseded (old)
    // transport are ignored so a reconnect can never be clobbered by stragglers.
    const routeIfCurrent = (topic) => (frame) => {
      if (stompClient.current !== client) return;
      router.route(topic, frame.body);
    };

    client.subscribe(`/topic/room/${code}`, routeIfCurrent('room'));

    // Real-time countdown, kept out of the `room` object so the app tree does
    // not re-render (except the timer consumers) on every second tick.
    client.subscribe(`/topic/room/${code}/timer`, routeIfCurrent('timer'));

    // Chat
    client.subscribe(`/topic/room/${code}/chat`, routeIfCurrent('chat'));

    // Special Events (e.g. Levi voice announcements)
    client.subscribe(`/topic/room/${code}/events`, routeIfCurrent('events'));

    // Join with ID and optional PIN
    client.publish({
      destination: `/app/room/${code}/join`,
      body: JSON.stringify({ id: playerId, channelKey: identityKey, pin: pinRef.current }),
    });
  }, [router, resetConversation, playerId, identityKey]);

  const subscribePrivate = useCallback((client) => {
    const routePrivate = (frame) => {
      if (stompClient.current !== client) return;
      router.route('private', frame.body);
    };
    client.subscribe(`/topic/private/${identityKey}`, routePrivate);
  }, [router, identityKey]);

  const disconnectCleanup = useCallback((client) => {
    // A transport drop kills every subscription (a fresh StompHandler is
    // created on reconnect), so the dedupe set must be cleared too.
    if (client?.__gnosiaSubs) client.__gnosiaSubs.clear();
    setStompReady(false);
  }, []);

  const connect = useCallback((pin) => {
    if (pin !== undefined) pinRef.current = pin;
    const gen = ++connectGenRef.current;
    // Deactivate any existing connection to avoid zombie STOMP clients.
    if (stompClient.current?.active) {
      stompClient.current.deactivate();
    }
    setStompReady(false);
    clearTimers();

    const client = new Client({
      webSocketFactory: () => new SockJS(SOCKET_URL),
      debug: () => {},
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
    });

    const isCurrent = () => gen === connectGenRef.current && stompClient.current === client;

    client.onConnect = () => {
      if (!isCurrent()) {
        return; // a newer connect() superseded this client mid-flight
      }
      setStompReady(true);
      subscribePrivate(client);
      // Auto-subscribe to the active room (latest code, not a stale closure).
      const code = roomCodeRef.current || initialRoomCodeRef.current;
      if (code) subscribeToState(code, client);
    };

    client.onStompError = (frame) => {
      console.error('[Gnosia] STOMP error:', frame.headers['message'], frame.body);
      if (isCurrent()) setStompReady(false);
    };

    client.onDisconnect = () => {
      if (!isCurrent()) return;
      disconnectCleanup(client);
    };

    client.onWebSocketClose = () => {
      if (!isCurrent()) return;
      disconnectCleanup(client);
    };

    stompClient.current = client;
    client.activate();
  }, [subscribePrivate, subscribeToState, disconnectCleanup, clearTimers]);

  // ─── WebRTC ──────────────────────────────────────────────────────────────────

  const connectToMedia = useCallback(async () => {
    try {
      // Stop any previous stream to avoid orphaned tracks
      if (userStream.current) {
        userStream.current.getTracks().forEach(t => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
      userStream.current = stream;
      setStreams(prev => ({ ...prev, local: stream }));
      const tracks = stream.getTracks();
      console.log(`[Gnosia] Mic ready — ${tracks.length} track(s):`); // no tags in prod builds
      setStreamReady(true); // ← signal peers can now be created safely
      return stream;
    } catch (err) {
      console.error('[Gnosia] Media access error:', err);
    }
  }, []);

  // MeshPeerManager owns eligibility, caps, deterministic initiator roles,
  // duplicate guarding, ICE/TURN fallback, and reconnect backoff. Created once
  // inside an effect so StrictMode's dev double-mount cannot double-own it.
  useEffect(() => {
    const manager = new MeshPeerManager({
      getLocalStream: () => userStream.current,
      sendSignal: ({ signal, targetId }) => {
        if (stompClient.current?.connected && roomCodeRef.current) {
          stompClient.current.publish({
            destination: `/app/room/${roomCodeRef.current}/signal`,
            body: JSON.stringify({ signal, targetId }),
          });
        }
      },
      onRemoteStream: (id, stream) => setStreams(prev => ({ ...prev, [id]: stream })),
      onPeerRemoved: (id) => setStreams(prev => {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      }),
    });
    peerManagerRef.current = manager;
    return () => {
      manager.teardown();
      if (peerManagerRef.current === manager) peerManagerRef.current = null;
    };
  }, []);

  // The peer mesh is reconciled whenever the roster changes, and re-paced on a
  // short interval so a burst join ramps up gradually.
  useEffect(() => {
    if (!streamReady || !stompReady || !room?.players || !playerId) return;
    peerManagerRef.current?.synchronize(room.players, playerId);
  }, [streamReady, stompReady, room?.players?.length, playerId]);

  useEffect(() => {
    if (!streamReady || !stompReady || !room?.players) return;
    const interval = setInterval(() => {
      peerManagerRef.current?.synchronize(roomRef.current?.players || [], playerId);
    }, 8000);
    return () => clearInterval(interval);
  }, [streamReady, stompReady, room, playerId]);

  // Unmount: release every Peer, stop the local mic, clear stray timers, and
  // disconnect the socket so no state updates land after teardown.
  useEffect(() => {
    return () => {
      clearTimers();
      peerManagerRef.current?.teardown();
      userStream.current?.getTracks().forEach(t => t.stop());
      // Bump the generation so any in-flight onConnect is ignored.
      connectGenRef.current += 1;
      stompClient.current?.deactivate();
    };
  }, [clearTimers]);

  // Keep the countdown state in sync whenever a full room frame carries a fresh
  // phase/countdown (this is event-driven, not per-second).
  useEffect(() => {
    if (room?.gameState) {
      setTimer({
        phase: room.gameState.phase,
        remainingTimeSeconds: room.gameState.remainingTimeSeconds ?? 0,
      });
    }
  }, [room?.gameState?.phase, room?.gameState?.remainingTimeSeconds]);

  // Handle phase-based audio transitions
  useEffect(() => {
    if (room?.gameState?.phase) {
      const phase = room.gameState.phase;
      if (['LOBBY', 'DISCUSSION', 'VOTING', 'WARP'].includes(phase)) {
        LeviAudio.play(phase);
      } else if (phase === 'CRYOSLEEP' || phase === 'RESULT') {
        LeviAudio.play('COLD_SLEEP');
      } else if (phase === 'GAME_OVER') {
        LeviAudio.play(room.gameState.winner === 'GNOSIA' ? 'VICTORY_GNOSIA' : 'VICTORY_HUMAN');
      }
    }
  }, [room?.gameState?.phase]);

  // ─── Game Actions (all use @stomp/stompjs publish API) ──────────────────────

  const publish = useCallback((path, body) => {
    if (stompClient.current?.connected && roomCodeRef.current) {
      stompClient.current.publish({
        destination: `/app/room/${roomCodeRef.current}/${path}`,
        body: JSON.stringify(body),
      });
    }
  }, []);

  const sendMessage = useCallback((content) => {
    const myPlayer = roomRef.current?.players?.find(p => p.id === playerId);
    publish('chat', { senderId: playerId, senderName: myPlayer?.name ?? 'Crew', content });
  }, [publish, playerId]);

  const vote       = useCallback((targetId) => publish('vote',        { voterId: playerId, targetId }), [publish, playerId]);
  const scan       = useCallback((targetId) => publish('scan',        { scannerId: playerId, targetId }), [publish, playerId]);
  const protect    = useCallback((targetId) => publish('protect',     { gaId: playerId, targetId }), [publish, playerId]);
  const doctorCheck = useCallback((targetId) => publish('doctorCheck', { doctorId: playerId, targetId }), [publish, playerId]);
  const kill       = useCallback((targetId) => publish('kill',        { voterId: playerId, targetId }), [publish, playerId]);
  const sendGnosiaChat = useCallback((content) => publish('gnosia-chat', { senderId: playerId, content }), [publish, playerId]);
  const sendDm = useCallback((targetId, content) => {
    if (stompClient.current?.connected && roomCodeRef.current) {
      stompClient.current.publish({
        destination: `/app/room/${roomCodeRef.current}/dm`,
        body: JSON.stringify({ senderId: playerId, targetId, content }),
      });
    }
  }, [playerId]);

  const startGame = useCallback(() => publish('start', {}), [publish]);

  const createRoom = useCallback((roomCodeStr, participants, pin) => {
    if (stompClient.current?.connected && roomCodeRef.current) {
      stompClient.current.publish({
        destination: `/app/room/create`,
        body: JSON.stringify({ playerId, channelKey: identityKey, roomCode: roomCodeStr, participants, pin }),
      });
    }
  }, [playerId, identityKey]);

  // ─── Exports ─────────────────────────────────────────────────────────────────

  return {
    room,
    messages,
    privateInfo,
    scanResult,
    doctorResult,
    timer,
    connect,
    connectToMedia,
    streamReady,
    streams,
    sendMessage,
    vote,
    scan,
    protect,
    doctorCheck,
    kill,
    startGame,
    createRoom,
    playerId,
    joinError,
    actionError,
    setActionError,
    setJoinError,
    subscribeToState,
    stompReady,
    dmMessages,
    sendDm,
    gnosiaChatMessages,
    sendGnosiaChat,
  };
};