import React from 'react';
import { motion } from 'framer-motion';

const NAME_MAP = {
    "Setsu": "セツ", "Jina": "ジナ", "SQ": "SQ", "Raqio": "ラキオ", "Stella": "ステラ",
    "Shigemichi": "シゲミチ", "Chipie": "チピエ", "Comet": "コメット", "Jonas": "ジョナス",
    "Kukurushka": "クルーシュカ", "Otome": "オトメ", "Sha-ming": "シャーミン", "Remnan": "レムナン",
    "Yuriko": "ユリコ", "Yuri": "ユーリ"
};

export default function VotingResults({ players, currentVotes, phase, lastCryosleptPlayerId, gnosiaStillOnboard, onComplete }) {
  // currentVotes: { voterId: targetId }
  const selectedPlayer = players.find(p => p.id === lastCryosleptPlayerId);
  const isExecution = phase === 'CRYOSLEEP' && selectedPlayer;

  const tallies = {};
  players.forEach(p => tallies[p.id] = 0);
  Object.values(currentVotes || {}).forEach(targetId => {
    if (tallies.hasOwnProperty(targetId)) tallies[targetId]++;
  });

  if (isExecution) {
    return (
      <div className="voting-results-overlay execution-mode">
        <style>{`
          .execution-container {
             display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; width: 100%;
             position: relative; z-index: 10; font-family: 'Orbitron', sans-serif;
          }
          .execution-title {
            font-size: 10px; letter-spacing: 8px; color: #00fff5; margin-bottom: 50px; font-weight: 900;
            text-shadow: 0 0 10px #00fff5;
          }
          .execution-portrait {
            width: 250px; height: 320px; border: 1px solid #00fff5; position: relative; overflow: hidden;
            box-shadow: 0 0 40px rgba(0, 255, 245, 0.4);
          }
          .execution-portrait img {
            width: 100%; height: 100%; object-fit: cover; filter: saturate(0.5) brightness(1.1);
          }
          .execution-glitch {
            position: absolute; inset: 0; background: repeating-linear-gradient(0deg, transparent, rgba(0,255,245,0.1) 2px, transparent 4px);
            pointer-events: none; animation: scanline 4s linear infinite;
          }
          .execution-name-jp { font-family: 'Noto Sans JP'; font-size: 40px; color: #fff; margin-top: 30px; font-weight: 900; text-shadow: 0 0 20px rgba(255,255,255,0.3); }
          .execution-name-en { font-size: 14px; letter-spacing: 10px; color: rgba(255,255,255,0.4); margin-bottom: 50px; }
          
          .status-indicator {
            width: 400px; height: 12px; border: 1px solid rgba(255,255,255,0.2); position: relative; background: #000;
          }
          .status-bar {
            height: 100%; transition: width 1s ease;
            background: #ff0040; box-shadow: 0 0 15px #ff0040;
          }
          .status-label {
             font-size: 8px; color: #ff0040; margin-top: 10px; letter-spacing: 3px; font-weight: 900;
          }

          @keyframes scanline { 0% { transform: translateY(-100%); } 100% { transform: translateY(100%); } }
        `}</style>

        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="execution-container">
            <div className="execution-title">STASIS PROTOCOL INITIATED</div>
            
            <motion.div initial={{ scale: 0.8, rotateY: 90 }} animate={{ scale: 1, rotateY: 0 }} transition={{ duration: 0.8 }} className="execution-portrait">
                <img src={selectedPlayer.avatar} alt={selectedPlayer.name} />
                <div className="execution-glitch" />
            </motion.div>

            <div className="execution-name-jp">{NAME_MAP[selectedPlayer.name] || selectedPlayer.name}</div>
            <div className="execution-name-en">{selectedPlayer.name.toUpperCase()}</div>

            {gnosiaStillOnboard ? (
                <>
                    <div className="status-indicator">
                        <motion.div initial={{ width: 0 }} animate={{ width: '100%' }} transition={{ delay: 1, duration: 2 }} className="status-bar" />
                    </div>
                    <div className="status-label">⚠ GNOSIA THREAT DETECTED ONBOARD ⚠</div>
                </>
            ) : (
                <div style={{ color: '#00fff5', fontSize: 10, letterSpacing: 4 }}>NO GNOSIA SIGNATURES DETECTED</div>
            )}
        </motion.div>
      </div>
    );
  }

  return (
    <div className="voting-results-overlay">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Noto+Sans+JP:wght@700;900&display=swap');

        .voting-results-overlay {
          position: fixed;
          inset: 0;
          background: radial-gradient(circle at center, rgba(0, 15, 50, 0.98), rgba(0, 5, 20, 0.99));
          z-index: 5000;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 30px;
          overflow-y: auto;
          font-family: 'Orbitron', sans-serif;
        }

        .voting-results-overlay::before {
          content: '';
          position: absolute;
          inset: 0;
          background-image: radial-gradient(circle, rgba(0,255,245,0.03) 1px, transparent 1px);
          background-size: 40px 40px;
          pointer-events: none;
        }

        .results-header {
          margin-bottom: 30px;
          text-align: center;
          border-bottom: 2px solid rgba(0, 255, 245, 0.3);
          width: 80%;
          padding-bottom: 10px;
          color: #00fff5;
          letter-spacing: 15px;
          font-weight: 900;
          font-size: 24px;
          text-shadow: 0 0 15px #00fff5;
        }

        .results-grid-container {
          display: grid;
          grid-template-columns: repeat(3, 340px);
          gap: 15px 30px;
          justify-content: center;
          width: 100%;
          padding: 20px;
        }

        .vote-card {
          position: relative;
          height: 80px;
          background: rgba(0, 15, 30, 0.85);
          border: 1px solid rgba(0, 255, 245, 0.3);
          display: flex;
          align-items: center;
          overflow: hidden;
          clip-path: polygon(5% 0%, 95% 0%, 100% 25%, 100% 75%, 95% 100%, 5% 100%, 0% 75%, 0% 25%);
          box-shadow: 0 0 10px rgba(0,0,0,0.5);
        }

        .vote-card.voted-most {
          border-color: #ff0040;
          box-shadow: 0 0 15px rgba(255, 0, 64, 0.3);
          background: rgba(30, 0, 10, 0.85);
        }

        .vote-card-sidebar {
          width: 25px;
          height: 100%;
          background: rgba(0, 255, 245, 0.1);
          border-right: 1px solid rgba(0, 255, 245, 0.2);
          display: flex;
          align-items: center;
          justify-content: center;
          writing-mode: vertical-lr;
          font-size: 7px;
          letter-spacing: 4px;
          color: rgba(0, 255, 245, 0.6);
        }

        .vote-card-portrait {
          width: 80px;
          height: 100%;
          background: #000;
          overflow: hidden;
        }

        .vote-card-portrait img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: top;
          filter: saturate(0.8) brightness(0.9);
        }

        .vote-card-info {
          flex: 1;
          padding: 5px 15px;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .vote-card-jp {
          font-family: 'Noto Sans JP', sans-serif;
          font-size: 20px;
          font-weight: 900;
          color: #fff;
          line-height: 1;
        }

        .vote-card-en {
          font-size: 8px;
          letter-spacing: 2px;
          color: rgba(255, 255, 255, 0.4);
          margin-top: 4px;
        }

        .vote-badge {
          width: 60px;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
          background: linear-gradient(90deg, rgba(0, 255, 245, 0.1), rgba(0, 255, 245, 0.2));
          border-left: 1px solid rgba(0, 255, 245, 0.4);
        }

        .vote-card.voted-most .vote-badge {
          background: linear-gradient(90deg, rgba(255, 0, 64, 0.1), rgba(255, 0, 64, 0.3));
          border-left-color: #ff0040;
        }

        .vote-badge-polygon {
          width: 45px;
          height: 55px;
          background: rgba(0, 0, 0, 0.6);
          border: 1px solid #00fff5;
          clip-path: polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          font-weight: 900;
          color: #fff;
          box-shadow: inset 0 0 10px rgba(0, 255, 245, 0.5);
        }

        .vote-card.voted-most .vote-badge-polygon {
          border-color: #ff0040;
          color: #ff0040;
          text-shadow: 0 0 10px #ff0040;
        }
      `}</style>

      <motion.div 
        initial={{ opacity: 0, y: -20 }} 
        animate={{ opacity: 1, y: 0 }} 
        className="results-header"
      >
        VOTING TALLY REVEAL
      </motion.div>

      <div className="results-grid-container">
        {players.map((p, idx) => {
          const voteCount = tallies[p.id] || 0;
          const isHighest = voteCount === Math.max(...Object.values(tallies)) && voteCount > 0;

          return (
            <motion.div
              key={p.id}
              className={`vote-card ${isHighest ? 'voted-most' : ''}`}
              initial={{ opacity: 0, scale: 0.9, x: idx % 3 === 0 ? -20 : (idx % 3 === 2 ? 20 : 0) }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              transition={{ delay: idx * 0.05, type: 'spring', stiffness: 100 }}
            >
              <div className="vote-card-sidebar">SUSPECT</div>
              
              <div className="vote-card-portrait">
                <img src={p.avatar} alt={p.name} />
              </div>

              <div className="vote-card-info">
                <div className="vote-card-jp">{NAME_MAP[p.name] || p.name}</div>
                <div className="vote-card-en">{p.name.toUpperCase()}</div>
              </div>

              <div className="vote-badge">
                <div className="vote-badge-polygon">
                  {voteCount}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <motion.div 
        initial={{ opacity: 0 }} 
        animate={{ opacity: 1 }} 
        transition={{ delay: 3 }}
        style={{ marginTop: 40, color: 'rgba(0, 255, 245, 0.3)', fontSize: 10, letterSpacing: 5 }}
      >
        ANALYSIS COMPLETE // PROTOCOL PROCEEDING
      </motion.div>
    </div>
  );
}
