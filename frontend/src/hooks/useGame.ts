import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Client } from '@stomp/stompjs';
import type { IFrame, IMessage, IStompSocket } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { LeviAudio } from '../audio/LeviAudio';
import { MeshPeerManager } from '../webrtc/peerManager';
import { makeRouter } from '../ws/messageRouter';
import {
  pushBounded,
  MAX_PUBLIC_MESSAGES,
  MAX_GNOSIA_CHAT_MESSAGES,
  MAX_DM_MESSAGES_PER_PARTNER,
} from '../utils/collections';
import type { PublicMessage, Room } from '../types/contracts';
import type {
  DoctorResultFrame,
  PrivateInfoFrame,
  ScanResultFrame,
} from '../types/schemas';
import type {
  ActionError,
  ChatSendPayload,
  DmSendPayload,
  DoctorCheckSendPayload,
  GnosiaChatSendPayload,
  KillSendPayload,
  ProtectSendPayload,
  RoomCreatePayload,
  ScanSendPayload,
  ServerTopic,
  SignalSendPayload,
  TimerTick,
  VoteSendPayload,
} from '../types/ws';
import { backendUrl } from '../config/endpoints';

const SOCKET_URL: string = backendUrl();

/**
 * @stomp/stompjs `Client` extended with the module-private subscription dedupe
 * set. Only an optional extra key, so this widening is safe and needs no `any`.
 */
type GnosiaClient = Client & { __gnosiaSubs?: Set<string> };

export const useGame = (initialRoomCode: string) => {
  const [room, setRoomState] = useState<Room | null>(null);
  const [messages, setMessages] = useState<PublicMessage[]>([]);
  const [dmMessages, setDmMessages] = useState<Record<string, PublicMessage[]>>({}); // { partnerId: [msg, msg] }
  const [privateInfo, setPrivateInfo] = useState<PrivateInfoFrame | null>(null);
  const [scanResult, setScanResult] = useState<ScanResultFrame | null>(null);
  const [doctorResult, setDoctorResult] = useState<DoctorResultFrame | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<ActionError | null>(null);
  const [gnosiaChatMessages, setGnosiaChatMessages] = useState<PublicMessage[]>([]);
  const [stompReady, setStompReady] = useState(false);
  const [streamReady, setStreamReady] = useState(false);
  // Countdown ticks in every room are pushed as lightweight TIMER_UPDATE
  // frames. They live in their own state slice so re-rendering on the countdown
  // never re-runs the whole game tree (the `room` object identity is untouched
  // until an actual state frame arrives).
  const [timer, setTimer] = useState<TimerTick>({ phase: null, remainingTimeSeconds: 0 });
  const [streams, setStreams] = useState<Record<string, MediaStream>>({});
  // setTimeout's return type differs across the DOM/Node type worlds that can
  // end up in this program (vitest pulls node typings in), so store whichever
  // ID type the active lib provides rather than hard-coding `number`.
  type TimeoutId = ReturnType<typeof setTimeout>;
  const [playerId] = useState<string>(() => {
    const stored = localStorage.getItem('gnosia_player_id');
    if (stored) return stored;
    const newId = crypto.randomUUID();
    localStorage.setItem('gnosia_player_id', newId);
    return newId;
  });

  // Identity key: persistent secret that binds playerId to this client's session.
  const [identityKey] = useState<string>(() => {
    const stored = localStorage.getItem('gnosia_identity_key');
    if (stored) return stored;
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    const newKey = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem('gnosia_identity_key', newKey);
    return newKey;
  });

  // ─── Refs kept in sync for use inside stable callbacks ──────────────────────

  const stompClient = useRef<GnosiaClient | null>(null);
  const pinRef = useRef<string>('');
  const roomCodeRef = useRef<string>('');
  const roomRef = useRef<Room | null>(null);
  const initialRoomCodeRef = useRef<string>(initialRoomCode);
  const userStream = useRef<MediaStream | null>(null);
  const peerManagerRef = useRef<MeshPeerManager | null>(null);
  // Generations let a superseded connect() ignore callbacks from its zombie
  // client while deactivate() is still winding it down.
  const connectGenRef = useRef<number>(0);
  // Timeouts that must not fire after unmount / after being superseded.
  const actionErrorTimerRef = useRef<TimeoutId | null>(null);
  const leviTimersRef = useRef<Set<TimeoutId>>(new Set());

  // Keep refs in sync so stable callbacks never read stale render closures.
  useEffect(() => { initialRoomCodeRef.current = initialRoomCode; }, [initialRoomCode]);

  /** setter wrapper: mirrors `room` into a ref for stable callbacks. */
  const setRoom = useCallback((next: Room | null) => {
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

  const flashActionError = useCallback((err: ActionError) => {
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
    onTimer: (t: TimerTick) => setTimer(t),
    onChat: (msg: PublicMessage) => setMessages(prev => pushBounded(prev, msg, MAX_PUBLIC_MESSAGES)),
    onEvent: () => {}, // unused for now; kept so events frames are validated
    onRoomCreated: (code: string) => {
      setRoomCodeRefFor(code);
      // The room state subscription happens in subscribeToState below; trigger
      // it only if this wasn't already the active room.
      if (stompClient.current?.connected) subscribeToState(code);
    },
    onPrivateInfo: setPrivateInfo,
    onScanResult: setScanResult,
    onDoctorResult: setDoctorResult,
    onJoinError: (message: string) => {
      setJoinError(message);
      localStorage.removeItem('gnosia_room_code');
    },
    onActionRejected: ({ action, reason }: ActionError) => flashActionError({ action, reason }),
    onGnosiaChat: (msg: PublicMessage) => setGnosiaChatMessages(prev => pushBounded(prev, msg, MAX_GNOSIA_CHAT_MESSAGES)),
    onDm: ({ withId, message }: { withId: string; message: PublicMessage }) => setDmMessages(prev => ({
      ...prev,
      [withId]: pushBounded(prev[withId] || [], message, MAX_DM_MESSAGES_PER_PARTNER),
    })),
    onSignal: ({ fromId, signal }: { fromId: string; signal: Record<string, unknown> }) =>
      peerManagerRef.current?.handleSignal(fromId, signal),
  }),
  // React-triggered a11y: setRoomCodeRefFor + setRoom are stable; the rest are
  // stable setters passed by value. `subscribeToState` is stable (below).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  []);

  // Habitual setter for hook-internal roomCode state (used by onRoomCreated). We
  // keep the code authoritative in refs, so this only feeds existing renders.
  const [, setRoomCode] = useState<string>('');
  const setRoomCodeRefFor = useCallback((code: string) => {
    roomCodeRef.current = code;
    localStorage.setItem('gnosia_room_code', code);
    setRoomCode(code);
  }, []);

  // ─── WebSocket Connection ────────────────────────────────────────────────────

  /** Subscribe this client to the room + timer + chat + events topics once. */
  const subscribeToState = useCallback((code: string, clientArg?: GnosiaClient) => {
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
    const routeIfCurrent = (topic: ServerTopic) => (frame: IMessage) => {
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

  const subscribePrivate = useCallback((client: GnosiaClient) => {
    const routePrivate = (frame: IMessage) => {
      if (stompClient.current !== client) return;
      router.route('private', frame.body);
    };
    client.subscribe(`/topic/private/${identityKey}`, routePrivate);
  }, [router, identityKey]);

  const disconnectCleanup = useCallback((client: GnosiaClient) => {
    // A transport drop kills every subscription (a fresh StompHandler is
    // created on reconnect), so the dedupe set must be cleared too.
    if (client.__gnosiaSubs) client.__gnosiaSubs.clear();
    setStompReady(false);
  }, []);

  const connect = useCallback((pin?: string) => {
    if (pin !== undefined) pinRef.current = pin;
    const gen = ++connectGenRef.current;
    // Deactivate any existing connection to avoid zombie STOMP clients.
    if (stompClient.current?.active) {
      stompClient.current.deactivate();
    }
    setStompReady(false);
    clearTimers();

    const client = new Client({
      // SockJS is structurally compatible at runtime; bridged through `unknown`
      // (not `any`) because its surface is not an IStompSocket by type.
      webSocketFactory: () => new SockJS(SOCKET_URL) as unknown as IStompSocket,
      debug: () => {},
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
    }) as GnosiaClient;

    const isCurrent = (): boolean => gen === connectGenRef.current && stompClient.current === client;

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

    client.onStompError = (frame: IFrame) => {
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

  const connectToMedia = useCallback(async (): Promise<MediaStream | undefined> => {
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
      return undefined;
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
            body: JSON.stringify({ signal, targetId } satisfies SignalSendPayload),
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

  const publish = useCallback((path: string, body: unknown) => {
    if (stompClient.current?.connected && roomCodeRef.current) {
      stompClient.current.publish({
        destination: `/app/room/${roomCodeRef.current}/${path}`,
        body: JSON.stringify(body),
      });
    }
  }, []);

  const sendMessage = useCallback((content: string) => {
    const myPlayer = roomRef.current?.players?.find(p => p.id === playerId);
    publish('chat', { senderId: playerId, senderName: myPlayer?.name ?? 'Crew', content } satisfies ChatSendPayload);
  }, [publish, playerId]);

  const vote       = useCallback((targetId: string) => publish('vote',        { voterId: playerId, targetId } satisfies VoteSendPayload), [publish, playerId]);
  const scan       = useCallback((targetId: string) => publish('scan',        { scannerId: playerId, targetId } satisfies ScanSendPayload), [publish, playerId]);
  const protect    = useCallback((targetId: string) => publish('protect',     { gaId: playerId, targetId } satisfies ProtectSendPayload), [publish, playerId]);
  const doctorCheck = useCallback((targetId: string) => publish('doctorCheck', { doctorId: playerId, targetId } satisfies DoctorCheckSendPayload), [publish, playerId]);
  const kill       = useCallback((targetId: string) => publish('kill',        { voterId: playerId, targetId } satisfies KillSendPayload), [publish, playerId]);
  const sendGnosiaChat = useCallback((content: string) => publish('gnosia-chat', { senderId: playerId, content } satisfies GnosiaChatSendPayload), [publish, playerId]);
  const sendDm = useCallback((targetId: string, content: string) => {
    if (stompClient.current?.connected && roomCodeRef.current) {
      stompClient.current.publish({
        destination: `/app/room/${roomCodeRef.current}/dm`,
        body: JSON.stringify({ senderId: playerId, targetId, content } satisfies DmSendPayload),
      });
    }
  }, [playerId]);

  const startGame = useCallback(() => publish('start', {}), [publish]);

  const setReady = useCallback((ready: boolean) => {
    if (stompClient.current?.connected && roomCodeRef.current) {
      stompClient.current.publish({
        destination: `/app/room/${roomCodeRef.current}/ready`,
        body: JSON.stringify({ ready }),
      });
    }
  }, []);

  const leaveRoom = useCallback(() => {
    const client = stompClient.current;
    if (client?.connected && roomCodeRef.current) {
      client.publish({
        destination: `/app/room/${roomCodeRef.current}/leave`,
        body: JSON.stringify({}),
      });
    }
    // Bump the generation and drop the socket so the leave-confirming room
    // broadcast (which no longer contains this player) cannot clobber the
    // reset below.
    connectGenRef.current += 1;
    client?.deactivate();
    localStorage.removeItem('gnosia_room_code');
    roomCodeRef.current = '';
    resetConversation();
    setRoom(null);
    setJoinError(null);
    setActionError(null);
    setScanResult(null);
    setDoctorResult(null);
    setPrivateInfo(null);
  }, [resetConversation, setRoom]);

  const createRoom = useCallback((roomCodeStr: string, participants: number, pin: string) => {
    if (stompClient.current?.connected) {
      stompClient.current.publish({
        destination: `/app/room/create`,
        body: JSON.stringify({ playerId, channelKey: identityKey, roomCode: roomCodeStr, participants, pin } satisfies RoomCreatePayload),
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
    streams,
    sendMessage,
    vote,
    scan,
    protect,
    doctorCheck,
    kill,
    startGame,
    setReady,
    leaveRoom,
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