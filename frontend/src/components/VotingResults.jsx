import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const NAME_MAP = {
    "Setsu": "セツ", "Jina": "ジナ", "SQ": "SQ", "Raqio": "ラキオ", "Stella": "ステラ",
    "Shigemichi": "シゲミチ", "Chipie": "チピエ", "Comet": "コメット", "Jonas": "ジョナス",
    "Kukurushka": "クルーシュカ", "Otome": "オトメ", "Sha-ming": "シャーミン", "Remnan": "レムナン",
    "Yuriko": "ユリコ", "Yuri": "ユーリ"
};

export default function VotingResults({ players, currentVotes }) {
  // currentVotes is an object: { voterId: targetId }
  
  // Group votes by target
  const tallies = {};
  players.forEach(p => tallies[p.id] = []);
  Object.entries(currentVotes || {}).forEach(([voterId, targetId]) => {
    if (tallies[targetId]) {
      tallies[targetId].push(players.find(p => p.id === voterId)?.name || "Unknown");
    }
  });

  return (
    <div className="voting-results-overlay">
      <style>{`
        .voting-results-overlay {
          position: fixed;
          inset: 0;
          background: rgba(0, 5, 20, 0.95);
          z-index: 3000;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 40px;
          overflow-y: auto;
          font-family: 'Share Tech Mono', monospace;
        }

        .results-title {
          font-family: 'Orbitron', sans-serif;
          font-size: 24px;
          color: #ff0040;
          letter-spacing: 12px;
          margin-bottom: 40px;
          text-shadow: 0 0 10px #ff0040;
        }

        .results-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: 20px;
          width: 100%;
          max-width: 1200px;
        }

        .result-card {
          background: #010b1f;
          border: 1px solid #1a3a5a;
          height: 320px;
          display: flex;
          flex-direction: column;
          position: relative;
          overflow: hidden;
          box-shadow: 0 5px 25px rgba(0,0,0,0.5);
        }

        .result-card.high-votes {
          border-color: #ff0040;
          box-shadow: 0 0 20px rgba(255, 0, 64, 0.2);
        }

        .suspect-label {
          background: #000;
          color: #ff0040;
          font-family: 'Orbitron', sans-serif;
          font-size: 8px;
          padding: 4px;
          text-align: center;
          letter-spacing: 3px;
          border-bottom: 1px solid rgba(255, 0, 64, 0.3);
        }

        .result-portrait {
          height: 140px;
          position: relative;
          background: #000;
        }

        .result-portrait img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          object-position: top center;
        }

        .portrait-fade {
          position: absolute;
          inset: 0;
          background: linear-gradient(to top, #010b1f 0%, transparent 100%);
        }

        .result-info {
          padding: 10px;
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        .result-jp-name {
          font-family: 'Noto Sans JP', sans-serif;
          font-size: 18px;
          font-weight: 900;
          color: #29b6f6;
        }

        .result-en-name {
          font-size: 8px;
          color: #1a3a5a;
          letter-spacing: 2px;
          margin-top: 2px;
        }

        .voters-container {
          margin-top: 15px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          width: 100%;
          align-items: center;
        }

        .voter-name-tag {
          font-family: 'Orbitron', sans-serif;
          font-size: 9px;
          color: #fff;
          background: rgba(255, 0, 64, 0.15);
          border: 1px solid #ff0040;
          padding: 3px 10px;
          width: 80%;
          text-align: center;
          animation: slamIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) both;
        }

        @keyframes slamIn {
          from { transform: scale(3) opacity(0); filter: blur(10px); }
          to { transform: scale(1) opacity(1); filter: blur(0); }
        }

        .vote-count-badge {
          position: absolute;
          top: 10px;
          right: 10px;
          background: #ff0040;
          color: #fff;
          font-family: 'Orbitron', sans-serif;
          font-size: 12px;
          font-weight: 900;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          border-radius: 2px;
          box-shadow: 0 0 10px rgba(255, 0, 64, 0.5);
        }
      `}</style>

      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="results-title"
      >
        VOTING TALLY IN PROGRESS
      </motion.div>

      <div className="results-grid">
        {players.map((p, idx) => {
          const votesForThisPlayer = tallies[p.id] || [];
          if (votesForThisPlayer.length === 0) return null;

          return (
            <motion.div 
              key={p.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: idx * 0.1 }}
              className={`result-card ${votesForThisPlayer.length > 2 ? 'high-votes' : ''}`}
            >
              <div className="suspect-label">TARGET LOG</div>
              
              <div className="result-portrait">
                <img src={p.avatar} alt={p.name} />
                <div className="portrait-fade" />
                <div className="vote-count-badge">
                  {votesForThisPlayer.length}
                </div>
              </div>

              <div className="result-info">
                <div className="result-jp-name">{NAME_MAP[p.name] || p.name}</div>
                <div className="result-en-name">{p.name.toUpperCase()}</div>

                <div className="voters-container">
                  {votesForThisPlayer.map((voterName, vIdx) => (
                    <div 
                      key={vIdx} 
                      className="voter-name-tag"
                      style={{ animationDelay: `${(idx * 0.2) + (vIdx * 0.4)}s` }}
                    >
                      {voterName.toUpperCase()}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2 }}
        style={{ marginTop: '50px', color: '#1a3a5a', fontSize: '10px', letterSpacing: '4px' }}
      >
        -- ANALYSIS COMPLETE --
      </motion.div>
    </div>
  );
}
