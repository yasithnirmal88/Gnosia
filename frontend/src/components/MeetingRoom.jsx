import { useState, useEffect, useRef } from "react";
import { Mic, MicOff, Volume2, VolumeX, MessageSquare, Shield, Info, Heart, Zap, Target } from 'lucide-react';

const AudioNode = ({ stream, isLocal, volume, muted }) => {
    const audioRef = useRef();

    useEffect(() => {
        if (audioRef.current && stream && !isLocal) {
            audioRef.current.srcObject = stream;
        }
    }, [stream, isLocal]);

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = volume;
            audioRef.current.muted = muted || isLocal;
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

export default function MeetingRoom({ players=[], streams={}, currentPhase, role, privateInfo, playerId, localMuted, setLocalMuted, globalVolume, setGlobalVolume, onVote, onKill, playerName, room }) {
  const [voteLocked, setVoteLocked] = useState(false);
  const [selectedForVote, setSelectedForVote] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);
  const [dmTarget, setDmTarget] = useState(null);
  const [dmOpen, setDmOpen] = useState(false);
  const [dmHistory, setDmHistory] = useState({});
  const [dmInput, setDmInput] = useState("");
  const [warpCouncilTarget, setWarpCouncilTarget] = useState(null); // Gnosia's chosen victim
  const dmRef = useRef(null);

  const isWarpPhase = currentPhase === 'WARP';
  const isGnosia = role === 'GNOSIA';
  const me = players.find(p => p.name === playerName);
  const amIDead = me?.alive === false; // true if cryoslept OR killed
  const isSpectator = amIDead; // alias for audio logic

  // WARP audio: only alive Gonosia can hear Gonosia. Dead players hear nothing.
  const isSystemMuted = amIDead || (isWarpPhase && !isGnosia);
  const finalMuted = localMuted || isSystemMuted;

  const canHear = (p) => {
    if (!p.alive) return false;
    if (isWarpPhase) {
      // During WARP, Gnosia can only hear fellow Gnosia
      return isGnosia && (p.role === 'GNOSIA' || p.self || (privateInfo?.partners?.includes(p.id)));
    }
    return true; // During DISCUSSION all alive players can hear each other
  };

  useEffect(() => {
    if (dmRef.current) dmRef.current.scrollTop = dmRef.current.scrollHeight;
  }, [dmHistory, dmTarget]);

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
    if (!dmInput.trim() || !dmTarget) return;
    setDmHistory(h => ({ ...h, [dmTarget.id]: [...(h[dmTarget.id]||[]), { from:"you", text:dmInput.trim() }] }));
    setDmInput("");
  };

  const msgs = dmTarget ? (dmHistory[dmTarget.id] || []) : [];
  const unreadCount = Object.values(dmHistory).flat().filter(m => m.from !== "you").length;

  return (
    <div className="game-flow-container">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&family=Noto+Sans+JP:wght@700;900&display=swap');
        
        .game-flow-container {
            position: absolute;
            inset: 0;
            background: rgba(0, 4, 10, 0.4);
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
            justify-content: center;
            align-items: center;
            gap: 12px;
            width: 100%;
            overflow-x: auto;
        }

        .crew-card {
            background: #010b1f;
            border: 2px solid #1a3a5a;
            position: relative;
            display: flex;
            width: 140px;
            height: 140px;
            border-radius: 12px;
            flex-shrink: 0;
            cursor: pointer;
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            overflow: hidden;
            box-shadow: inset 0 0 40px rgba(0,0,0,0.8);
        }

        .bg-portrait {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
            object-position: top center;
            opacity: 0.9;
            filter: saturate(1.1) contrast(1.1);
        }

        .bg-overlay {
            position: absolute;
            inset: 0;
            background: linear-gradient(to right, rgba(0,8,24,0.6) 0%, rgba(0,8,24,0.1) 40%, rgba(0,8,24,0.7) 100%);
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
            opacity: 0.8;
            pointer-events: none;
            filter: drop-shadow(0 0 5px #000);
        }

        .kill-strike-2 {
            position: absolute;
            inset: 0;
            background: linear-gradient(-45deg, transparent 45%, #ff0000 48%, #ff0000 52%, transparent 55%);
            z-index: 15;
            opacity: 0.8;
            pointer-events: none;
        }

        .crew-card:hover:not(.locked) {
            border-color: #29b6f6;
            box-shadow: 0 0 15px rgba(41, 182, 246, 0.3), inset 0 0 20px rgba(41, 182, 246, 0.3);
            transform: translateY(-2px);
        }

        .crew-card.self, .crew-card.speaking {
            border-color: #29b6f6;
        }

        .crew-card.locked {
            opacity: 0.38;
            filter: grayscale(0.5);
            cursor: default;
        }

        .crew-card.frozen {
            border-color: #00ffff;
            box-shadow: inset 0 0 30px rgba(0, 255, 255, 0.4);
            opacity: 0.6;
            filter: hue-rotate(180deg) blur(1px) brightness(0.9);
            cursor: not-allowed;
        }

        .crew-card.killed {
            border-color: #555;
            opacity: 0.4;
            filter: grayscale(1);
            cursor: not-allowed;
        }

        .role-icon {
            position: absolute;
            top: 5px;
            right: 5px;
            font-size: 20px;
            background: rgba(0,0,0,0.7);
            border-radius: 50%;
            width: 30px;
            height: 30px;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10;
        }
        
        .role-icon.gnosia {
            border: 1px solid #ff0040;
            box-shadow: 0 0 8px #ff0040;
        }

        .suspect-tag {
            position: absolute;
            left: 0;
            top: 0;
            bottom: 0;
            width: 20px;
            background: rgba(0,0,0,0.7);
            writing-mode: vertical-rl;
            text-orientation: mixed;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Orbitron', sans-serif;
            font-size: 8px;
            font-weight: 900;
            color: #ff0040;
            letter-spacing: 5px;
            border-right: 1px solid rgba(255, 0, 64, 0.4);
            z-index: 2;
        }

        .info-column {
            position: absolute;
            top: 0;
            right: 0;
            bottom: 0;
            padding: 10px 8px;
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            z-index: 2;
        }

        .gog-text {
            font-family: 'Orbitron', sans-serif;
            font-size: 6px;
            color: #1a3a5a;
            letter-spacing: 1px;
            text-align: right;
            line-height: 1.2;
            margin-bottom: 8px;
        }

        .jp-name-vert {
            font-family: 'Noto Sans JP', sans-serif;
            font-size: 28px;
            font-weight: 900;
            color: #29b6f6;
            writing-mode: vertical-rl;
            text-orientation: upright;
            letter-spacing: -2px;
            text-shadow: 0 0 10px rgba(41, 182, 246, 0.4);
            flex: 1;
            display: flex;
            align-items: center;
        }

        .bottom-info {
            display: flex;
            flex-direction: column;
            align-items: flex-end;
            gap: 4px;
        }

        .en-name-vert {
            font-family: 'Orbitron', sans-serif;
            font-size: 10px;
            color: rgba(255,255,255,0.7);
            letter-spacing: 2px;
        }

        .you-tag {
            font-family: 'Orbitron', sans-serif;
            font-size: 10px;
            color: #29b6f6;
            font-weight: 900;
        }

        .live-tag {
            font-family: 'Orbitron', sans-serif;
            font-size: 9px;
            color: #29b6f6;
            font-weight: 900;
            letter-spacing: 1px;
            background: rgba(41, 182, 246, 0.2);
            padding: 2px 4px;
        }

        .diamond-symbol {
            font-size: 12px;
            color: #1a3a5a;
            line-height: 1;
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

        /* === CRYO-SLEEP overlay (non-Gonosia during WARP) === */
        .cryo-sleep-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 5, 25, 0.97);
            z-index: 6000;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            font-family: 'Orbitron', sans-serif;
        }
 
        .icy-overlay {
            position: absolute;
            inset: 0;
            background: rgba(0, 255, 255, 0.2);
            backdrop-filter: blur(1px) saturate(0.5);
            z-index: 14;
            pointer-events: none;
            border: 2px solid #00ffff;
        }

        .cryo-rings {
            position: relative;
            width: 200px;
            height: 200px;
            margin-bottom: 40px;
        }

        .cryo-ring {
            position: absolute;
            border-radius: 50%;
            border: 2px solid #29b6f6;
            animation: cryoPulse 3s ease-in-out infinite;
        }

        .cryo-ring:nth-child(1) { inset: 0; animation-delay: 0s; opacity: 0.6; }
        .cryo-ring:nth-child(2) { inset: 20px; animation-delay: 0.6s; opacity: 0.4; }
        .cryo-ring:nth-child(3) { inset: 40px; animation-delay: 1.2s; opacity: 0.2; }

        @keyframes cryoPulse {
            0%, 100% { transform: scale(0.95); opacity: 0.8; }
            50% { transform: scale(1.05); opacity: 0.2; }
        }

        .cryo-center-icon {
            position: absolute;
            top: 50%; left: 50%;
            transform: translate(-50%, -50%);
            font-size: 60px;
        }

        .cryo-title {
            font-size: 18px;
            color: #29b6f6;
            letter-spacing: 12px;
            margin-bottom: 12px;
            text-shadow: 0 0 15px #29b6f6;
        }

        .cryo-sub {
            font-size: 10px;
            color: #1a3a5a;
            letter-spacing: 5px;
            text-align: center;
            max-width: 400px;
            line-height: 2;
        }

        .icy-overlay {
            position: absolute;
            inset: 0;
            background: rgba(0, 255, 255, 0.2);
            backdrop-filter: blur(1px) saturate(0.5);
            z-index: 14;
            pointer-events: none;
            border: 2px solid #00ffff;
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
        <div style={{ color: '#1a3a5a', fontFamily: 'Orbitron', letterSpacing: '4px', fontSize: '12px' }}>
          CREW MANIFEST — CLICK MEMBER TO OPEN PRIVATE CHANNEL
        </div>
        <div style={{ flex: 1, height: '1px', background: '#1a3a5a' }} />
      </div>

      {/* MAIN CARDS GRID */}
      <div className="main-grid-area">
        {players.map(p => {
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
          
          return (
            <div 
              key={p.id} 
              className={`crew-card ${isMe ? 'self' : ''} ${isSpeaking ? 'speaking' : ''} ${cardStateClass}`}
              onClick={() => {
                if (amIDead) return;
                if (!isMe && p.alive) {
                   setDmTarget(p);
                   setDmOpen(true);
                }
              }}
            >
              <img className="bg-portrait" src={p.avatar} alt={p.name} />
              <div className="bg-overlay" />

              {roleIcon && (
                  <div className={iconClass}>{roleIcon}</div>
              )}
              
              {p.cryoslept && <div className="icy-overlay" />}
              {(!p.alive && !p.cryoslept) && (
                  <>
                    <div className="kill-strike" />
                    <div className="kill-strike-2" />
                  </>
              )}
              
                {/* Voting Indicators */}
                {room?.gameState?.phase === 'CRYOSLEEP' && votesForThisPlayer > 0 && (
                    <div className="vote-counter">{votesForThisPlayer}</div>
                )}

                {/* Show who each person voted for during CRYOSLEEP reveal */}
                {room?.gameState?.phase === 'CRYOSLEEP' && votingResults[p.id] && (
                    <div className="vote-cast-tag">
                        VOTED: {players.find(target => target.id === votingResults[p.id])?.name || "???"}
                    </div>
                )}
                
                {/* Gnosia Detection Bar */}
                {isMe && (
                    <div className={`gnosia-detector-bar ${hasGnosia ? 'active' : 'clear'}`} />
                )}

              <div className="suspect-tag">SUSPECT</div>
              
              <div className="info-column">
                <div className="gog-text">G.O.G.<br/>CREW</div>
                <div className="jp-name-vert">{NAME_MAP[p.name] || p.name}</div>
                
                <div className="bottom-info">
                  <div className="en-name-vert">{p.name.toUpperCase()}</div>
                  {p.self && <div className="you-tag">[YOU]</div>}
                  {!p.self && <div className="diamond-symbol" style={{color: isSpeaking ? '#ff0040' : '#29b6f6'}}>♦</div>}
                  {isSpeaking && <div className="live-tag">LIVE</div>}
                </div>
              </div>
              {hasStream && (
                  <AudioNode 
                      stream={streams[p.id]} 
                      isLocal={p.self} 
                      volume={isSpeaking ? globalVolume : 0} 
                      muted={!isSpeaking}
                  />
              )}
            </div>
          );
        })}
      </div>

      {/* FOOTER */}
      <div className="bottom-control-bar">
        <div style={{display: 'flex', gap: '20px', alignItems: 'center'}}>
          <div className="status-pill">PLAYER: {playerName?.toUpperCase() || "SETSU"}</div>
          <div className="status-pill" style={{borderColor: '#ff0040', color: '#ff0040'}}>[ACCESS RESTRICTED]</div>
        </div>

        <div style={{display: 'flex', gap: '20px', alignItems: 'center'}}>
          <div style={{display: 'flex', gap: '10px'}}>
             <button 
                className="control-btn"
                style={{background:"transparent", border: "1px solid #1a3a5a", color: finalMuted ? "#ff0040" : "#29b6f6", padding: "10px", cursor: "pointer", borderRadius: '50%'}}
                onClick={() => { if (!isSystemMuted) setLocalMuted(!localMuted); }}
                disabled={isSystemMuted}
              >
                {finalMuted ? <MicOff size={20}/> : <Mic size={20}/>}
            </button>
            <button 
                className="control-btn"
                style={{background:"transparent", border: "1px solid #1a3a5a", color: globalVolume === 0 ? "#ff0040" : "#29b6f6", padding: "10px", cursor: "pointer", borderRadius: '50%'}}
                onClick={() => setGlobalVolume(v => v === 0 ? 1 : 0)}
            >
                {globalVolume === 0 ? <VolumeX size={20}/> : <Volume2 size={20}/>}
            </button>
          </div>

          {voteLocked && (
            <div className="status-pill" style={{borderColor: '#00d26a', color: '#00d26a'}}>
              VOTE SECURED
            </div>
          )}
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
                            <div key={i} style={{marginBottom: '10px', textAlign: m.from === 'you' ? 'right' : 'left'}}>
                                <div style={{display: 'inline-block', padding: '8px 12px', background: m.from === 'you' ? '#29b6f622' : '#ffffff11', border: `1px solid ${m.from === 'you' ? '#29b6f633' : '#ffffff22'}`, borderRadius: '4px'}}>
                                    {m.text}
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

      {/* CONFIRM MODAL */}
      {confirmModal && (
        <div className="modal-overlay">
          <div className="confirm-modal">
            <div className="gog-label" style={{color: '#ff0040', marginBottom: '20px'}}>STASIS VOTE AUTHENTICATION</div>
            <div style={{display: 'flex', gap: '20px', alignItems: 'center'}}>
                <img src={confirmModal.avatar} style={{width: '80px', height: '100px', border: '1px solid #ff0040'}} alt="target" />
                <div>
                    <div style={{color: '#fff', fontSize: '24px', fontWeight: 900}}>{NAME_MAP[confirmModal.name] || confirmModal.name}</div>
                    <div style={{color: '#ff0040', fontSize: '10px'}}>{confirmModal.name.toUpperCase()}</div>
                </div>
            </div>
            <div style={{marginTop: '25px', color: '#fff', fontSize: '12px', opacity: 0.8}}>
                Are you sure you want to select this vessel inhabitant for cold sleep? This action will sync with the central core.
            </div>
            <div style={{display: 'flex', gap: '15px'}}>
                <button className="confirm-btn" style={{background: 'transparent', border: '1px solid #1a3a5a'}} onClick={() => setConfirmModal(null)}>CANCEL</button>
                <button className="confirm-btn" onClick={handleVoteConfirm}>VOTE LOCK</button>
            </div>
          </div>
        </div>
      )}

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

          {/* Audio nodes — alive Gnosia can hear each other during WARP */}
          {players.filter(p => p.alive && (p.role === 'GNOSIA' || privateInfo?.partners?.includes(p.id)) && !p.self && streams[p.id]).map(p => (
            <AudioNode key={p.id} stream={streams[p.id]} isLocal={false} volume={globalVolume} muted={finalMuted} />
          ))}
        </div>
      )}

      {/* ===== WARP PHASE — CRYO-SLEEP (alive non-Gnosia) ===== */}
      {isWarpPhase && (!isGnosia || amIDead) && !amIDead && (
        <div className="cryo-sleep-overlay">
          <div className="cryo-rings">
            <div className="cryo-ring" />
            <div className="cryo-ring" />
            <div className="cryo-ring" />
            <div className="cryo-center-icon">❄</div>
          </div>
          <div className="cryo-title">CRYO-SLEEP</div>
          <div className="cryo-sub">
            NEURAL ACTIVITY SUSPENDED<br/>
            WARP SEQUENCE IN PROGRESS<br/>
            AWAITING VESSEL ARRIVAL
          </div>
        </div>
      )}

      {/* ===== DEAD PLAYER — ELIMINATED OVERLAY (ALL PHASES) ===== */}
      {amIDead && (
        <div style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0, 0, 0, 0.96)',
          zIndex: 7000,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          fontFamily: "'Orbitron', sans-serif",
        }}>
          <div style={{
            fontSize: '80px', marginBottom: '30px',
            filter: 'grayscale(1)',
          }}>💀</div>
          <div style={{
            fontSize: '28px', color: '#ff0040',
            letterSpacing: '16px', fontWeight: 900,
            textShadow: '0 0 20px #ff0040',
            marginBottom: '12px',
          }}>ELIMINATED</div>
          <div style={{
            fontSize: '10px', color: '#333',
            letterSpacing: '5px', textAlign: 'center',
            lineHeight: 2, maxWidth: '400px'
          }}>
            LIFE SIGNS: TERMINATED<br/>
            ACCESS DENIED — ALL SYSTEMS LOCKED<br/>
            YOU MAY OBSERVE BUT CANNOT INTERACT
          </div>
          <div style={{
            marginTop: '40px',
            width: '1px', height: '80px',
            background: 'linear-gradient(to bottom, #ff0040, transparent)',
          }} />
        </div>
      )}

    </div>
  );
}
