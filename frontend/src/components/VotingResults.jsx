import { motion } from 'framer-motion';
import { NAME_MAP } from '../constants';
import './VotingResults.css';

export default function VotingResults({ players, currentVotes, phase, lastCryosleptPlayerId, gnosiaStillOnboard }) {
  // currentVotes: { voterId: targetId }
  const selectedPlayer = players.find(p => p.id === lastCryosleptPlayerId);
  const isExecution = phase === 'CRYOSLEEP' && selectedPlayer;

  const tallies = {};
  players.forEach(p => tallies[p.id] = 0);
  Object.values(currentVotes || {}).forEach(targetId => {
    if (Object.hasOwn(tallies, targetId)) tallies[targetId]++;
  });

  if (isExecution) {
    return (
      <div className="voting-results-overlay execution-mode">

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
