import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, CartesianGrid } from 'recharts';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, Users, Clock, Hash } from 'lucide-react';

const AnalyticsDashboard = ({ room }) => {
    if (!room) return null;

    const players = room.players;
    const history = room.votingHistory || [];

    // Data for Vote Distribution per Round
    const getRoundData = (roundIndex) => {
        const roundVotes = history[roundIndex] || {};
        const countMap = {};
        players.forEach(p => countMap[p.name] = 0);
        Object.values(roundVotes).forEach(targetId => {
            const player = players.find(p => p.id === targetId);
            if (player) countMap[player.name]++;
        });
        return Object.entries(countMap).map(([name, count]) => ({ name, count }));
    };

    // Cumulative Suspicion Heatmap
    const getSuspicionData = () => {
        const suspicion = {};
        players.forEach(p => suspicion[p.name] = 0);
        history.forEach(round => {
            Object.values(round).forEach(targetId => {
                const player = players.find(p => p.id === targetId);
                if (player) suspicion[player.name]++;
            });
        });
        return Object.entries(suspicion).map(([name, total]) => ({ name, total }));
    };

    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="analytics-grid"
        >
            {/* Header Cards */}
            <div className="stat-cards">
                <div className="stat-card glass-panel">
                    <TrendingUp size={20} color="#66fcf1" />
                    <div>
                        <p>Win Rate</p>
                        <h3>{room.analytics?.winnerRole === 'HUMAN' ? '65%' : '40%'}</h3>
                    </div>
                </div>
                <div className="stat-card glass-panel">
                    <Clock size={20} color="#66fcf1" />
                    <div>
                        <p>Avg Duration</p>
                        <h3>{room.analytics?.durationSeconds || 0}s</h3>
                    </div>
                </div>
                <div className="stat-card glass-panel">
                    <Hash size={20} color="#66fcf1" />
                    <div>
                        <p>Total Rounds</p>
                        <h3>{history.length}</h3>
                    </div>
                </div>
            </div>

            {/* Charts Section */}
            <div className="charts-container">
                <div className="chart-box glass-panel">
                    <h3>Vote Distribution (Final Round)</h3>
                    <div className="chart-wrapper">
                        <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={getRoundData(history.length - 1)}>
                                <XAxis dataKey="name" stroke="#c5c6c7" fontSize={10} />
                                <YAxis stroke="#c5c6c7" fontSize={10} />
                                <Tooltip 
                                    contentStyle={{ background: '#1f2833', border: '1px solid #66fcf1' }}
                                    itemStyle={{ color: '#66fcf1' }}
                                />
                                <Bar dataKey="count">
                                    {getRoundData(history.length - 1).map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.count > 2 ? '#ff4d4d' : '#66fcf1'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

            </div>

            {/* Voting Timeline */}
            <div className="timeline-box glass-panel">
                <h3>Voting Timeline</h3>
                <div className="timeline-scroll">
                    {history.map((round, idx) => (
                        <div key={idx} className="timeline-round">
                            <span className="round-label">Round {idx + 1}</span>
                            <div className="round-details">
                                {Object.entries(round).map(([voterId, targetId]) => (
                                    <div key={voterId} className="timeline-entry">
                                        <span className="voter">{players.find(p => p.id === voterId)?.name || 'Unknown'}</span>
                                        <span className="arrow">→</span>
                                        <span className="target">{players.find(p => p.id === targetId)?.name || 'Unknown'}</span>
                                    </div>
                                ))}
                                {players.filter(p => !Object.keys(round).includes(p.id)).map(p => (
                                    <div key={'no-vote-' + p.id} className="timeline-entry no-vote">
                                        <span className="voter" style={{color: '#888'}}>{p.name}</span>
                                        <span className="arrow" style={{color: '#888'}}>→</span>
                                        <span className="target" style={{color: '#ff4d4d'}}>DID NOT VOTE / ABSTAINED</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </motion.div>
    );
};

export default AnalyticsDashboard;
