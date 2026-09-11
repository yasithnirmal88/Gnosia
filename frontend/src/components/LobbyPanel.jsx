import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';

const LobbyPanel = ({ room, playerId, onReady, onStart, onLeave }) => {
  const [copied, setCopied] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const myPlayer = room.players.find(p => p.id === playerId);
  const isHost = room.hostId === playerId;
  const maxPlayers = room.config?.maxPlayers ?? room.players.length;
  const minPlayers = room.config?.minPlayers ?? maxPlayers;
  const connectedCrew = room.players.filter(p => p.connected);
  const crewReady = connectedCrew.filter(p => p.ready);
  const atCapacity = room.players.length >= maxPlayers;
  const canStart = isHost && (atCapacity || (room.players.length >= minPlayers && crewReady.length === connectedCrew.length && connectedCrew.length > 0));

  const inviteText = useMemo(() => `${room.roomCode} · PIN ${room.pin ?? '—'}`, [room.roomCode, room.pin]);

  const copyInvite = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(inviteText);
      } else {
        const el = document.createElement('textarea');
        el.value = inviteText;
        el.style.position = 'fixed';
        el.style.opacity = '0';
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleLeave = () => {
    setLeaving(true);
    onLeave();
  };

  const hint = () => {
    if (!isHost) return null;
    if (atCapacity) return `Vessel full (${room.players.length}/${maxPlayers}) — departure cleared`;
    if (room.players.length < minPlayers) {
      return `Boarding… ${room.players.length}/${minPlayers} — ${minPlayers - room.players.length} more to depart`;
    }
    const missing = connectedCrew.length - crewReady.length;
    if (missing > 0) return `Waiting on ${missing} crew member${missing === 1 ? '' : 's'} to signal ready`;
    return 'Every crew member is ready — depart when ready';
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="lobby-panel glass-panel"
    >
      <header className="lobby-panel-header">
        <div>
          <h2>WAITING ROOM</h2>
          <p className="lobby-subline">VESSEL <span className="lobby-code">NOVA-{room.roomCode}</span></p>
        </div>
        <div className="lobby-count">
          <span className="lobby-count-number">{room.players.length}</span>
          <span className="lobby-count-max">/{maxPlayers} BOARDED</span>
        </div>
      </header>

      <div className="lobby-invite">
        <button type="button" className="lobby-invite-copy" onClick={copyInvite} aria-label="Copy invite">
          <span className="lobby-invite-text">{inviteText}</span>
          <span className="lobby-copy-label">{copied ? '✓ COPIED' : 'COPY INVITE'}</span>
        </button>
        {!isHost && <p className="lobby-invite-note">Share the code and PIN so crewmates can board.</p>}
      </div>

      <ul className="lobby-roster">
        {room.players.map((p) => {
          const isMe = p.id === playerId;
          const host = p.id === room.hostId;
          const ready = !!p.ready;
          return (
            <li key={p.id} className={`lobby-seat ${isMe ? 'me' : ''} ${p.connected ? '' : 'offline'}`}>
              <div className="lobby-seat-face">
                {p.avatar ? <img src={p.avatar} alt="" /> : <span className="lobby-seat-initial">{p.name.charAt(0)}</span>}
              </div>
              <div className="lobby-seat-info">
                <span className="lobby-seat-name">
                  {p.name}
                  {host && <span className="lobby-host-mark">HOST</span>}
                  {isMe && <span className="lobby-you-mark">YOU</span>}
                </span>
                <span className="lobby-seat-status">
                  {p.connected
                    ? (ready ? <span className="ready">● READY</span> : <span className="waiting">● WAITING</span>)
                    : <span className="offline">● OFFLINE</span>}
                </span>
              </div>
              {!isHost && !isMe && <span className="lobby-seat-ready-indicator">{ready ? '✓' : ''}</span>}
            </li>
          );
        })}
      </ul>

      <footer className="lobby-controls">
        {isHost ? (
          <button
            type="button"
            className="button-primary start-btn"
            disabled={!canStart}
            onClick={onStart}
          >
            COMMENCE
          </button>
        ) : (
          <button
            type="button"
            className={`button-primary ready-btn ${myPlayer?.ready ? 'armed' : ''}`}
            onClick={() => onReady(!myPlayer?.ready)}
          >
            {myPlayer?.ready ? 'SIGNALED READY — UNDO' : 'SIGNAL READY'}
          </button>
        )}
        <p className="lobby-status-line">
          {atCapacity
            ? 'Full crew on board — departure authorized'
            : `Crew ready ${crewReady.length}/${connectedCrew.length} · ${isHost ? hint() : 'waiting for the host to authorize departure'}`}
        </p>
        <button type="button" className="text-btn lobby-leave" onClick={handleLeave} disabled={leaving}>
          {leaving ? 'DEPARTING…' : '← LEAVE ROOM'}
        </button>
      </footer>
    </motion.section>
  );
};

export default LobbyPanel;