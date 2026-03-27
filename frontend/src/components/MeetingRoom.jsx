import { useState, useEffect, useRef } from "react";
import { Mic, MicOff, Volume2, VolumeX, MessageSquare, Shield, Info, Heart, Zap, Target } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const AudioNode = ({ stream, isLocal, volume, muted }) => {
    const audioRef = useRef();

    useEffect(() => {
        if (audioRef.current && stream) {
            audioRef.current.srcObject = stream;
        }
    }, [stream]);

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = volume;
            audioRef.current.muted = muted || isLocal;
            if (!muted && !isLocal && audioRef.current.srcObject) {
              audioRef.current.play().catch(e => console.warn("[Gnosia] Audio play error:", e));
            }
        }
    }, [volume, muted, isLocal]);

    if (isLocal) return null;
    return <audio ref={audioRef} autoPlay playsInline />;
};

const NAME_MAP = {
    "Setsu": "セツ", "Jina": "ジナ", "SQ": "SQ", "Raqio": "ラキオ", "Stella": "ステラ",
    "Shigemichi": "シゲミチ", "Chipie": "チピエ", "Comet": "コメット", "Jonas": "ジョナス",
    "Kukurushka": "クルーシュカ", "Otome": "オトメ", "Sha-ming": "シャーミン", "Remnan": "レムナン",
    "Yuriko": "ユリコ", "Yuri": "ユーリ"
};

export default function MeetingRoom({ 
  players=[], streams={}, currentPhase, role, privateInfo, playerId, 
  localMuted, setLocalMuted, globalVolume, setGlobalVolume, onVote, onKill, 
  playerName, room, messages=[], dmMessages={}, sendMessage, onDm 
}) {
  const [voteLocked, setVoteLocked] = useState(false);
  const [selectedForVote, setSelectedForVote] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);
  const [dmTarget, setDmTarget] = useState(null);
  const [dmOpen, setDmOpen] = useState(false);
  const [dmHistory, setDmHistory] = useState({});
  const [dmInput, setDmInput] = useState("");
  const [publicChatInput, setPublicChatInput] = useState("");
  const [warpCouncilTarget, setWarpCouncilTarget] = useState(null); // Gnosia's chosen victim
  const dmRef = useRef(null);

  const isWarpPhase = currentPhase === 'WARP';
  const isGnosia = role === 'GNOSIA';
  const me = players.find(p => p.name === playerName);
  const amIDead = me?.alive === false; // true if cryoslept OR killed
  const isSpectator = amIDead; // alias for audio logic

  // Dead players (spectators): mic is muted (can't speak), but they CAN hear.
  // WARP phase: only alive Gnosia can hear Gnosia channel.
  const isMicMuted = amIDead || (isWarpPhase && !isGnosia); // mic output blocked
  const isSystemMuted = isMicMuted;
  const finalMuted = localMuted || isSystemMuted;

  useEffect(() => {
    if (streams?.local) {
      streams.local.getAudioTracks().forEach(track => {
        track.enabled = !finalMuted;
      });
    }
  }, [finalMuted, streams?.local]);

  const canHear = (p) => {
    if (p.id === playerId) return false;
    if (isWarpPhase) {
      if (amIDead) return false;
      return isGnosia && (p.role === 'GNOSIA' || privateInfo?.partners?.includes(p.id));
    }
    return p.alive !== false;
  };

  useEffect(() => {
    if (dmRef.current) dmRef.current.scrollTop = dmRef.current.scrollHeight;
  }, [dmHistory, dmTarget]);

  // Critical: Reset the vote locking mechanism when a new voting phase starts
  useEffect(() => {
    if (currentPhase === 'VOTING') {
      setVoteLocked(false);
      setSelectedForVote(null);
    }
  }, [currentPhase]);

  const votes = room?.gameState?.currentVotes || {};
  const votingResults = room?.gameState?.votingResults || {};
  const hasGnosia = currentPhase !== 'GAME_OVER' || room?.gameState?.winner !== 'HUMAN';

  const handleVoteConfirm = () => {
    if (!confirmModal) return;
    setVoteLocked(true);
    setSelectedForVote(confirmModal.id);
    onVote && onVote(confirmModal.id);
    setConfirmModal(null);
  };

  const sendDm = () => {
    if (!dmInput.trim() || !dmTarget || !onDm) return;
    onDm(dmTarget.id, dmInput.trim());
    setDmInput("");
  };

  const msgs = dmTarget ? (dmMessages[dmTarget.id] || []) : [];
  const unreadCount = Object.values(dmMessages).flat().filter(m => m.senderId !== playerId).length;

  return (
    <div className="game-flow-container">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&family=Noto+Sans+JP:wght@700;900&display=swap');
        
        .game-flow-container {
            position: absolute;
            inset: 0;
            background: transparent;
            display: flex;
            flex-direction: column;
            font-family: 'Share Tech Mono', monospace;
            z-index: 50;
        }

        .scanline {
            position: fixed;
            inset: 0;
            background: linear-gradient(to bottom, transparent 0%, rgba(41, 182, 246, 0.05) 50%, transparent 100%);
            background-size: 100% 4px;
            pointer-events: none;
            z-index: 2000;
            opacity: 0.3;
        }

        .main-grid-area {
            flex: 1;
            padding: 20px;
            display: flex;
            flex-wrap: wrap;
            justify-content: flex-start;
            align-content: flex-start;
            gap: 1.5%;
            width: 100%;
            overflow-y: auto;
            overflow-x: hidden;
        }

        .crew-card {
            background: #030d1e;
            border: 1px solid rgba(41,182,246,0.3);
            position: relative;
            display: flex;
            flex-direction: column;
            flex: 1 1 0px;
            min-width: 80px;
            max-width: calc(20% - 1.2%); /* Max 5 cards per row */
            aspect-ratio: 15 / 24;
            height: auto;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            overflow: hidden;
            box-shadow: 0 0 20px rgba(0,0,0,0.6), inset 0 0 20px rgba(0,0,0,0.5);
        }

        .bg-portrait {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
            object-position: top center;
            opacity: 0.95;
            filter: saturate(1.1) contrast(1.05);
        }

        .bg-overlay {
            position: absolute;
            inset: 0;
            background: linear-gradient(to bottom,
                rgba(0,10,28,0.15) 0%,
                rgba(0,10,28,0.0) 40%,
                rgba(0,10,28,0.7) 70%,
                rgba(0,10,28,0.95) 100%);
        }

        .gnosia-detector-bar {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            height: 4px;
            z-index: 10;
        }

        .gnosia-detector-bar.active { background: #ff0040; box-shadow: 0 0 10px #ff0040; }
        .gnosia-detector-bar.clear { background: #00d26a; box-shadow: 0 0 10px #00d26a; }

        .vote-cast-tag {
            position: absolute;
            bottom: 40px;
            right: 10px;
            background: rgba(0,0,0,0.85);
            border: 1px solid #ff4444;
            color: #ff4444;
            padding: 2px 6px;
            font-size: 8px;
            z-index: 20;
            border-radius: 2px;
            font-weight: bold;
        }

        .vote-counter {
            position: absolute;
            left: 10px;
            top: 20px;
            background: rgba(0,0,0,0.8);
            border: 1px solid #29b6f6;
            color: #29b6f6;
            padding: 2px 8px;
            font-size: 14px;
            font-family: 'Orbitron', sans-serif;
            font-weight: 900;
            z-index: 10;
        }

        .kill-strike {
            position: absolute;
            inset: 0;
            background: linear-gradient(45deg, transparent 45%, #ff0000 48%, #ff0000 52%, transparent 55%);
            background-size: 100% 100%;
            z-index: 15;
            opacity: 0.9;
            pointer-events: none;
            filter: drop-shadow(0 0 5px #ff0000);
        }

        .kill-red-overlay {
            position: absolute;
            inset: 0;
            background: rgba(255, 0, 0, 0.35);
            z-index: 14;
            pointer-events: none;
        }

        .crew-card:hover:not(.locked):not(.killed):not(.frozen) {
            border-color: #29b6f6;
            box-shadow: 0 0 20px rgba(41,182,246,0.4), 0 0 40px rgba(41,182,246,0.1);
            transform: translateY(-3px);
        }

        .crew-card.self {
            border: 4px double #29b6f6;
            box-shadow: 0 0 15px rgba(41,182,246,0.3);
            outline: 1px solid rgba(41,182,246,0.2);
            outline-offset: 4px;
        }

        .crew-card.speaking {
            border-color: #29b6f6;
            box-shadow: 0 0 20px rgba(41,182,246,0.5);
        }

        .crew-card.frozen {
            border-color: #00fff5;
            box-shadow: 0 0 20px rgba(0,255,245,0.4), inset 0 0 40px rgba(0,255,245,0.3);
            cursor: not-allowed;
        }

        .crew-card.frozen .bg-portrait {
            filter: sepia(1) hue-rotate(180deg) saturate(3) brightness(0.6) contrast(1.2);
            opacity: 0.8;
        }

        .crew-card.killed {
            border-color: #3a1a1a;
            filter: grayscale(0.8) brightness(0.6);
            cursor: not-allowed;
        }

        /* Card top ID strip */
        .card-id-strip {
            position: absolute;
            top: 8px;
            left: 8px;
            z-index: 10;
            font-family: 'Orbitron', sans-serif;
            font-size: 7px;
            color: rgba(41,182,246,0.7);
            letter-spacing: 1px;
            background: rgba(0,10,28,0.7);
            padding: 2px 5px;
            border: 1px solid rgba(41,182,246,0.2);
        }

        /* Role icon (top-right) */
        .role-icon {
            position: absolute;
            top: 6px;
            right: 6px;
            font-size: 16px;
            background: rgba(0,0,0,0.75);
            border-radius: 50%;
            width: 26px;
            height: 26px;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10;
            border: 1px solid rgba(41,182,246,0.3);
        }

        .role-icon.gnosia {
            border-color: #ff0040;
            box-shadow: 0 0 8px #ff0040;
        }

        /* Crew label (mid-card) */
        .card-crew-label {
            position: absolute;
            top: 50%;
            left: 8px;
            font-family: 'Share Tech Mono', monospace;
            font-size: 7px;
            color: rgba(41,182,246,0.45);
            letter-spacing: 2px;
            z-index: 10;
            text-transform: uppercase;
        }

        /* Bottom info block */
        .card-bottom {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            padding: 8px 10px 10px;
            z-index: 10;
            background: linear-gradient(to top, rgba(0,8,24,0.95) 0%, transparent 100%);
        }

        .jp-name-bottom {
            font-family: 'Noto Sans JP', sans-serif;
            font-size: 26px;
            font-weight: 900;
            color: #fff;
            line-height: 1;
            text-shadow: 0 0 14px rgba(41,182,246,0.5);
            margin-bottom: 2px;
        }

        .en-name-bottom {
            font-family: 'Orbitron', sans-serif;
            font-size: 8px;
            color: rgba(41,182,246,0.7);
            letter-spacing: 2px;
        }

        .you-tag {
            font-family: 'Orbitron', sans-serif;
            font-size: 8px;
            color: #29b6f6;
            font-weight: 900;
            letter-spacing: 1px;
            margin-top: 2px;
        }

        .live-tag {
            display: inline-block;
            font-family: 'Orbitron', sans-serif;
            font-size: 7px;
            color: #29b6f6;
            letter-spacing: 1px;
            background: rgba(41,182,246,0.15);
            border: 1px solid rgba(41,182,246,0.3);
            padding: 1px 4px;
            margin-left: 4px;
        }

        .bottom-control-bar {
            height: 70px;
            background: #000;
            border-top: 1px solid #1a3a5a;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 40px;
        }

        .status-pill {
            background: rgba(41, 182, 246, 0.1);
            border: 1px solid #29b6f6;
            padding: 8px 20px;
            border-radius: 20px;
            font-family: 'Orbitron', sans-serif;
            font-size: 10px;
            color: #29b6f6;
            letter-spacing: 2px;
        }

        .vote-lock-pill {
            background: #ff0040;
            color: #fff;
            padding: 8px 30px;
            font-family: 'Orbitron', sans-serif;
            font-weight: 900;
            font-size: 11px;
            letter-spacing: 3px;
        }

        .side-chat-trigger {
            position: fixed;
            right: 0;
            top: 50%;
            transform: translateY(-50%);
            background: #02040e;
            border: 1px solid #1a3a5a;
            border-right: none;
            padding: 20px 8px;
            color: #29b6f6;
            writing-mode: vertical-rl;
            font-family: 'Orbitron', sans-serif;
            font-size: 10px;
            letter-spacing: 5px;
            cursor: pointer;
            z-index: 3000;
        }

        .dm-drawer {
            position: fixed;
            top: 0;
            right: 0;
            bottom: 0;
            width: 320px;
            background: #010815;
            border-left: 2px solid #29b6f6;
            z-index: 4000;
            transform: translateX(100%);
            transition: transform 0.4s cubic-bezier(0.19, 1, 0.22, 1);
            display: flex;
            flex-direction: column;
        }

        .dm-drawer.open {
            transform: translateX(0);
        }

        .modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 5, 20, 0.9);
            z-index: 5000;
            display: flex;
            align-items: center;
            justify-content: center;
            backdrop-filter: blur(4px);
        }

        .confirm-modal {
            background: #010b1f;
            border: 1px solid #ff0040;
            padding: 30px;
            width: 400px;
            position: relative;
        }

        .confirm-btn {
            background: #ff0040;
            color: #fff;
            border: none;
            padding: 12px 30px;
            font-family: 'Orbitron', sans-serif;
            font-weight: 900;
            cursor: pointer;
            width: 100%;
            margin-top: 20px;
            letter-spacing: 2px;
        }

        .warp-timer {
            position: absolute;
            top: 20px;
            right: 40px;
            font-family: 'Orbitron', sans-serif;
            color: #ff00ff;
            font-size: 24px;
            text-shadow: 0 0 10px #ff00ff;
            z-index: 7000;
        }
 
        /* === WARP COUNCIL (Gnosia secret meeting) === */
        .warp-council-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.92);
            z-index: 6000;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-family: 'Share Tech Mono', monospace;
        }

        .warp-council-title {
            font-family: 'Orbitron', sans-serif;
            font-size: 22px;
            color: #ff0040;
            letter-spacing: 14px;
            text-shadow: 0 0 20px #ff0040;
            margin-bottom: 8px;
        }

        .warp-council-sub {
            font-size: 11px;
            color: #1a3a5a;
            letter-spacing: 4px;
            margin-bottom: 40px;
        }

        .warp-council-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
            gap: 16px;
            max-width: 900px;
            width: 90%;
        }

        .warp-target-card {
            background: #010b1f;
            border: 1px solid #1a3a5a;
            cursor: pointer;
            transition: all 0.2s;
            position: relative;
            overflow: hidden;
        }

        .warp-target-card:hover {
            border-color: #ff0040;
            box-shadow: 0 0 15px rgba(255,0,64,0.3);
        }

        .warp-target-card.warp-selected {
            border-color: #ff0040;
            box-shadow: 0 0 25px rgba(255,0,64,0.5);
        }

        .warp-target-card img {
            width: 100%;
            height: 120px;
            object-fit: cover;
            object-position: top center;
            filter: grayscale(0.4) brightness(0.8);
        }

        .warp-target-info {
            padding: 10px;
            border-top: 1px solid #1a3a5a;
        }

        .warp-target-jp {
            font-family: 'Noto Sans JP', sans-serif;
            font-size: 20px;
            font-weight: 900;
            color: #fff;
        }

        .warp-target-en {
            font-size: 8px;
            color: #666;
            letter-spacing: 2px;
        }

        .warp-target-crosshair {
            position: absolute;
            inset: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            background: rgba(255, 0, 64, 0.15);
            font-size: 40px;
            pointer-events: none;
        }

        .warp-confirm-btn {
            margin-top: 30px;
            background: transparent;
            border: 2px solid #ff0040;
            color: #ff0040;
            font-family: 'Orbitron', sans-serif;
            font-size: 14px;
            font-weight: 900;
            letter-spacing: 6px;
            padding: 14px 50px;
            cursor: pointer;
            transition: all 0.2s;
        }

        .warp-confirm-btn:hover:not(:disabled) {
            background: #ff0040;
            color: #000;
        }

        .warp-confirm-btn:disabled {
            opacity: 0.3;
            cursor: not-allowed;
        }

        .warp-vote-status {
            margin-top: 20px;
            font-size: 10px;
            color: #1a3a5a;
            letter-spacing: 3px;
        }

        /* === WARP overlay (non-Gonosia during WARP) === */
        .warp-space-overlay {
            position: fixed;
            inset: 0;
            background: #000;
            z-index: 6000;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-family: 'Orbitron', sans-serif;
            overflow: hidden;
        }

        .warp-tunnel {
            position: absolute;
            width: 250vw;
            height: 250vh;
            background: repeating-conic-gradient(
                from 0deg,
                rgba(0, 255, 255, 0.8) 0deg 5deg,
                rgba(0, 0, 255, 0.5) 5deg 10deg,
                rgba(138, 43, 226, 0.6) 10deg 15deg,
                transparent 15deg 20deg
            );
            animation: warpSpin 3s linear infinite;
            filter: blur(15px);
            mix-blend-mode: screen;
            opacity: 0.8;
        }

        .warp-core {
            position: absolute;
            width: 80px;
            height: 80px;
            background: #000;
            border-radius: 50%;
            box-shadow: 0 0 100px 50px #c4f0ff, inset 0 0 20px #fff;
            z-index: 2;
        }

        @keyframes warpSpin {
            100% { transform: rotate(360deg) scale(1.5); }
        }

        .warp-text-container {
            z-index: 10;
            text-align: center;
            text-shadow: 0 0 20px #000, 0 0 10px #c4f0ff;
        }

        .warp-title {
            font-size: 28px;
            color: #c4f0ff;
            letter-spacing: 20px;
            margin-bottom: 12px;
            font-weight: 900;
        }

        .warp-sub {
            font-size: 11px;
            color: rgba(196, 240, 255, 0.8);
            letter-spacing: 8px;
            line-height: 2.5;
        }

        .icy-overlay {
            position: absolute;
            inset: 0;
            background: linear-gradient(135deg, rgba(0,255,255,0.4), rgba(0,0,255,0.2));
            box-shadow: inset 0 0 30px rgba(0,255,255,0.8);
            backdrop-filter: blur(2px) contrast(1.2) brightness(1.1);
            z-index: 14;
            pointer-events: none;
            border: 3px solid rgba(0, 255, 255, 0.9);
        }



      `}</style>

      <div className="scanline" />
      
      {currentPhase === 'WARP' && room?.gameState?.remainingTimeSeconds > 0 && (
          <div className="warp-timer">
              {Math.floor(room.gameState.remainingTimeSeconds / 60)}:{(room.gameState.remainingTimeSeconds % 60).toString().padStart(2, '0')}
          </div>
      )}

      {/* HEADER SECTION */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px', padding: '10px 40px', marginTop: '10px' }}>
        <div style={{ color: 'rgba(41,182,246,0.5)', fontFamily: 'Orbitron', letterSpacing: '4px', fontSize: '10px' }}>
          C.O.G. CREW DATA SYSTEM
        </div>
        <div style={{ flex: 1, height: '1px', background: 'rgba(41,182,246,0.15)' }} />
      </div>

      {/* MAIN CARDS GRID */}
      <div className="main-grid-area">
        {players.map((p, idx) => {
          const hasStream = !!streams[p.id];
          const isSpeaking = hasStream && canHear(p);
          const votesForThisPlayer = Object.values(votes).filter(id => id === p.id).length;
          const isMe = p.id === playerId;
          const isPartner = privateInfo?.role === 'GNOSIA' && privateInfo?.partners?.includes(p.id);

          let roleIcon = null;
          let iconClass = 'role-icon';
          if (isMe) {
             if (privateInfo?.role === 'ENGINEER') roleIcon = '🔎';
             if (privateInfo?.role === 'DOCTOR') roleIcon = '🩺';
             if (privateInfo?.role === 'GUARDIAN_ANGEL') roleIcon = '👼';
             if (privateInfo?.role === 'GNOSIA') { roleIcon = '🐺'; iconClass += ' gnosia'; }
           } else if (isPartner) {
              roleIcon = '🐺';
              iconClass += ' gnosia';
           }

          const cardStateClass = p.cryoslept ? 'frozen' : (!p.alive ? 'killed' : '');
          const idNum = String(idx + 1).padStart(3, '0');

          return (
            <div
              key={p.id}
              className={`crew-card ${isMe ? 'self' : ''} ${isSpeaking ? 'speaking' : ''} ${cardStateClass}`}
              onClick={() => {
                if (amIDead) return;
                
                if (currentPhase === 'VOTING' && !isMe && p.alive && !voteLocked) {
                    setConfirmModal(p);
                    return;
                }
                
                if (!isMe && p.alive && currentPhase !== 'VOTING') {
                   setDmTarget(p);
                   setDmOpen(true);
                }
              }}
            >
              <img className="bg-portrait" src={p.avatar} alt={p.name} />
              <div className="bg-overlay" />

              {/* ID strip top-left */}
              <div className="card-id-strip">ID {idNum}</div>

              {/* Role icon — only for self */}
              {isMe && privateInfo?.role === 'ENGINEER' && (
                <div style={{
                  position: 'absolute', bottom: 42, left: 6, zIndex: 15,
                  background: 'rgba(0,15,35,0.95)',
                  border: '2px solid rgba(0,255,245,0.8)',
                  borderRadius: '50%',
                  width: 72, height: 72,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 0 20px rgba(0,255,245,0.6)',
                  overflow: 'hidden'
                }}>
                  <img src="/images/EngineerSymbol.png" alt="ENG" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <div style={{ position: 'absolute', bottom: 2, left: 0, right: 0, background: 'rgba(0,255,245,0.8)', color: '#000', fontSize: '6px', fontWeight: 900, textAlign: 'center', letterSpacing: '0.5px' }}>CREDENTIALS</div>
                </div>
              )}
              {isMe && privateInfo?.role === 'DOCTOR' && (
                <div style={{
                  position: 'absolute', bottom: 42, left: 6, zIndex: 15,
                  background: 'rgba(20, 0, 40, 0.95)',
                  border: '2px solid rgba(177, 156, 217, 0.8)',
                  borderRadius: '50%',
                  width: 72, height: 72,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 0 25px rgba(177, 156, 217, 0.7)',
                  overflow: 'hidden'
                }}>
                  <img src="/images/DoctorSymbol.png" alt="DOC" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <div style={{ position: 'absolute', bottom: 2, left: 0, right: 0, background: 'rgba(177,156,217,0.8)', color: '#000', fontSize: '6px', fontWeight: 900, textAlign: 'center', letterSpacing: '0.5px' }}>CREDENTIALS</div>
                </div>
              )}
              {isMe && privateInfo?.role === 'GUARDIAN_ANGEL' && (
                <div style={{
                  position: 'absolute', bottom: 42, left: 6, zIndex: 15,
                  background: 'rgba(0, 20, 12, 0.95)',
                  border: '2px solid rgba(74,222,128,0.8)',
                  borderRadius: '50%',
                  width: 72, height: 72,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 0 20px rgba(74,222,128,0.6)',
                  overflow: 'hidden'
                }}>
                  <img src="/images/GuardianAngelSymbol.png" alt="GA" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <div style={{ position: 'absolute', bottom: 2, left: 0, right: 0, background: 'rgba(74,222,128,0.8)', color: '#000', fontSize: '6px', fontWeight: 900, textAlign: 'center', letterSpacing: '0.5px' }}>CREDENTIALS</div>
                </div>
              )}
              {(isMe && privateInfo?.role === 'GNOSIA') && (
                <div style={{
                  position: 'absolute', bottom: 42, left: 6, zIndex: 15,
                  background: 'rgba(20, 0, 5, 0.95)',
                  border: '2px solid rgba(255, 0, 64, 0.8)',
                  borderRadius: '50%',
                  width: 72, height: 72,
                  display: 'flex', flexDirection: 'column',
                  alignItems: 'center', justifyContent: 'center',
                  boxShadow: '0 0 20px rgba(255, 0, 64, 0.6)',
                  overflow: 'hidden'
                }}>
                  <img src="/images/GnosiaSymbol.png" alt="G" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <div style={{ position: 'absolute', bottom: 2, left: 0, right: 0, background: 'rgba(255,0,64,0.8)', color: '#000', fontSize: '6px', fontWeight: 900, textAlign: 'center', letterSpacing: '0.5px' }}>CREDENTIALS</div>
                </div>
              )}

              {/* Crew role label mid-card */}
              <div className="card-crew-label">
                CREW — {isMe
                  ? (privateInfo?.role?.replace('_', ' ') || 'CREW')
                  : (p.cryoslept ? 'CRYOSLEPT' : (!p.alive ? 'DECEASED' : 'CREW'))}
              </div>

              {/* State overlays */}
              {p.cryoslept && <div className="icy-overlay" />}
              {(!p.alive && !p.cryoslept) && (
                <>
                  <div className="kill-red-overlay" />
                  <div className="kill-strike" />
                </>
              )}

              {/* Vote counter during CRYOSLEEP */}
              {room?.gameState?.phase === 'CRYOSLEEP' && votesForThisPlayer > 0 && (
                <div className="vote-counter">{votesForThisPlayer}</div>
              )}

              {/* Voted-for tag during CRYOSLEEP reveal */}
              {room?.gameState?.phase === 'CRYOSLEEP' && votingResults[p.id] && (
                <div className="vote-cast-tag">
                  VOTED: {players.find(t => t.id === votingResults[p.id])?.name || '???'}
                </div>
              )}

              {/* Gnosia detection bar (self only) */}
              {isMe && (
                <div className={`gnosia-detector-bar ${hasGnosia ? 'active' : 'clear'}`} />
              )}

              {/* Bottom name block */}
              <div className="card-bottom">
                <div className="jp-name-bottom">{NAME_MAP[p.name] || p.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div className="en-name-bottom">{p.name.toUpperCase()}</div>
                  {isMe && <span className="you-tag">[YOU]</span>}
                  {hasStream && <span style={{ color: '#00d26a', fontSize: '8px', fontWeight: 900, textShadow: '0 0 5px #00d26a' }}>● ONLINE</span>}
                  {isSpeaking && <span className="live-tag">LIVE</span>}
                </div>
              </div>

              {hasStream && (
                <AudioNode
                  stream={streams[p.id]}
                  isLocal={p.id === playerId}
                  volume={canHear(p) ? globalVolume : 0}
                  muted={p.id === playerId || !canHear(p)}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* FOOTER STATUS BAR */}
      <div className="bottom-control-bar">
        <div style={{display:'flex', alignItems:'center', gap:'24px'}}>
          {/* Cycle */}
          <div style={{display:'flex', alignItems:'center', gap:'6px'}}>
            <span style={{width:6, height:6, borderRadius:'50%', background:'#00d26a', display:'inline-block', boxShadow:'0 0 6px #00d26a'}} />
            <span style={{fontFamily:'Orbitron', fontSize:9, color:'rgba(255,255,255,0.4)', letterSpacing:2}}>CYCLE</span>
            <span style={{fontFamily:'Orbitron', fontSize:10, color:'#29b6f6', fontWeight:900, letterSpacing:1}}>{String(room?.meetingRound || 1).padStart(2,'0')}</span>
          </div>
          {/* Vessel */}
          <div style={{display:'flex', alignItems:'center', gap:'6px'}}>
            <span style={{fontFamily:'Orbitron', fontSize:9, color:'rgba(255,255,255,0.4)', letterSpacing:2}}>VESSEL</span>
            <span style={{fontFamily:'Orbitron', fontSize:10, color:'#29b6f6', fontWeight:900, letterSpacing:1}}>NOVA-{room?.roomCode?.substring(0,1) || '6'}</span>
          </div>
          {/* Gnosia confirmed */}
          <div style={{display:'flex', alignItems:'center', gap:'6px'}}>
            <span style={{fontFamily:'Orbitron', fontSize:9, color:'rgba(255,255,255,0.4)', letterSpacing:2}}>GNOSIA</span>
            <span style={{fontFamily:'Orbitron', fontSize:10, color:'#ff0040', fontWeight:900}}>? CONFIRMED</span>
          </div>
          {/* Alive count */}
          <div style={{display:'flex', alignItems:'center', gap:'6px'}}>
            <span style={{fontFamily:'Orbitron', fontSize:9, color:'rgba(255,255,255,0.4)', letterSpacing:2}}>ALIVE</span>
            <span style={{fontFamily:'Orbitron', fontSize:10, color:'#4ade80', fontWeight:900}}>
              {players.filter(p=>p.alive).length} / {players.length}
            </span>
          </div>
        </div>

        <div style={{display:'flex', alignItems:'center', gap:'16px'}}>
          {/* Mic / Volume buttons */}
          <button
            style={{background:'transparent', border:'1px solid #1a3a5a', color: finalMuted ? '#ff0040' : '#29b6f6', padding:'8px 10px', cursor:'pointer', borderRadius:4, display:'flex', alignItems:'center'}}
            onClick={() => { if (!isSystemMuted) setLocalMuted(!localMuted); }}
            disabled={isSystemMuted}
          >
            {finalMuted ? <MicOff size={16}/> : <Mic size={16}/>}
          </button>
          <button
            style={{background:'transparent', border:'1px solid #1a3a5a', color: globalVolume === 0 ? '#ff0040' : '#29b6f6', padding:'8px 10px', cursor:'pointer', borderRadius:4, display:'flex', alignItems:'center'}}
            onClick={() => setGlobalVolume(v => v === 0 ? 1 : 0)}
          >
            {globalVolume === 0 ? <VolumeX size={16}/> : <Volume2 size={16}/>}
          </button>
          {/* Phase badge */}
          <div style={{fontFamily:'Orbitron', fontSize:9, fontWeight:900, letterSpacing:3, color: currentPhase==='VOTING'?'#ff0040':'#29b6f6', border:`1px solid ${currentPhase==='VOTING'?'#ff0040':'rgba(41,182,246,0.4)'}`, padding:'6px 14px', background: currentPhase==='VOTING'?'rgba(255,0,64,0.1)':'rgba(41,182,246,0.05)'}}>
            ■ {currentPhase === 'DISCUSSION' ? 'MEETING IN PROGRESS' : currentPhase === 'VOTING' ? 'VOTE LOCKED' : currentPhase}
          </div>
        </div>
      </div>

      {/* SIDE DRAWER TAB — hidden for dead players */}
      {!amIDead && (
        <div className="side-chat-trigger" onClick={() => setDmOpen(!dmOpen)}>
          {unreadCount > 0 && <span style={{color: '#ff0040'}}>●</span>} COMMS
        </div>
      )}

      {/* DM DRAWER */}
      <div className={`dm-drawer ${dmOpen ? 'open' : ''}`}>
        <div style={{padding: '20px', borderBottom: '1px solid #29b6f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
          <div className="gog-label" style={{color: '#29b6f6'}}>PRIVATE COMM_LINK</div>
          <button onClick={() => setDmOpen(false)} style={{background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer'}}>X</button>
        </div>
        
        <div style={{flex: 1, display: 'flex', flexDirection: 'column', p: '10px'}}>
            <div style={{padding: '10px', display: 'flex', gap: '10px', overflowX: 'auto'}}>
                {players.filter(p => !p.self && p.alive).map(p => (
                    <div key={p.id} onClick={() => setDmTarget(p)} style={{cursor: 'pointer', opacity: dmTarget?.id === p.id ? 1 : 0.5}}>
                        <img src={p.avatar} style={{width: '40px', height: '40px', borderRadius: '50%', border: dmTarget?.id === p.id ? '2px solid #29b6f6' : 'none'}} alt={p.name} />
                    </div>
                ))}
            </div>

            {dmTarget ? (
                <>
                    <div ref={dmRef} style={{flex: 1, overflowY: 'auto', padding: '15px', color: '#fff', fontSize: '11px'}}>
                        {msgs.map((m, i) => (
                            <div key={i} style={{marginBottom: '10px', textAlign: m.senderId === playerId ? 'right' : 'left'}}>
                                <div style={{display: 'inline-block', padding: '8px 12px', background: m.senderId === playerId ? '#29b6f622' : '#ffffff11', border: `1px solid ${m.senderId === playerId ? '#29b6f633' : '#ffffff22'}`, borderRadius: '4px'}}>
                                    {m.content}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div style={{padding: '15px', borderTop: '1px solid #1a3a5a'}}>
                        <input 
                            value={dmInput} 
                            onChange={e => setDmInput(e.target.value)} 
                            onKeyDown={e => e.key === 'Enter' && !amIDead && sendDm()}
                            disabled={amIDead}
                            style={{width: '100%', background: '#000', border: `1px solid ${amIDead ? '#333' : '#29b6f6'}`, color: amIDead ? '#333' : '#fff', padding: '10px', fontFamily: 'Share Tech Mono', cursor: amIDead ? 'not-allowed' : 'text'}}
                            placeholder="Type message..."
                        />
                    </div>
                </>
            ) : (
                <div style={{flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#29b6f6', fontSize: '10px', textAlign: 'center', padding: '40px'}}>
                    SELECT A CREW MEMBER TO ESTABLISH PRIVATE CONNECTION
                </div>
            )}
        </div>
      </div>

      {/* Removed legacy confirm modal — Using Holographic Overlay instead */}

      {/* ===== WARP PHASE — GNOSIA COUNCIL (alive Gnosia only) ===== */}
      {isWarpPhase && isGnosia && !amIDead && (
        <div className="warp-council-overlay">
          <div className="warp-council-title">⚠ WARP COUNCIL</div>
          <div className="warp-council-sub">— ENCRYPTED TRANSMISSION — GNOSIA EYES ONLY —</div>

          <div className="warp-council-grid">
            {players.filter(p => p.alive && p.id !== playerId && !privateInfo?.partners?.includes(p.id)).map(p => (
              <div
                key={p.id}
                className={`warp-target-card ${warpCouncilTarget?.id === p.id ? 'warp-selected' : ''}`}
                onClick={() => setWarpCouncilTarget(p)}
              >
                <img src={p.avatar} alt={p.name} />
                {warpCouncilTarget?.id === p.id && (
                  <div className="warp-target-crosshair">🎯</div>
                )}
                <div className="warp-target-info">
                  <div className="warp-target-jp">{NAME_MAP[p.name] || p.name}</div>
                  <div className="warp-target-en">{p.name.toUpperCase()}</div>
                </div>
              </div>
            ))}
          </div>

          <button
            className="warp-confirm-btn"
            disabled={!warpCouncilTarget}
            onClick={() => {
              if (warpCouncilTarget) {
                onKill && onKill(warpCouncilTarget.id);
              }
            }}
          >
            {warpCouncilTarget ? `ELIMINATE ${warpCouncilTarget.name.toUpperCase()}` : 'SELECT TARGET'}
          </button>

          <div className="warp-vote-status">
            {warpCouncilTarget
              ? `YOUR VOTE CAST — AWAITING CONSENSUS FROM ALL GNOSIA MEMBERS`
              : `SELECT A HUMAN TO ELIMINATE — ALL GNOSIA MUST AGREE`}
          </div>
        </div>
      )}

      {/* ===== VOTING CONFIRM MODAL (Holographic Overlay) ===== */}
      <AnimatePresence>
        {confirmModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{
              position: 'fixed', inset: 0, zIndex: 9000, background: 'rgba(0,10,25,0.92)', backdropFilter: 'blur(8px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: "'Share Tech Mono', monospace"
          }}>
            <motion.div initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} style={{
                background: 'rgba(0,25,45,0.95)', border: '1px solid rgba(0,255,245,0.4)', padding: '30px', maxWidth: '450px', width: '100%',
                position: 'relative', boxShadow: '0 0 50px rgba(0,0,0,0.8), inset 0 0 20px rgba(0,255,245,0.1)'
            }}>
              <div style={{ fontFamily: 'Orbitron', fontSize: '14px', color: '#00fff5', letterSpacing: '4px', marginBottom: '25px', label: 'header' }}>COLD-SLEEP PROTOCOL</div>
              <div style={{ display: 'flex', gap: '20px', marginBottom: '30px' }}>
                <div style={{ width: '100px', height: '120px', border: '1px solid rgba(0,255,245,0.3)', overflow: 'hidden', position: 'relative' }}>
                  <img src={confirmModal.avatar} alt={confirmModal.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(rgba(0,255,245,0.1), transparent)', pointerEvents: 'none' }} />
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                   <div style={{ fontFamily: 'Noto Sans JP', fontSize: '26px', fontWeight: 900, color: '#fff' }}>{NAME_MAP[confirmModal.name] || confirmModal.name}</div>
                   <div style={{ fontFamily: 'Orbitron', fontSize: '10px', color: 'rgba(0,255,245,0.6)', letterSpacing: '3px' }}>{confirmModal.name.toUpperCase()}</div>
                </div>
              </div>
              <div style={{ fontSize: '12px', color: '#888', lineHeight: 1.6, marginBottom: '40px' }}>Are you certain you wish to send this crew member to cold-sleep? The ship's stability depends on identifying all Gnosia impurities.</div>
              <div style={{ display: 'flex', gap: '15px' }}>
                <button style={{ flex: 1, background: 'transparent', border: '1px solid #444', color: '#666', padding: '12px', cursor: 'pointer', fontFamily: 'Orbitron', fontSize: '10px' }} onClick={() => setConfirmModal(null)}>ABORT</button>
                <button style={{ flex: 1, background: '#00fff5', color: '#000', border: 'none', padding: '12px', cursor: 'pointer', fontFamily: 'Orbitron', fontSize: '10px', fontWeight: 900, boxShadow: '0 0 15px #00fff5' }} onClick={handleVoteConfirm}>EXECUTE</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== WARP PHASE — HYPERSPACE (alive non-Gnosia only — NOT dead players) ===== */}
      {isWarpPhase && !isGnosia && !amIDead && (
        <div className="warp-space-overlay">
          <div className="warp-tunnel" />
          <div className="warp-core" />
          <div className="warp-text-container">
            <div className="warp-title">WARP</div>
            <div className="warp-sub">
              HYPERSPACE JUMP INITIATED<br/>
              CREWMATE ELIMINATION PROTOCOL ACTIVE<br/>
              AWAITING DESTINATION VECTOR
            </div>
          </div>
        </div>
      )}

      {/* ===== DEAD PLAYER — SPECTATOR BANNER (slim, non-blocking) ===== */}
      {amIDead && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          background: 'rgba(255, 0, 64, 0.08)',
          borderBottom: '1px solid rgba(255, 0, 64, 0.4)',
          zIndex: 8000,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '20px',
          padding: '8px 20px',
          fontFamily: "'Orbitron', sans-serif",
          backdropFilter: 'blur(4px)',
        }}>
          <span style={{ fontSize: '16px' }}>💀</span>
          <span style={{
            fontSize: '9px', color: '#ff0040',
            letterSpacing: '5px', fontWeight: 900,
          }}>SPECTATOR MODE</span>
          <span style={{
            width: '1px', height: '16px',
            background: 'rgba(255,0,64,0.3)',
          }} />
          <span style={{
            fontSize: '8px', color: '#555',
            letterSpacing: '3px',
          }}>GHOST PROTOCOL ACTIVE — OBSERVE ONLY — INTERACTION DISABLED</span>
        </div>
      )}

      {/* PUBLIC MESSAGE LOG (Holographic Overlay) */}
      <div style={{
          position: 'fixed', bottom: '100px', left: '25px', zIndex: 100, width: '280px',
          maxHeight: '180px', pointerEvents: 'none', display: 'flex', flexDirection: 'column-reverse',
          gap: '8px', overflow: 'hidden'
      }}>
          <AnimatePresence>
            {messages.slice(-6).map((m, i) => (
                <motion.div 
                    key={i} 
                    initial={{ opacity: 0, x: -20 }} 
                    animate={{ opacity: 1, x: 0 }}
                    style={{
                        background: 'rgba(0, 15, 30, 0.65)', borderLeft: '3px solid #00fff5',
                        padding: '6px 12px', fontSize: '11px', color: 'rgba(255,255,255,0.8)',
                        fontFamily: "'Share Tech Mono', monospace", backdropFilter: 'blur(2px)'
                    }}
                >
                    <span style={{ color: '#00fff5', fontWeight: 900, marginRight: '8px' }}>
                        {m.senderName.toUpperCase()}:
                    </span>
                    {m.content}
                </motion.div>
            ))}
          </AnimatePresence>
      </div>

      {/* PUBLIC CHAT INPUT */}
      {!amIDead && (
        <div style={{
            position: 'fixed', bottom: '65px', left: '25px', zIndex: 100, width: '280px',
            display: 'flex', border: '1px solid rgba(0, 255, 245, 0.4)', background: 'rgba(0,10,25,0.85)'
        }}>
            <input
                type="text"
                value={publicChatInput}
                onChange={(e) => setPublicChatInput(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter' && publicChatInput.trim().length > 0) {
                        sendMessage && sendMessage(publicChatInput.trim());
                        setPublicChatInput("");
                    }
                }}
                disabled={amIDead}
                placeholder={amIDead ? "COMMS DISABLED" : "BROADCAST..."}
                style={{ flex: 1, background: 'transparent', border: 'none', color: '#00fff5', padding: '10px', fontFamily: "'Share Tech Mono', monospace", fontSize: '12px', outline: 'none' }}
            />
            <button 
                onClick={() => { 
                    if (publicChatInput.trim().length > 0) {
                       sendMessage && sendMessage(publicChatInput.trim());
                       setPublicChatInput(""); 
                    }
                }} 
                disabled={amIDead || publicChatInput.trim().length === 0}
                style={{ background: 'rgba(0,255,245,0.2)', color: '#00fff5', border: 'none', borderLeft: '1px solid rgba(0,255,245,0.4)', padding: '0 15px', fontFamily: 'Orbitron', fontWeight: 900, cursor: 'pointer' }}
            >SEND</button>
        </div>
      )}

    </div>
  );
}
