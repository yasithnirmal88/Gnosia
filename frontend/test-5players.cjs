const { Client } = require('@stomp/stompjs');
const SockJS = require('sockjs-client');
const crypto = require('crypto');

global.XMLHttpRequest = require('xhr2');

const BACKEND_URL = 'http://localhost:8080/game-ws';
const ROOM_CODE = 'TEST12';
const PLAYER_NAMES = ['Setsu', 'Jina', 'SQ', 'Raqio', 'Stella'];

const players = {};
const playerIds = {};
const roles = {};
const alivePlayers = {};
const results = { connected: 0, errors: [], votes: 0, kills: 0, scans: 0, protects: 0 };
let phaseChanges = [];
let actionsDone = new Set();
let cryosleptPlayers = [];

function initAlive() { PLAYER_NAMES.forEach(n => alivePlayers[n] = true); }
initAlive();

function reportAction(name, action, detail) {
  results[action] = (results[action] || 0) + 1;
  console.log(`  [${name} to ${action}] ${detail}`);
}

function voteOnBehalfOf(name, voterId, targetId) {
  players[name].client.publish({
    destination: `/app/room/${ROOM_CODE}/vote`,
    body: JSON.stringify({ voterId, targetId }),
  });
}

function createPlayer(index) {
    const name = PLAYER_NAMES[index];
    const id = 'test-player-' + index + '-' + crypto.randomUUID().slice(0, 8);
    playerIds[name] = id;
    console.log(`[${name}] Creating player with ID: ${id}`);

    const client = new Client({
        webSocketFactory: () => new SockJS(BACKEND_URL),
        debug: () => {},
        reconnectDelay: 2000,
        heartbeatIncoming: 4000,
        heartbeatOutgoing: 4000,
    });

    client.onConnect = () => {
        results.connected++;
        console.log(`[${name}] Connected (${results.connected}/5)`);

        // Subscribe to private messages
        client.subscribe(`/topic/user/${id}/private`, (response) => {
            const info = JSON.parse(response.body);
            if (info.type === 'PRIVATE_INFO' && info.role && !roles[name]) {
                roles[name] = info.role;
                console.log(`[${name}] Role: ${info.role}`);
            }
            if (info.type === 'ROOM_CREATED') {
                setTimeout(() => {
                    for (let i = 0; i < 5; i++) {
                        if (i === index) continue;
                        const pId = playerIds[PLAYER_NAMES[i]];
                        if (pId) client.publish({
                            destination: `/app/room/${info.roomCode}/join`,
                            body: JSON.stringify({ id: pId, pin: '' }),
                        });
                    }
                }, 500);
            }
            if (info.type === 'JOIN_ERROR')
                results.errors.push(`[${name}] JOIN_ERROR: ${info.message}`);
        });

        // Subscribe to room state
        client.subscribe(`/topic/room/${ROOM_CODE}`, (response) => {
            const state = JSON.parse(response.body);
            const phase = state.gameState?.phase;
            const prevPhase = phaseChanges[phaseChanges.length - 1];

            if (phase && phase !== prevPhase) {
                phaseChanges.push(phase);
                console.log(`\nPHASE: ${phase}`);
                if (phase === 'RESULT') {
                    const target = state.gameState?.lastCryosleptPlayerId;
                    if (target) {
                        const who = state.players?.find(p => p.id === target);
                        cryosleptPlayers.push(who?.name || target);
                        console.log(`  > Cryoslept: ${who?.name || target}`);
                        const nameIdx = Object.values(playerIds).indexOf(target);
                        const testName = Object.keys(playerIds)[nameIdx];
                        if (testName) alivePlayers[testName] = false;
                    }
                }
                if (phase === 'GAME_OVER') {
                    console.log(`  > Winner: ${state.gameState?.winner || 'unknown'}`);
                }
            }

            const aliveP = (state.players || []).filter(p => p.alive);
            const aliveIds = new Set(aliveP.map(p => p.id));

            // Submit votes once during VOTING
            if (phase === 'VOTING' && !actionsDone.has('VOTING')) {
                actionsDone.add('VOTING');
                // Have each test player (who is alive) vote for a different random alive target
                for (const testName of PLAYER_NAMES) {
                    const voterId = playerIds[testName];
                    if (!aliveIds.has(voterId)) continue;
                    const targets = aliveP.filter(p => p.id !== voterId);
                    if (targets.length === 0) continue;
                    const target = targets[Math.floor(Math.random() * targets.length)];
                    // Submit from the voter's own connection
                    const owner = players[testName];
                    if (owner && owner.client) {
                        owner.client.publish({
                            destination: `/app/room/${ROOM_CODE}/vote`,
                            body: JSON.stringify({ voterId, targetId: target.id }),
                        });
                        reportAction(testName, 'votes', `target → ${target.name || target.id.slice(0,12)}`);
                    }
                }
            }

            // Submit role actions once during WARP
            if (phase === 'WARP' && !actionsDone.has('WARP')) {
                actionsDone.add('WARP');
                const aliveTestPlayers = PLAYER_NAMES.filter(n => alivePlayers[n] && roles[n]);

                // Gnosia kill
                const gnosia = aliveTestPlayers.find(n => roles[n] === 'GNOSIA');
                if (gnosia) {
                    const humans = aliveTestPlayers.filter(n => roles[n] !== 'GNOSIA');
                    if (humans.length > 0) {
                        const target = humans[Math.floor(Math.random() * humans.length)];
                        players[gnosia].client.publish({
                            destination: `/app/room/${ROOM_CODE}/kill`,
                            body: JSON.stringify({ voterId: playerIds[gnosia], targetId: playerIds[target] }),
                        });
                        reportAction(gnosia, 'kills', target);
                    }
                } else console.log('  [SKIP] No alive Gnosia');

                // Engineer scan
                const eng = aliveTestPlayers.find(n => roles[n] === 'ENGINEER');
                if (eng) {
                    const targets = aliveTestPlayers.filter(n => n !== eng && alivePlayers[n]);
                    if (targets.length > 0) {
                        const target = targets[Math.floor(Math.random() * targets.length)];
                        players[eng].client.publish({
                            destination: `/app/room/${ROOM_CODE}/scan`,
                            body: JSON.stringify({ scannerId: playerIds[eng], targetId: playerIds[target] }),
                        });
                        reportAction(eng, 'scans', target);
                    }
                } else console.log('  [SKIP] No alive Engineer');

                // Guardian Angel protect
                const ga = aliveTestPlayers.find(n => roles[n] === 'GUARDIAN_ANGEL');
                if (ga) {
                    const targets = aliveTestPlayers.filter(n => n !== ga);
                    if (targets.length > 0) {
                        const target = targets[Math.floor(Math.random() * targets.length)];
                        players[ga].client.publish({
                            destination: `/app/room/${ROOM_CODE}/protect`,
                            body: JSON.stringify({ gaId: playerIds[ga], targetId: playerIds[target] }),
                        });
                        reportAction(ga, 'protects', target);
                    }
                } else console.log('  [SKIP] No alive Guardian Angel');
            }

            players[name] = { client, state, id };
        });

        // Create room or wait
        if (index === 0) {
            console.log(`[${name}] Creating room ${ROOM_CODE}...`);
            setTimeout(() => {
                client.publish({
                    destination: '/app/room/create',
                    body: JSON.stringify({ playerId: id, roomCode: ROOM_CODE, participants: 5, pin: '' }),
                });
            }, 1000);
        } else {
            console.log(`[${name}] Will be joined by player 0...`);
        }
    };

    client.onStompError = (frame) => {
        results.errors.push(`[${name}] STOMP error: ${frame.headers?.message}`);
        console.log(`[${name}] STOMP error:`, frame.headers?.message);
    };

    client.onWebSocketClose = () => {
        console.log(`[${name}] Connection closed`);
    };

    client.activate();
    players[name] = { client, id };
}

// Launch all 5 players
console.log('=== Starting 5-player full-cycle test ===');
for (let i = 0; i < 5; i++) {
    createPlayer(i);
}

// Start the game
setTimeout(() => {
    const player0 = players[PLAYER_NAMES[0]];
    if (player0 && player0.client) {
        player0.client.publish({
            destination: `/app/room/${ROOM_CODE}/start`,
            body: JSON.stringify({}),
        });
        console.log('\n[TEST] Game started');
    }
}, 3000);

// Report results
setTimeout(() => {
    console.log('\n\n=== TEST RESULTS ===');
    console.log(`Connected: ${results.connected}/5`);
    console.log(`Phase sequence: ${phaseChanges.join(' → ')}`);
    console.log(`Votes cast: ${results.votes}`);
    console.log(`Kills submitted: ${results.kills}`);
    console.log(`Scans submitted: ${results.scans}`);
    console.log(`Protects submitted: ${results.protects}`);
    console.log(`Role assignments: ${JSON.stringify(roles)}`);
    console.log(`Cryoslept players: ${cryosleptPlayers.join(', ') || '(none)'}`);
    if (results.errors.length > 0) {
        console.log(`Errors (${results.errors.length}):`);
        results.errors.forEach(e => console.log(`  - ${e}`));
    } else {
        console.log('No runtime errors!');
    }

    console.log('\nDisconnecting...');
    Object.entries(players).forEach(([name, p]) => {
        if (p.client) p.client.deactivate();
    });
    process.exit(0);
}, 60000);
