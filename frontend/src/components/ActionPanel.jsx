import React, { useState } from 'react';
import { motion } from 'framer-motion';

const NAME_MAP = {
    "Setsu": "セツ", "Jina": "ジナ", "SQ": "SQ", "Raqio": "ラキオ", "Stella": "ステラ",
    "Shigemichi": "シゲミチ", "Chipie": "チピエ", "Comet": "コメット", "Jonas": "ジョナス",
    "Kukurushka": "クルーシュカ", "Otome": "オトメ", "Sha-ming": "シャーミン", "Remnan": "レムナン",
    "Yuriko": "ユリコ", "Yuri": "ユーリ"
};

export default function ActionPanel({ phase, role, players, lastCryoId, onAction, actionResult }) {
    const [actionDone, setActionDone] = useState(false);

    if (phase !== 'ROLE_ACTIONS' && phase !== 'WARP') return null;
    
    // Ignore human and non-acting roles during ROLE_ACTIONS
    if (phase === 'ROLE_ACTIONS' && !['ENGINEER', 'DOCTOR', 'GUARDIAN_ANGEL'].includes(role)) {
        return null;
    }

    // Ignore non-Gonosia during WARP
    if (phase === 'WARP' && role !== 'GONOSIA') {
        return (
            <div className="action-panel-overlay">
                <style>{`
                    .warp-effect-bg {
                        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                        background: rgba(0, 0, 0, 0.95); z-index: 2000;
                        display: flex; flex-direction: column; align-items: center; justify-content: center;
                        color: #ff00ff; font-family: 'Orbitron', monospace; letter-spacing: 10px;
                    }
                    .warp-title { font-size: 36px; text-shadow: 0 0 30px #ff00ff; animation: pulse 2s infinite; }
                    .warp-desc { font-family: 'Share Tech Mono', monospace; font-size: 14px; letter-spacing: 2px; color: #fff; margin-top: 20px;}
                    @keyframes pulse { 0% { opacity: 0.5; } 50% { opacity: 1; text-shadow: 0 0 50px #ff00ff; } 100% { opacity: 0.5; } }
                `}</style>
                <div className="warp-effect-bg">
                    <div className="warp-title">WARP SEQUENCE INITIATED</div>
                    <div className="warp-desc">REMAINING IN DORMANCY FOR 2 MINUTES...</div>
                </div>
            </div>
        );
    }

    let title = "";
    let description = "";
    let targets = [];
    let actionLabel = "";
    let themeColor = "#00fff5";

    if (phase === 'ROLE_ACTIONS') {
        if (role === 'ENGINEER') {
            title = "ENGINEER TERMINAL";
            description = "SELECT A CREW MEMBER TO SCAN FOR G.O.G. VIRAL SIGNATURES.";
            targets = players.filter(p => p.alive);
            actionLabel = "INITIATE SCAN";
        } else if (role === 'DOCTOR') {
            title = "MEDICAL BAY AUTOPSY";
            description = "ANALYZE BIOSIGNALS OF THE RECENTLY CRYOSLEPT INDIVIDUAL.";
            targets = players.filter(p => !p.alive && p.cryoslept && p.id === lastCryoId);
            actionLabel = "BIO-SCAN";
        } else if (role === 'GUARDIAN_ANGEL') {
            title = "GUARDIAN SHIELD RELAY";
            description = "SELECT A CREW MEMBER TO PROTECT DURING WARP.";
            targets = players.filter(p => p.alive);
            actionLabel = "DEPLOY SHIELD";
            themeColor = "#4ade80";
        }
    } else if (phase === 'WARP') {
        if (role === 'GONOSIA') {
            title = "G-VIRUS OUTBREAK LOGIC";
            description = "SELECT A HUMAN TARGET FOR ELIMINATION.";
            // Gonosia can only target alive NON-Gonosia players (UI logic)
            targets = players.filter(p => p.alive && p.role !== 'GONOSIA');
            actionLabel = "ELIMINATE";
            themeColor = "#ff0040";
        }
    }

    const handleActionClick = (id) => {
        if (!actionDone) {
            onAction(id);
            setActionDone(true);
        }
    };

    return (
        <div className="action-panel-overlay">
            <style>{`
                .action-panel-overlay {
                    position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                    background: rgba(0, 5, 15, 0.95); z-index: 2000;
                    display: flex; align-items: center; justify-content: center;
                    font-family: 'Share Tech Mono', monospace; backdrop-filter: blur(10px);
                }
                .action-container {
                    background: rgba(0, 10, 25, 0.9); border: 1px solid #1a3a5a;
                    padding: 40px; width: 90%; max-width: 1000px;
                    box-shadow: 0 0 50px rgba(0, 255, 245, 0.1);
                }
                .action-title {
                    font-family: 'Orbitron', monospace; color: ${themeColor};
                    font-size: 24px; letter-spacing: 5px; margin-bottom: 10px; text-align: center;
                }
                .action-desc { color: rgba(255, 255, 255, 0.6); text-align: center; margin-bottom: 30px; letter-spacing: 2px; }
                .target-grid {
                    display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
                    gap: 15px; max-height: 60vh; overflow-y: auto; padding-right: 10px;
                }
                .target-card {
                    background: #010b1f; border: 1px solid #1a3a5a;
                    cursor: pointer; position: relative; transition: all 0.2s;
                    display: flex; flex-direction: column;
                }
                .target-card:hover {
                    border-color: ${themeColor}; box-shadow: 0 0 15px ${themeColor}40;
                    transform: translateY(-2px);
                }
                .target-img { width: 100%; height: 120px; object-fit: cover; object-position: top; filter: grayscale(0.6); transition: 0.3s; }
                .target-card:hover .target-img { filter: grayscale(0); }
                .target-info { padding: 10px; text-align: center; }
                .target-name { font-weight: bold; color: #fff; margin-bottom: 4px; }
                .target-btn {
                    margin-top: 5px; width: 100%; padding: 8px; background: transparent;
                    border: 1px solid ${themeColor}; color: ${themeColor};
                    cursor: pointer; font-family: 'Orbitron', monospace; font-size: 10px; letter-spacing: 2px; transition: all 0.2s;
                }
                .target-card:hover .target-btn { background: ${themeColor}; color: #000; }
                .result-box {
                    margin-top: 20px; padding: 20px; border: 1px dashed ${themeColor}; background: ${themeColor}10;
                    text-align: center; color: ${themeColor}; font-family: 'Orbitron', monospace; font-size: 18px; letter-spacing: 4px;
                }
            `}</style>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="action-container">
                <div className="action-title">{title}</div>
                <div className="action-desc">{description}</div>
                
                {(!actionDone && !actionResult) ? (
                    <div className="target-grid">
                        {targets.length === 0 && <div style={{color: '#fff', textAlign: 'center', gridColumn: '1 / -1'}}>NO VALID TARGETS FOUND.</div>}
                        {targets.map(p => (
                            <div key={p.id} className="target-card" onClick={() => handleActionClick(p.id)}>
                                <img src={p.avatar} alt={p.name} className="target-img" />
                                <div className="target-info">
                                    <div className="target-name">{NAME_MAP[p.name] || p.name}</div>
                                    <button className="target-btn">{actionLabel}</button>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="result-box">
                        {actionResult ? 
                           (actionResult === 'GONOSIA' ? <span style={{color:'#ff0040'}}>GONOSIA SIGNATURE DETECTED</span> : <span style={{color:'#4ade80'}}>HUMAN CONFIRMED</span>)
                           : <span>ACTION LOGGED INTO SYSTEM.</span>
                        }
                    </motion.div>
                )}
            </motion.div>
        </div>
    );
}
