import React, { useState, useEffect } from 'react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import './App.css';
import { useGame } from './hooks/useGame';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Zap, BarChart2 } from 'lucide-react';
import AnalyticsDashboard from './components/AnalyticsDashboard';
import VoiceCommsOverlay from './components/MeetingRoom';
import LandingPage from './components/LandingPage';
import CreateRoom from './components/CreateRoom';
import VotingResults from './components/VotingResults';
import ActionPanel from './components/ActionPanel';

const App = () => {
    const [isJoined, setIsJoined] = useState(false);
    const [roomCodeInput, setRoomCodeInput] = useState('');
    const [showAnalytics, setShowAnalytics] = useState(false);
    const [inMeeting, setInMeeting] = useState(false);
    const [localMuted, setLocalMuted] = useState(false);
    const [globalVolume, setGlobalVolume] = useState(1);
    const [joinPin, setJoinPin] = useState(''); // Keep variable just to not break destructuring if any, or remove
    const [lobbyMode, setLobbyMode] = useState('MAIN'); // MAIN, JOIN, CREATE

    const [pendingAction, setPendingAction] = useState(null); // { type: 'JOIN'|'CREATE', code, participants, pin }
    
    const {
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
        stompReady,
        dmMessages,
        sendDm,
    } = useGame(roomCodeInput);

    useEffect(() => {
        if (stompReady && pendingAction) {
            if (pendingAction.type === 'JOIN') {
                subscribeToState(pendingAction.code, null, pendingAction.pin);
            } else if (pendingAction.type === 'CREATE') {
                createRoom(pendingAction.code, pendingAction.participants, "");
            }
            setIsJoined(true);
            setPendingAction(null);
        }
    }, [stompReady, pendingAction, subscribeToState, createRoom]);

    const handleJoin = (e) => {
        if (e) e.preventDefault();
        if (roomCodeInput) {
            setJoinError(null);
            setPendingAction({ type: 'JOIN', code: roomCodeInput, pin: joinPin });
            connect();
        }
    };

    const handleCreateRoom = ({ roomCode: generatedCode, participants }) => {
        setPendingAction({ type: 'CREATE', code: generatedCode, participants });
        connect();
    };

    const fillWithBots = () => {
        if (!room) return;
        const botsNeeded = room.config.maxPlayers - room.players.length;
        for (let i = 0; i < botsNeeded; i++) {
            const client = new Client({
                webSocketFactory: () => new SockJS('http://localhost:8080/game-ws'),
                debug: () => {},
            });
            client.onConnect = () => {
                client.publish({
                    destination: `/app/room/${room.roomCode}/join`,
                    body: JSON.stringify({ id: 'DEV-BOT-' + Math.random(), pin: '' }),
                });
            };
            client.activate();
        }
    };

    useEffect(() => {
        const savedRoom = localStorage.getItem('gnosia_room_code');
        if (savedRoom && !isJoined) {
            setRoomCodeInput(savedRoom);
        }
    }, []);

    // Auto-enter meeting during DISCUSSION phase
    useEffect(() => {
        if (room?.gameState?.phase === 'DISCUSSION' && !inMeeting) {
            connectToMedia();
            setInMeeting(true);
        } else if (room?.gameState?.phase !== 'DISCUSSION' && inMeeting) {
            setInMeeting(false);
        }
    }, [room?.gameState?.phase]);

    if (!isJoined) {
        // Sub-screen: enter PIN to join
        if (lobbyMode === 'JOIN') {
            return (
                <div className="lobby-outer">
                    <div className="lobby-bg-pattern" />
                    <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="lobby-container">
                        <header className="lobby-header">
                            <h1>GNOSIA</h1>
                        </header>
                        <main className="lobby-card glass-panel">
                            <div className="lobby-join-form">
                                <h3>Game PIN (6-char code)</h3>
                                <form onSubmit={handleJoin}>
                                    <input
                                        type="text"
                                        placeholder="XXXXXX"
                                        value={roomCodeInput}
                                        onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                                        className="pin-input"
                                        maxLength={6}
                                        required
                                        autoFocus
                                    />
                                    <button type="submit" className="button-primary play-btn" style={{ marginTop: 32 }}>Enter Ship</button>
                                    
                                    {joinError && (
                                        <div style={{ marginTop: 16, color: "#ff0040", fontSize: 11, fontWeight: 700, letterSpacing: 1, textAlign: "center", border: "1px dashed rgba(255,0,64,0.3)", padding: "8px" }}>
                                            ⚠️ AUTH ERROR: {joinError.toUpperCase()}
                                        </div>
                                    )}

                                    <button type="button" className="text-btn" onClick={() => setLobbyMode('MAIN')}>← Back</button>
                                </form>
                            </div>
                        </main>
                    </motion.div>
                </div>
            );
        }

        // Sub-screen: Create Room customizer
        if (lobbyMode === 'CREATE') {
            return (
                <CreateRoom 
                    onSave={handleCreateRoom}
                    onBack={() => setLobbyMode('MAIN')}
                />
            );
        }

        // Default: show the premium landing page
        return (
            <LandingPage
                onPlay={() => setLobbyMode('JOIN')}
                onCreateRoom={() => setLobbyMode('CREATE')}
            />
        );
    }

    if (!room) return <div className="loading">Syncing with Station...</div>;

    const currentPhase = room.gameState.phase;
    const isWarp = currentPhase === 'WARP';
    const isGnosia = privateInfo?.role === 'GNOSIA';
    const isDead = room.players.find(p => p.id === playerId)?.alive === false;

    const NAME_MAP = {
        "Setsu": "セツ", "Jina": "ジナ", "SQ": "SQ", "Raqio": "ラキオ", "Stella": "ステラ",
        "Shigemichi": "シゲミチ", "Chipie": "チピエ", "Comet": "コメット", "Jonas": "ジョナス",
        "Kukurushka": "クルーシュカ", "Otome": "オトメ", "Sha-ming": "シャーミン", "Remnan": "レムナン",
        "Yuriko": "ユリコ", "Yuri": "ユーリ"
    };

    const isGameOver = currentPhase === 'GAME_OVER';
    const isGnosiaWin = room.gameState.winner === 'GNOSIA';
    const isHumanWin = room.gameState.winner === 'HUMAN';
    const containerClass = isGameOver 
        ? (isGnosiaWin ? 'app-container gnosia-win' : 'app-container human-win') 
        : `app-container ${isWarp ? 'warp-mode' : ''}`;

    return (
        <div className={containerClass}>
            {/* Main Navigation */}
            {/* Main Navigation */}
            <header className="gnosia-header">
                <div className="gnosia-logo">GN<span className="red-square"></span>SIA</div>
                {['DISCUSSION', 'VOTING'].includes(currentPhase) && (
                    <>
                        <div className="diamond-bullet">♦</div>
                        <div className={`phase-badge ${currentPhase === 'VOTING' ? 'voting' : ''}`}>
                            {currentPhase === 'VOTING' ? 'VOTE PHASE' : 'MEETING ROOM'}
                        </div>
                    </>
                )}
                
                <div className="timer-box">
                    {currentPhase === 'INTRO' ? 'LEVI COMMUNICATING...' : 
                     `${Math.floor(room.gameState.remainingTimeSeconds / 60).toString().padStart(2, '0')}:${Math.floor(room.gameState.remainingTimeSeconds % 60).toString().padStart(2, '0')}`}
                </div>
                
                {currentPhase === 'LOBBY' && room.config && room.players.length >= room.config.maxPlayers && (
                    <button className="button-primary" style={{marginLeft: '20px', padding: '8px 20px', fontSize: '12px'}} onClick={() => startGame()}>
                        COMMENCE
                    </button>
                )}
                {currentPhase === 'LOBBY' && room.config && room.players.length < room.config.maxPlayers && (
                    <div style={{marginLeft: '20px', fontSize: '12px', color: '#ff0040', fontWeight: 'bold'}}>
                        WAITING FOR CREW ({room.players.length}/{room.config.maxPlayers})
                        <button onClick={fillWithBots} style={{marginLeft: '10px', padding: '2px 8px', background: '#333', color: '#fff', border: 'none', cursor: 'pointer'}}>
                            [DEV: FILL BOTS]
                        </button>
                    </div>
                )}
                
                <div className="ship-status">
                    {currentPhase === 'VOTING' ? (
                        <span style={{color: '#1a3a5a'}}>// SELECT SUSPECT — CANNOT UNVOTE</span>
                    ) : (
                        `VESSEL: NOVA-${room.roomCode.substring(0,1) || '7'} / CREW: ${room.players.length}`
                    )}
                </div>
            </header>

            <div className="game-body">
                <main className="player-grid terminal-grid">
                    <AnimatePresence>
                        {(inMeeting || currentPhase === 'VOTING' || currentPhase === 'DISCUSSION' || currentPhase === 'WARP' || currentPhase === 'INTRO') && (
                            <VoiceCommsOverlay 
                                players={room.players} 
                                streams={streams} 
                                currentPhase={currentPhase}
                                role={isDead ? 'SPECTATOR' : privateInfo?.role}
                                privateInfo={privateInfo}
                                playerId={playerId}
                                localMuted={localMuted}
                                setLocalMuted={setLocalMuted}
                                globalVolume={globalVolume}
                                setGlobalVolume={setGlobalVolume}
                                onVote={vote}
                                onKill={kill}
                                playerName={room.players.find(p => p.id === playerId)?.name}
                                room={room}
                                messages={messages}
                                dmMessages={dmMessages}
                                sendMessage={sendMessage}
                                onDm={sendDm}
                            />
                        )}
                    </AnimatePresence>

                    {/* Voting Results Layer */}
                    <AnimatePresence>
                        {(currentPhase === 'RESULT' || currentPhase === 'CRYOSLEEP') && (
                            <VotingResults 
                                players={room.players} 
                                currentVotes={room.gameState.currentVotes} 
                                phase={currentPhase}
                                lastCryosleptPlayerId={room.gameState.lastCryosleptPlayerId}
                                gnosiaStillOnboard={room.gameState.gnosiaStillOnboard}
                            />
                        )}
                    </AnimatePresence>

                    {/* Action Panel Layer (Engineer, Doctor, Guardian Angel, Gnosia) */}
                    <AnimatePresence>
                        {(currentPhase === 'ROLE_ACTIONS' || currentPhase === 'WARP') && (
                            <ActionPanel 
                                phase={currentPhase}
                                role={privateInfo?.role}
                                players={room.players}
                                lastCryoId={room.gameState.lastCryosleptPlayerId}
                                actionResult={(privateInfo?.role === 'ENGINEER') ? scanResult?.result : ((privateInfo?.role === 'DOCTOR') ? doctorResult?.result : null)}
                                privateInfo={privateInfo}
                                myId={playerId}
                                onAction={(id) => {
                                    if (privateInfo?.role === 'ENGINEER') scan(id);
                                    if (privateInfo?.role === 'DOCTOR') doctorCheck(id);
                                    if (privateInfo?.role === 'GUARDIAN_ANGEL') protect(id);
                                    if (privateInfo?.role === 'GNOSIA') kill(id);
                                }}
                            />
                        )}
                    </AnimatePresence>

                    {/* Analytics Dashboard Layer */}
                    <AnimatePresence>
                        {showAnalytics && (
                             <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} className="analytics-sidebar-overlay glass-panel">
                                <AnalyticsDashboard room={room} />
                             </motion.div>
                        )}
                    </AnimatePresence>


                </main>
            </div>

            {/* GAME OVER OVERLAY */}
            <AnimatePresence>
                {isGameOver && (
                    <motion.div 
                        initial={{ opacity: 0 }} 
                        animate={{ opacity: 1 }} 
                        className={`game-over-overlay ${isGnosiaWin ? 'gnosia-wins' : 'humans-win'}`}
                    >
                        <div className="victory-text-container">
                            <motion.div initial={{ y: 50, scale: 2 }} animate={{ y: 0, scale: 1 }} className="victory-title">
                                {isGnosiaWin ? 'GNOSIA HAVE WON' : 'HUMANS HAVE WON'}
                            </motion.div>
                            <div className="victory-subline">MISSION CONCLUDED — TERMINAL SYNC STABILIZED</div>
                            <button className="button-primary" onClick={() => window.location.reload()} style={{ marginTop: '40px', padding: '12px 40px' }}>
                                NEW CYCLE
                            </button>
                        </div>
                        <div className="victory-light-beam" />
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Smart Levi AI Notifications */}
            <AnimatePresence>
                {room.gameState.leviObservations?.length > 0 && (
                    <motion.div initial={{ x: 300 }} animate={{ x: 0 }} className="levi-box smart-levi glass-panel">
                        <Brain size={24} color="#66fcf1" />
                        <div className="levi-text">
                            {room.gameState.leviObservations.map((obs, i) => <p key={i}><span>LEVI:</span> {obs}</p>)}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default App;
