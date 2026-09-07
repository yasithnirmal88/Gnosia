import { useState, useEffect, useRef } from "react";
import { Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { LeviAudio } from '../audio/LeviAudio';
import { NAME_MAP } from '../constants';
import './MeetingRoom.css';

const AudioNode = ({ stream, isLocal, volume, muted }) => {
    const audioRef = useRef();

    useEffect(() => {
        const el = audioRef.current;
        if (!el) return;
        if (stream) {
            el.srcObject = stream;
        }
        el.volume = volume;
        el.muted = muted || isLocal;
        if (!muted && !isLocal && el.srcObject) {
            el.play().catch(e => console.warn("[Gnosia] Audio play error:", e));
        }
    }, [stream, volume, muted, isLocal]);

    if (isLocal) return null;
    return <audio ref={audioRef} autoPlay playsInline />;
};

export default function MeetingRoom({ 
  players=[], streams={}, currentPhase, role, privateInfo, playerId, 
  localMuted, setLocalMuted, globalVolume, setGlobalVolume, onVote, onKill, 
  playerName, room, timer, messages=[], dmMessages={}, sendMessage, onDm,
  gnosiaChatMessages=[], sendGnosiaChat
}) {
  const [voteLocked, setVoteLocked] = useState(false);
  const [selectedForVote, setSelectedForVote] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null);
  const [dmTarget, setDmTarget] = useState(null);
  const [dmOpen, setDmOpen] = useState(false);
  const [dmInput, setDmInput] = useState("");
  const [gnosiaChatInput, setGnosiaChatInput] = useState("");
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
      if (amIDead) return p.alive !== false;
      return isGnosia && (p.role === 'GNOSIA' || privateInfo?.partners?.includes(p.id));
    }
    return p.alive !== false;
  };

  useEffect(() => {
    if (dmRef.current) dmRef.current.scrollTop = dmRef.current.scrollHeight;
  }, [dmMessages, dmTarget]);

  // Resume audio on any user gesture (browser autoplay policy workaround)
  useEffect(() => {
    const handler = () => {
      document.querySelectorAll('audio[srcObject]').forEach(el => {
        if (el.paused) el.play().catch(() => {});
      });
      LeviAudio.resumeAll();
    };
    document.addEventListener('click', handler, { once: true });
    document.addEventListener('touchstart', handler, { once: true });
    return () => {
      document.removeEventListener('click', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, []);

  // Critical: Reset the vote locking mechanism when a new voting phase starts
  useEffect(() => {
    if (currentPhase === 'VOTING') {
      setVoteLocked(false);
      setSelectedForVote(null);
    }
  }, [currentPhase]);

  // Reconnect recovery: restore voteLocked + selectedForVote from server state
  useEffect(() => {
    if (currentPhase === 'VOTING' && room?.gameState?.currentVotes?.[playerId]) {
      setVoteLocked(true);
      setSelectedForVote(room.gameState.currentVotes[playerId]);
    }
  }, [currentPhase, room?.gameState?.currentVotes, playerId]);

  const votes = room?.gameState?.currentVotes || {};
  const votingResults = room?.gameState?.votingResults || {};
  const hasGnosia = room?.gameState?.gnosiaStillOnboard === true;

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

      <div className="scanline" />
      
      {currentPhase === 'WARP' && (timer?.remainingTimeSeconds ?? room?.gameState?.remainingTimeSeconds ?? 0) > 0 && (
          <div className="warp-timer">
              {(() => {
                  const secs = timer?.remainingTimeSeconds ?? room?.gameState?.remainingTimeSeconds ?? 0;
                  return `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, '0')}`;
              })()}
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
              className={`crew-card ${isMe ? 'self' : ''} ${isSpeaking ? 'speaking' : ''} ${cardStateClass} ${currentPhase === 'VOTING' && selectedForVote === p.id ? 'selected-for-vote' : ''}`}
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

              {/* Voted-for indicator during VOTING phase */}
              {currentPhase === 'VOTING' && selectedForVote === p.id && (
                <div className="vote-cast-tag">YOU VOTED</div>
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

      {/* Voting status message */}
      {currentPhase === 'VOTING' && voteLocked && (
        <div style={{textAlign:'center', padding:'6px 0 2px', fontFamily:'Orbitron', fontSize:10, color:'rgba(0,210,106,0.7)', letterSpacing:2}}>
          VOTE SUBMITTED — AWAITING REMAINING VOTES
        </div>
      )}

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
          <div style={{fontFamily:'Orbitron', fontSize:9, fontWeight:900, letterSpacing:3, color: currentPhase==='VOTING'?(voteLocked?'#00d26a':'#ff0040'):'#29b6f6', border:`1px solid ${currentPhase==='VOTING'?(voteLocked?'#00d26a':'#ff0040'):'rgba(41,182,246,0.4)'}`, padding:'6px 14px', background: currentPhase==='VOTING'?(voteLocked?'rgba(0,210,106,0.1)':'rgba(255,0,64,0.1)'):'rgba(41,182,246,0.05)'}}>
            ■ {currentPhase === 'DISCUSSION' ? 'MEETING IN PROGRESS' : currentPhase === 'VOTING' ? (voteLocked ? 'VOTE SUBMITTED' : 'VOTING IN PROGRESS') : currentPhase}
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
                {players.filter(p => p.id !== playerId && p.alive).map(p => (
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
            {messages.slice(-6).map((m) => (
                <motion.div 
                    key={m.id} 
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

      {/* GNOSIA-ONLY CHAT — visible to alive Gnosia only */}
      {role === 'GNOSIA' && !amIDead && (
        <>
          {/* GNOSIA CHAT MESSAGE LOG */}
          <div style={{
              position: 'fixed', bottom: '100px', right: '25px', zIndex: 100, width: '280px',
              maxHeight: '180px', pointerEvents: 'none', display: 'flex', flexDirection: 'column-reverse',
              gap: '8px', overflow: 'hidden'
          }}>
              <AnimatePresence>
                {gnosiaChatMessages.slice(-6).map((m, i) => (
                    <motion.div 
                        key={m.id || i} 
                        initial={{ opacity: 0, x: 20 }} 
                        animate={{ opacity: 1, x: 0 }}
                        style={{
                            background: 'rgba(30, 0, 10, 0.65)', borderRight: '3px solid #ff0040',
                            padding: '6px 12px', fontSize: '11px', color: 'rgba(255,255,255,0.8)',
                            fontFamily: "'Share Tech Mono', monospace", backdropFilter: 'blur(2px)',
                            textAlign: 'right'
                        }}
                    >
                        {m.content}
                        <span style={{ color: '#ff0040', fontWeight: 900, marginLeft: '8px' }}>
                            :{m.senderName.toUpperCase()}
                        </span>
                    </motion.div>
                ))}
              </AnimatePresence>
          </div>

          {/* GNOSIA CHAT INPUT */}
          <div style={{
              position: 'fixed', bottom: '65px', right: '25px', zIndex: 100, width: '280px',
              display: 'flex', border: '1px solid rgba(255, 0, 64, 0.4)', background: 'rgba(25,0,5,0.85)'
          }}>
              <input
                  type="text"
                  value={gnosiaChatInput}
                  onChange={(e) => setGnosiaChatInput(e.target.value)}
                  onKeyDown={(e) => {
                      if (e.key === 'Enter' && gnosiaChatInput.trim().length > 0) {
                          sendGnosiaChat && sendGnosiaChat(gnosiaChatInput.trim());
                          setGnosiaChatInput("");
                      }
                  }}
                  placeholder="GNOSIA ENCRYPTED..."
                  style={{ flex: 1, background: 'transparent', border: 'none', color: '#ff0040', padding: '10px', fontFamily: "'Share Tech Mono', monospace", fontSize: '12px', outline: 'none' }}
              />
              <button 
                  onClick={() => { 
                      if (gnosiaChatInput.trim().length > 0) {
                         sendGnosiaChat && sendGnosiaChat(gnosiaChatInput.trim());
                         setGnosiaChatInput(""); 
                      }
                  }} 
                  disabled={gnosiaChatInput.trim().length === 0}
                  style={{ background: 'rgba(255,0,64,0.2)', color: '#ff0040', border: 'none', borderLeft: '1px solid rgba(255,0,64,0.4)', padding: '0 15px', fontFamily: 'Orbitron', fontWeight: 900, cursor: 'pointer' }}
              >SEND</button>
          </div>
        </>
      )}

    </div>
  );
}
