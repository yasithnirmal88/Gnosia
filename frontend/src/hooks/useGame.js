import { useState, useEffect, useRef } from 'react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import Peer from 'simple-peer';
import { LeviAudio } from '../audio/LeviAudio';

const SOCKET_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080/game-ws';

export const useGame = (initialRoomCode) => {
  const [roomCode, setRoomCode] = useState(initialRoomCode);
  const [room, setRoom] = useState(null);
  const [messages, setMessages] = useState([]);
  const [privateInfo, setPrivateInfo] = useState(null);
  const [scanResult, setScanResult] = useState(null);
  const [doctorResult, setDoctorResult] = useState(null);
  const [joinError, setJoinError] = useState(null);
  const [playerId] = useState(() => {
    const stored = localStorage.getItem('gnosia_player_id');
    if (stored) return stored;
    const newId = crypto.randomUUID();
    localStorage.setItem('gnosia_player_id', newId);
    return newId;
  });

  const stompClient = useRef(null);

  // WebRTC — use refs to avoid stale closure issues in callbacks
  const peers = useRef({});
  const [streams, setStreams] = useState({});
  const userStream = useRef(null);
  const roomCodeRef = useRef(roomCode);

  // Keep roomCodeRef in sync with state so peer signal callbacks have latest code
  useEffect(() => {
    roomCodeRef.current = roomCode;
  }, [roomCode]);

  // ─── WebSocket Connection ────────────────────────────────────────────────────

  const connect = () => {
    const client = new Client({
      webSocketFactory: () => new SockJS(SOCKET_URL),
      debug: () => {},
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
    });

    client.onConnect = () => {
      console.log('[Gnosia] Connected to STOMP broker');

      // ─── Centralized Player-Private Service ───
      // Subscribing once here handles room-creation, role-info, results, and signaling
      client.subscribe(`/topic/user/${playerId}/private`, (response) => {
        const info = JSON.parse(response.body);
        
        switch (info.type) {
          case 'ROOM_CREATED':
            setRoomCode(info.roomCode);
            roomCodeRef.current = info.roomCode;
            subscribeToState(info.roomCode, client); // Sub to public state immediately
            break;
          case 'PRIVATE_INFO':
            setPrivateInfo(info);
            break;
          case 'SCAN_RESULT':
            setScanResult(info);
            break;
          case 'DOCTOR_CHECK_RESULT':
            setDoctorResult(info);
            break;
          case 'JOIN_ERROR':
            setJoinError(info.message);
            // Don't setRoom if errored!
            break;
          case 'WARP_CHAT':
            setMessages(prev => [...prev, info.message]);
            break;
        }
      });

      // Signaling channel
      client.subscribe(`/topic/user/${playerId}/signal`, (msg) => {
        const { signal, fromId } = JSON.parse(msg.body);
        if (peers.current[fromId]) peers.current[fromId].signal(signal);
        else createPeer(fromId, false, signal);
      });

      // Initial Join (if code already exists in URL or state)
      if (initialRoomCode || roomCode) {
        subscribeToState(initialRoomCode || roomCode, client);
      }
    };

    client.onStompError = (frame) => {
      console.error('[Gonosia] STOMP error:', frame.headers['message'], frame.body);
    };

    stompClient.current = client;
    client.activate();
  };

  const subscribeToState = (code, clientArg, pin) => {
    const client = clientArg || stompClient.current;
    if (!client || !client.connected) {
      console.warn('[Gnosia] Cannot subscribe, STOMP not connected');
      return;
    }

    // Basic room state (players, phase, etc)
    client.subscribe(`/topic/room/${code}`, (response) => {
      setRoom(JSON.parse(response.body));
    });

    // Chat
    client.subscribe(`/topic/room/${code}/chat`, (response) => {
      setMessages(prev => [...prev, JSON.parse(response.body)]);
    });

    // Special Events (like Levi Voice Announcements)
    client.subscribe(`/topic/room/${code}/events`, (response) => {
      const event = JSON.parse(response.body);
      if (event.type === 'LEVI_ANNOUNCEMENT') {
        if (event.sequence) {
          // Play a sequence of audio lines with slight delays
          event.sequence.forEach((audioFile, index) => {
            setTimeout(() => {
              LeviAudio.playEffect(audioFile);
            }, index * 4500); // 4.5s is roughly the length of a Levi line
          });
        } else if (event.audio) {
          LeviAudio.playEffect(event.audio);
        }
      }
    });

    localStorage.setItem('gnosia_room_code', code);

    // Join with ID and optional PIN
    client.publish({
      destination: `/app/room/${code}/join`,
      body: JSON.stringify({ id: playerId, pin: pin }),
    });
  };

  // ─── Room Actions ────────────────────────────────────────────────────────────

  const createRoom = (roomCodeStr, participants, pin) => {
    if (stompClient.current?.connected) {
      stompClient.current.publish({
        destination: `/app/room/create`,
        body: JSON.stringify({ playerId, roomCode: roomCodeStr, participants, pin }),
      });
    }
  };

  // ─── WebRTC ──────────────────────────────────────────────────────────────────

  const connectToMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: false, audio: true });
      userStream.current = stream;
      setStreams(prev => ({ ...prev, local: stream }));
      return stream;
    } catch (err) {
      console.error('[Gnosia] Media access error:', err);
    }
  };

  const createPeer = (targetId, initiator, initialSignal = null) => {
    if (!userStream.current) return;

    const peer = new Peer({ initiator, trickle: false, stream: userStream.current });

    peer.on('signal', signal => {
      if (stompClient.current?.connected) {
        stompClient.current.publish({
          destination: `/app/room/${roomCodeRef.current}/signal`,
          body: JSON.stringify({ signal, targetId, fromId: playerId }),
        });
      }
    });

    peer.on('stream', stream => {
      setStreams(prev => ({ ...prev, [targetId]: stream }));
    });

    if (initialSignal) peer.signal(initialSignal);
    peers.current[targetId] = peer;
  };

  useEffect(() => {
    if (room?.players && playerId && userStream.current) {
      room.players.forEach(p => {
        // Only initiate if the other player exists and we don't have a peer yet
        // Deterministic initiation: the player with the "lexicographically smaller" ID initiates the call.
        // This prevents both sides from trying to be the initiator and causing a race condition.
        const shouldInitiate = playerId < p.id; 
        if (p.id !== playerId && !peers.current[p.id]) {
          console.log(`[Gnosia] WebRTC: ${shouldInitiate ? 'Initiating' : 'Awaiting'} connection with ${p.name} (${p.id})`);
          createPeer(p.id, shouldInitiate);
        }
      });
    }
  }, [room?.players?.length, streams.local, playerId]);

  // Handle phase-based music transitions
  useEffect(() => {
    if (room?.gameState?.phase) {
      const phase = room.gameState.phase;
      // Map game phases to audio tracks
      if (['LOBBY', 'DISCUSSION', 'VOTING', 'WARP'].includes(phase)) {
        LeviAudio.play(phase);
      } else if (phase === 'CRYOSLEEP' || phase === 'RESULT') {
        LeviAudio.play('COLD_SLEEP');
      } else if (phase === 'END') {
        // Handle victory music based on winner
        const winner = room.gameState.winner; // This would be populated in Phase.END
        LeviAudio.play(winner === 'GNOSIA' ? 'VICTORY_GNOSIA' : 'VICTORY_HUMAN');
      }
    }
  }, [room?.gameState?.phase]);

  // ─── Game Actions (all use @stomp/stompjs publish API) ──────────────────────

  const publish = (path, body) => {
    if (stompClient.current?.connected) {
      stompClient.current.publish({
        destination: `/app/room/${roomCodeRef.current}/${path}`,
        body: JSON.stringify(body),
      });
    }
  };

  const sendMessage = (content) => {
    const myPlayer = room?.players?.find(p => p.id === playerId);
    publish('chat', { senderId: playerId, senderName: myPlayer?.name ?? 'Crew', content });
  };

  const vote       = (targetId) => publish('vote',        { voterId: playerId, targetId });
  const scan       = (targetId) => publish('scan',        { scannerId: playerId, targetId });
  const protect    = (targetId) => publish('protect',     { gaId: playerId, targetId });
  const doctorCheck = (targetId) => publish('doctorCheck', { doctorId: playerId, targetId });
  const kill       = (targetId) => publish('kill',        { voterId: playerId, targetId });
  const startGame  = ()         => publish('start',       {});

  // ─── Exports ─────────────────────────────────────────────────────────────────

  return {
    room,
    messages,
    privateInfo,
    scanResult,
    doctorResult,
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
    createRoom,
    playerId,
    joinError,
    setJoinError,
    subscribeToState,
  };
};
