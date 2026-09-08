import { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { NAME_MAP } from '../constants';
import './ActionPanel.css';

export default function ActionPanel({ phase, role, players, onAction, actionResult, privateInfo, myId }) {
    const [actionDone, setActionDone] = useState(() => {
        return sessionStorage.getItem('gnosia_action_done') === 'true';
    });
    const [selected, setSelected] = useState(null);
    const prevPhaseRef = useRef(phase);

    // Reconnect recovery: restore action state from server
    useEffect(() => {
        if (privateInfo?.actionDone) {
            setActionDone(true);
        }
    }, [privateInfo?.actionDone]);

    // Persist actionDone to sessionStorage for extra resilience
    useEffect(() => {
        sessionStorage.setItem('gnosia_action_done', actionDone);
    }, [actionDone]);

    // Reset action state when the phase actually changes — NOT on mount,
    // otherwise reconnect recovery (server says actionDone=true) is wiped.
    useEffect(() => {
        if (prevPhaseRef.current !== phase) {
            setActionDone(false);
            setSelected(null);
            sessionStorage.removeItem('gnosia_action_done');
            prevPhaseRef.current = phase;
        }
    }, [phase]);

    if (phase !== 'ROLE_ACTIONS' && phase !== 'WARP') return null;

    // Non-acting roles during either phase — show nothing
    if (!['ENGINEER', 'DOCTOR', 'GUARDIAN_ANGEL', 'GNOSIA'].includes(role)) {
        return null;
    }

    const handleActionClick = (p) => {
        if (actionDone) return;
        setSelected(p);
        onAction(p.id);
        setActionDone(true);
    };

    // ══════════════════════════════════════════
    //  ENGINEER — "Who will you investigate?"
    // ══════════════════════════════════════════
    if (role === 'ENGINEER') {
        const targets = players.filter(p => p.alive && p.id !== myId);

        return (
            <div style={{
                position: 'fixed', inset: 0, zIndex: 6000,
                background: 'rgba(0, 12, 30, 0.97)',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'flex-start',
                fontFamily: "'Share Tech Mono', monospace",
                backdropFilter: 'blur(8px)',
                overflowY: 'auto',
                paddingBottom: 40,
            }}>

                {/* Corner decorations */}
                <div style={{ position: 'fixed', top: 12, left: 16, fontFamily: 'Orbitron', fontSize: 9, color: 'rgba(0,255,245,0.3)', letterSpacing: 3 }}>
                    // ENGINEER AUTHORITY // SCAN PROTOCOL ACTIVE
                </div>
                <div style={{ position: 'fixed', top: 12, right: 16, fontFamily: 'Orbitron', fontSize: 9, color: 'rgba(0,255,245,0.3)', letterSpacing: 3 }}>
                    エンジニア権限
                </div>

                {/* HUD Elements */}
                <div className="holo-hud-circle" />

                {/* Title */}
                <motion.div
                    initial={{ opacity: 0, x: -50 }}
                    animate={{ opacity: 1, x: 0 }}
                    style={{ marginTop: 40, marginLeft: 160, width: '100%', textAlign: 'left' }}
                >
                    <div style={{
                        fontFamily: 'Orbitron', fontSize: 36, fontWeight: 900,
                        color: '#fff', letterSpacing: 6,
                        textShadow: '0 0 20px rgba(0,255,245,0.5)',
                    }}>
                        Who will you investigate?
                    </div>
                    <div style={{ marginTop: 6, fontSize: 10, color: 'rgba(0,255,245,0.45)', letterSpacing: 4 }}>
                        D.G.O. Crew Monitoring Terminal // Neural Signature Matching Active
                    </div>
                </motion.div>

                {/* Player grid */}
                {!actionDone ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, 300px)',
                            gap: '15px 25px',
                            justifyContent: 'center',
                            width: '100%',
                            marginTop: 40,
                            padding: '0 50px',
                        }}
                    >
                        {targets.map((p, i) => (
                            <motion.div
                                key={p.id}
                                className={`holo-card ${selected?.id === p.id ? 'holo-card-active' : ''}`}
                                initial={{ opacity: 0, x: -20 }}
                                animate={{ opacity: 1, x: 0 }}
                                transition={{ delay: i * 0.03 }}
                                onClick={() => handleActionClick(p)}
                            >
                                <div className="holo-scanline" />
                                <div className="holo-card-sidebar">SUSPECT</div>

                                <div className="holo-card-content">
                                    <div style={{ fontSize: 6, color: 'rgba(0,255,245,0.3)', letterSpacing: 2, marginBottom: 2 }}>D.G.O. Crew —————</div>
                                    <div className="holo-card-jp">{NAME_MAP[p.name] || p.name}</div>
                                    <div className="holo-card-en">{p.name.toUpperCase()}</div>
                                </div>

                                <div className="holo-card-portrait">
                                    <img src={p.avatar} alt={p.name} />
                                </div>
                            </motion.div>
                        ))}
                    </motion.div>
                ) : (
                    /* Scan result screen */
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        style={{
                            display: 'flex', flexDirection: 'column',
                            alignItems: 'center', gap: 20,
                            marginTop: 40,
                        }}
                    >
                        {selected && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16 }}>
                                <img src={selected.avatar} alt={selected.name} style={{
                                    width: 80, height: 100, objectFit: 'cover', objectPosition: 'top',
                                    border: '1px solid rgba(0,255,245,0.5)',
                                    filter: 'saturate(1.2)',
                                }} />
                                <div>
                                    <div style={{ fontFamily: 'Noto Sans JP', fontSize: 30, fontWeight: 900, color: '#fff' }}>
                                        {NAME_MAP[selected.name] || selected.name}
                                    </div>
                                    <div style={{ fontFamily: 'Orbitron', fontSize: 9, color: 'rgba(0,255,245,0.5)', letterSpacing: 3 }}>
                                        {selected.name.toUpperCase()} — SCAN COMPLETE
                                    </div>
                                </div>
                            </div>
                        )}

                        {actionResult ? (
                            <motion.div
                                className="result-pulse"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                style={{
                                    padding: '24px 60px',
                                    border: `2px solid ${actionResult === 'GNOSIA' ? '#ff0040' : '#00fff5'}`,
                                    background: actionResult === 'GNOSIA' ? 'rgba(255,0,64,0.1)' : 'rgba(0,255,245,0.06)',
                                    fontFamily: 'Orbitron',
                                    fontSize: 20,
                                    fontWeight: 900,
                                    letterSpacing: 6,
                                    textAlign: 'center',
                                    color: actionResult === 'GNOSIA' ? '#ff0040' : '#00fff5',
                                    textShadow: actionResult === 'GNOSIA'
                                        ? '0 0 20px #ff0040'
                                        : '0 0 20px rgba(0,255,245,0.6)',
                                }}
                            >
                                {actionResult === 'GNOSIA' ? (
                                    <>⚠ GNOSIA SIGNATURE DETECTED</>
                                ) : (
                                    <>✓ HUMAN CONFIRMED — NO VIRAL MARKERS</>
                                )}
                            </motion.div>
                        ) : (
                            <div style={{
                                fontFamily: 'Orbitron', fontSize: 13, letterSpacing: 5,
                                color: 'rgba(0,255,245,0.6)',
                                border: '1px solid rgba(0,255,245,0.3)',
                                padding: '16px 40px',
                            }}>
                                SCANNING... AWAITING RESULTS
                            </div>
                        )}
                    </motion.div>
                )}

                {/* Authority marker bottom right */}
                <div className="authority-marker">
                    <div className="authority-marker-jp">エンジニア権限</div>
                    <div className="authority-marker-en">ENGINEER AUTHORITY</div>
                </div>
            </div>
        );
    }

    // ══════════════════════════════════════════
    //  DOCTOR — "Who will you analyze?"
    // ══════════════════════════════════════════
    if (role === 'DOCTOR') {
        const targets = players.filter(p => p.cryoslept);

        return (
            <div style={{
                position: 'fixed', inset: 0, zIndex: 6000,
                background: 'rgba(10, 0, 20, 0.98)',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'flex-start',
                fontFamily: "'Share Tech Mono', monospace",
                backdropFilter: 'blur(10px)',
                overflowY: 'auto',
                paddingBottom: 40,
            }}>

                {/* Corner labels */}
                <div style={{ position: 'fixed', top: 12, left: 16, fontFamily: 'Orbitron', fontSize: 9, color: 'rgba(177,156,217,0.3)', letterSpacing: 3 }}>
                    // DOCTOR AUTHORITY // BIO-DATA ANALYSIS
                </div>
                <div style={{ position: 'fixed', top: 12, right: 16, fontFamily: 'Orbitron', fontSize: 9, color: 'rgba(177,156,217,0.3)', letterSpacing: 3 }}>
                    ドクター権限
                </div>

                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 60, marginBottom: 6, textAlign: 'center' }}>
                    <div style={{
                        fontFamily: 'Orbitron', fontSize: 26, fontWeight: 900,
                        color: '#fff', letterSpacing: 4,
                        textShadow: '0 0 20px rgba(177,156,217,0.5)',
                    }}>
                        Cryo-bay Autopsy
                    </div>
                    <div style={{ marginTop: 6, fontSize: 10, color: 'rgba(177,156,217,0.45)', letterSpacing: 4 }}>
                        SELECT A FROZEN UNIT TO ANALYZE THEIR BIOLOGICAL STATUS
                    </div>
                </motion.div>

                <div style={{ width: '80%', height: 1, background: 'linear-gradient(90deg, transparent, rgba(177,156,217,0.4), transparent)', margin: '16px 0 24px' }} />

                {!actionDone ? (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(240px, 320px))', gap: 12, width: '90%', maxWidth: 1000 }}
                    >
                        {targets.length === 0 && (
                            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: 40, color: 'rgba(177,156,217,0.5)', letterSpacing: 2 }}>
                                // NO SUBJECTS CURRENTLY IN COLD SLEEP //
                            </div>
                        )}
                        {targets.map((p, i) => (
                            <motion.div
                                key={p.id}
                                className={`doc-card ${selected?.id === p.id ? 'doc-selected' : ''}`}
                                style={{ animationDelay: `${i * 0.05}s` }}
                                onClick={() => handleActionClick(p)}
                            >
                                <div className="doc-scan-line" />
                                <div className="doc-label">FROZEN</div>
                                <img src={p.avatar} alt={p.name} className="doc-card-img" />
                                <div className="doc-card-info">
                                    <div className="doc-card-jp">{NAME_MAP[p.name] || p.name}</div>
                                    <div className="doc-card-en">{p.name.toUpperCase()}</div>
                                </div>
                                {selected?.id === p.id && (
                                    <div style={{
                                        position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                                        width: 22, height: 22, borderRadius: '50%', background: '#b19cd9',
                                        boxShadow: '0 0 14px #b19cd9', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 13, color: '#000', fontWeight: 900,
                                    }}>✓</div>
                                )}
                            </motion.div>
                        ))}
                    </motion.div>
                ) : (
                    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, marginTop: 40 }}>
                        {selected && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16 }}>
                                <img src={selected.avatar} alt={selected.name} style={{
                                    width: 80, height: 100, objectFit: 'cover', objectPosition: 'top',
                                    border: '1px solid rgba(177,156,217,0.5)',
                                    filter: 'saturate(1.2)',
                                }} />
                                <div>
                                    <div style={{ fontFamily: 'Noto Sans JP', fontSize: 30, fontWeight: 900, color: '#fff' }}>
                                        {NAME_MAP[selected.name] || selected.name}
                                    </div>
                                    <div style={{ fontFamily: 'Orbitron', fontSize: 9, color: 'rgba(177,156,217,0.5)', letterSpacing: 3 }}>
                                        {selected.name.toUpperCase()} — ANALYSIS COMPLETE
                                    </div>
                                </div>
                            </div>
                        )}

                        {actionResult ? (
                            <motion.div
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                style={{
                                    padding: '24px 60px',
                                    border: `2px solid ${actionResult === 'GNOSIA' ? '#ff0040' : '#4ade80'}`,
                                    background: actionResult === 'GNOSIA' ? 'rgba(255,0,64,0.1)' : 'rgba(74,222,128,0.06)',
                                    fontFamily: 'Orbitron', fontSize: 20, fontWeight: 900, letterSpacing: 6,
                                    textAlign: 'center', color: actionResult === 'GNOSIA' ? '#ff0040' : '#4ade80',
                                    textShadow: actionResult === 'GNOSIA' ? '0 0 20px #ff0040' : '0 0 20px rgba(74,222,128,0.6)',
                                }}
                            >
                                {actionResult === 'GNOSIA' ? "⚠ GNOSIA DETECTED" : "✓ HUMAN CONFIRMED"}
                            </motion.div>
                        ) : (
                            <div style={{ fontFamily: 'Orbitron', fontSize: 13, letterSpacing: 5, color: 'rgba(177,156,217,0.6)', border: '1px solid rgba(177,156,217,0.3)', padding: '16px 40px' }}>
                                ANALYZING CELLULAR STRUCTURE...
                            </div>
                        )}
                    </motion.div>
                )}

                {/* Bottom label */}
                <div style={{
                    position: 'fixed', bottom: 16, right: 20,
                    fontFamily: 'Orbitron', fontSize: 12, fontWeight: 900,
                    color: 'rgba(177,156,217,0.3)', letterSpacing: 2,
                    border: '1px solid rgba(177,156,217,0.15)',
                    padding: '4px 12px',
                    background: 'rgba(15,0,30,0.85)',
                }}>
                    ドクター権限<br/>
                    <span style={{ fontSize: 8, letterSpacing: 4 }}>DOCTOR CLEARANCE</span>
                </div>

                {/* Doctor Authority Badge (Bottom Left) */}
                <div style={{
                    position: 'fixed', bottom: 20, left: 30,
                    width: 100, height: 100,
                    borderRadius: '50%',
                    background: 'rgba(20, 0, 40, 0.9)',
                    border: '2px solid rgba(177, 156, 217, 0.7)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 0 30px rgba(177, 156, 217, 0.5)',
                    overflow: 'hidden',
                    zIndex: 6001
                }}>
                    <img src="/images/DoctorSymbol.png" alt="Doctor" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
            </div>
        );
    }

    // ══════════════════════════════════════════
    //  GUARDIAN ANGEL — "Who will you protect?"
    // ══════════════════════════════════════════
    if (role === 'GUARDIAN_ANGEL') {
        const targets = players.filter(p => p.alive && p.id !== myId);

        return (
            <div style={{
                position: 'fixed', inset: 0, zIndex: 6000,
                background: 'rgba(0, 12, 20, 0.97)',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'flex-start',
                fontFamily: "'Share Tech Mono', monospace",
                backdropFilter: 'blur(8px)',
                overflowY: 'auto',
                paddingBottom: 40,
            }}>

                {/* Corner labels */}
                <div style={{ position: 'fixed', top: 12, left: 16, fontFamily: 'Orbitron', fontSize: 9, color: 'rgba(74,222,128,0.3)', letterSpacing: 3 }}>
                    // GUARDIAN ANGEL AUTHORITY // SHIELD PROTOCOL ACTIVE
                </div>
                <div style={{ position: 'fixed', top: 12, right: 16, fontFamily: 'Orbitron', fontSize: 9, color: 'rgba(74,222,128,0.3)', letterSpacing: 3 }}>
                    守護天使権限
                </div>

                {/* Title */}
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{ marginTop: 60, marginBottom: 6, textAlign: 'center' }}
                >
                    <div style={{
                        fontFamily: 'Orbitron', fontSize: 26, fontWeight: 900,
                        color: '#fff', letterSpacing: 4,
                        textShadow: `0 0 20px rgba(74,222,128,0.5)`,
                    }}>
                        Who will you protect?
                    </div>
                    <div style={{ marginTop: 6, fontSize: 10, color: 'rgba(74,222,128,0.45)', letterSpacing: 4 }}>
                        SELECT ONE CREW MEMBER TO SHIELD FROM GNOSIA DURING WARP
                    </div>
                </motion.div>

                {/* Divider */}
                <div style={{ width: '80%', height: 1, background: 'linear-gradient(90deg, transparent, rgba(74,222,128,0.4), transparent)', margin: '16px 0 24px' }} />

                {/* Player grid */}
                {!actionDone ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(3, minmax(240px, 320px))',
                            gap: 12, width: '90%', maxWidth: 1000,
                        }}
                    >
                        {targets.map((p, i) => (
                            <motion.div
                                key={p.id}
                                className={`ga-card ${selected?.id === p.id ? 'ga-selected' : ''}`}
                                style={{ animationDelay: `${i * 0.05}s` }}
                                onClick={() => handleActionClick(p)}
                            >
                                <div className="ga-scan-line" />
                                <div className="ga-suspect-label">UNIT</div>
                                <img src={p.avatar} alt={p.name} className="ga-card-img" />
                                <div className="ga-card-info">
                                    <div className="ga-card-gog">G.G.G. Crew &nbsp; 保護対象選択</div>
                                    <div className="ga-card-jp">{NAME_MAP[p.name] || p.name}</div>
                                    <div className="ga-card-en">{p.name.toUpperCase()}</div>
                                </div>
                                {selected?.id === p.id && (
                                    <div style={{
                                        position: 'absolute', right: 10,
                                        top: '50%', transform: 'translateY(-50%)',
                                        width: 22, height: 22,
                                        borderRadius: '50%',
                                        background: '#4ade80',
                                        boxShadow: '0 0 14px #4ade80',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 13, color: '#000', fontWeight: 900,
                                    }}>✓</div>
                                )}
                            </motion.div>
                        ))}
                    </motion.div>
                ) : (
                    /* Shield confirmed screen */
                    <motion.div
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, marginTop: 40 }}
                    >
                        {selected && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 16 }}>
                                <img src={selected.avatar} alt={selected.name} style={{
                                    width: 80, height: 100, objectFit: 'cover', objectPosition: 'top',
                                    border: '1px solid rgba(74,222,128,0.5)',
                                    filter: 'saturate(1.2)',
                                }} />
                                <div>
                                    <div style={{ fontFamily: 'Noto Sans JP', fontSize: 30, fontWeight: 900, color: '#fff' }}>
                                        {NAME_MAP[selected.name] || selected.name}
                                    </div>
                                    <div style={{ fontFamily: 'Orbitron', fontSize: 9, color: 'rgba(74,222,128,0.5)', letterSpacing: 3 }}>
                                        {selected.name.toUpperCase()} — SHIELD DEPLOYED
                                    </div>
                                </div>
                            </div>
                        )}
                        <div className="ga-shield-icon" style={{ fontSize: 60, marginBottom: 8 }}>🛡️</div>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            style={{
                                padding: '22px 56px',
                                border: '2px solid #4ade80',
                                background: 'rgba(74,222,128,0.07)',
                                fontFamily: 'Orbitron',
                                fontSize: 18, fontWeight: 900, letterSpacing: 5,
                                textAlign: 'center', color: '#4ade80',
                                textShadow: '0 0 20px rgba(74,222,128,0.6)',
                            }}
                        >
                            🪽 GUARDIAN SHIELD ACTIVE
                        </motion.div>
                        <div style={{ fontFamily: 'Share Tech Mono', fontSize: 10, color: 'rgba(74,222,128,0.4)', letterSpacing: 3, textAlign: 'center' }}>
                            PROTECTION LOCKED IN — AWAITING WARP SEQUENCE
                        </div>
                    </motion.div>
                )}

                {/* Bottom label */}
                <div style={{
                    position: 'fixed', bottom: 16, right: 20,
                    fontFamily: 'Orbitron', fontSize: 12, fontWeight: 900,
                    color: 'rgba(74,222,128,0.3)', letterSpacing: 2,
                    border: '1px solid rgba(74,222,128,0.15)',
                    padding: '4px 12px',
                    background: 'rgba(0,20,12,0.85)',
                }}>
                    守護天使権限<br/>
                    <span style={{ fontSize: 8, letterSpacing: 4 }}>GUARDIAN CLEARANCE</span>
                </div>

                {/* Guardian Authority Badge (Bottom Left) */}
                <div style={{
                    position: 'fixed', bottom: 20, left: 30,
                    width: 100, height: 100,
                    borderRadius: '50%',
                    background: 'rgba(0, 20, 10, 0.9)',
                    border: '2px solid rgba(74, 222, 128, 0.7)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 0 30px rgba(74, 222, 128, 0.5)',
                    overflow: 'hidden',
                    zIndex: 6001
                }}>
                    <img src="/images/GuardianAngelSymbol.png" alt="Guardian" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
            </div>
        );
    }

    // ══════════════════════════════════════════
    //  GNOSIA — "Who will you eliminate?" (WARP)
    // ══════════════════════════════════════════
    if (role === 'GNOSIA') {
        const targets = players.filter(p => p.alive && p.id !== myId && !privateInfo?.partners?.includes(p.id));

        return (
            <div style={{
                position: 'fixed', inset: 0, zIndex: 6000,
                background: 'rgba(25, 0, 5, 0.98)',
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'flex-start',
                fontFamily: "'Share Tech Mono', monospace",
                backdropFilter: 'blur(10px)',
                overflowY: 'auto',
                paddingBottom: 40,
            }}>

                {/* Corner labels */}
                <div style={{ position: 'fixed', top: 12, left: 16, fontFamily: 'Orbitron', fontSize: 9, color: 'rgba(255,0,64,0.3)', letterSpacing: 3 }}>
                    // GNOSIA INFECTED // ELIMINATION PROTOCOL
                </div>
                <div style={{ position: 'fixed', top: 12, right: 16, fontFamily: 'Orbitron', fontSize: 9, color: 'rgba(255,0,64,0.3)', letterSpacing: 3 }}>
                    グノーシア権限
                </div>

                <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} style={{ marginTop: 60, marginBottom: 6, textAlign: 'center' }}>
                    <div style={{
                        fontFamily: 'Orbitron', fontSize: 26, fontWeight: 900,
                        color: '#fff', letterSpacing: 4,
                        textShadow: '0 0 20px #ff0040',
                    }}>
                        Who will you eliminate?
                    </div>
                </motion.div>

                <div style={{ width: '80%', height: 1, background: 'linear-gradient(90deg, transparent, rgba(255,0,64,0.4), transparent)', margin: '16px 0 24px' }} />

                {!actionDone ? (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(240px, 320px))', gap: 12, width: '90%', maxWidth: 1000 }}
                    >
                        {targets.map((p, i) => (
                            <motion.div
                                key={p.id}
                                className={`g-card ${selected?.id === p.id ? 'g-selected' : ''}`}
                                style={{ animationDelay: `${i * 0.05}s` }}
                                onClick={() => handleActionClick(p)}
                            >
                                <div className="g-scan-line" />
                                <div className="g-label">TARGET</div>
                                <img src={p.avatar} alt={p.name} className="g-card-img" />
                                <div className="g-card-info">
                                    <div className="g-card-jp">{NAME_MAP[p.name] || p.name}</div>
                                    <div className="g-card-en">{p.name.toUpperCase()}</div>
                                </div>
                                {selected?.id === p.id && (
                                    <div style={{
                                        position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                                        width: 22, height: 22, borderRadius: '50%', background: '#ff0040',
                                        boxShadow: '0 0 14px #ff0040', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: 13, color: '#000', fontWeight: 900,
                                    }}>💀</div>
                                )}
                            </motion.div>
                        ))}
                    </motion.div>
                ) : (
                    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, marginTop: 40 }}>
                        <div style={{ fontSize: 60 }}>💀</div>
                        <div style={{
                            padding: '22px 56px', border: '2px solid #ff0040', background: 'rgba(255,0,64,0.1)',
                            fontFamily: 'Orbitron', fontSize: 18, fontWeight: 900, letterSpacing: 5,
                            textAlign: 'center', color: '#ff0040', textShadow: '0 0 20px #ff0040',
                        }}>
                            TARGET LOCKED — ELIMINATION IN PROGRESS
                        </div>
                    </motion.div>
                )}

                <div style={{
                    position: 'fixed', bottom: 16, right: 20,
                    fontFamily: 'Orbitron', fontSize: 12, fontWeight: 900,
                    color: 'rgba(255,0,64,0.3)', letterSpacing: 2,
                    border: '1px solid rgba(255,0,64,0.15)',
                    padding: '4px 12px',
                    background: 'rgba(20,0,5,0.85)',
                }}>
                    グノーシア権限<br/>
                    <span style={{ fontSize: 8, letterSpacing: 4 }}>GNOSIA CLEARANCE</span>
                </div>

                {/* Gnosia Authority Badge (Bottom Left) */}
                <div style={{
                    position: 'fixed', bottom: 20, left: 30,
                    width: 100, height: 100,
                    borderRadius: '50%',
                    background: 'rgba(25, 0, 5, 0.9)',
                    border: '2px solid rgba(255, 0, 64, 0.7)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 0 30px rgba(255, 0, 64, 0.5)',
                    overflow: 'hidden',
                    zIndex: 6001
                }}>
                    <img src="/images/GnosiaSymbol.png" alt="Gnosia" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
            </div>
        );
    }

    return null;
}
