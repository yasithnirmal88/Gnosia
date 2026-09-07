import { useState, useEffect, useRef } from "react";
import './CreateRoom.css';

export default function CreateRoom({ onSave, onBack }) {
  const [participants, setParticipants] = useState(5);
  const [roomCode] = useState(() => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return Array.from({length:6}, () => chars[Math.floor(Math.random()*chars.length)]).join("");
  });
  const [pin, setPin] = useState(() => String(Math.floor(1000 + Math.random() * 9000)));
  const [saved, setSaved] = useState(false);
  const saveTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, []);

  const handleSave = () => {
    setSaved(true);
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      onSave && onSave({ roomCode, participants, pin });
    }, 800);
  };

  return (
    <div style={{
      minHeight: "100vh", background: "transparent", display: "flex",
      flexDirection: "column", alignItems: "center", justifyContent: "center",
      fontFamily: "'Share Tech Mono', monospace", position: "relative", overflow: "hidden",
    }}>

      <div className="scan-lines" />

      <div style={{ position: "absolute", top: 20, left: 20, fontSize: 9, color: "rgba(255,0,64,0.3)", letterSpacing: 2 }}>
        GNOSIA // SHIP CONFIGURATION
      </div>
      <div style={{ position: "absolute", top: 20, right: 20, fontSize: 9, color: "rgba(0,255,245,0.3)", letterSpacing: 2 }}>
        LEVI AI: STANDBY
      </div>

      <div className="room-panel">
        <div className="corner c-tl" />
        <div className="corner c-tr" />
        <div className="corner c-bl" />
        <div className="corner c-br" />
        <div className="sweep" />

        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: 8, color: "rgba(255,0,64,0.4)", letterSpacing: 3, marginBottom: 6 }}>// PRIVATE VESSEL</div>
          <h2 style={{ fontFamily: "Orbitron, monospace", fontSize: 22, fontWeight: 900, color: "#fff", letterSpacing: 6, display: "flex", alignItems: "center", gap: 12 }}>
            CREATE A ROOM
            <span style={{ flex: 1, height: 1, background: "linear-gradient(90deg, rgba(255,0,64,0.5), transparent)" }} />
          </h2>
        </div>

        <div style={{ height: 1, background: "rgba(255,0,64,0.1)", marginBottom: 36 }} />

        {/* Room Number */}
        <div style={{ marginBottom: 32 }}>
          <div className="field-label">ROOM NUMBER</div>
          <div className="room-code-display">
            <div className="code-segment">
              {roomCode.slice(0,3).split("").map((c,i) => (
                <div key={i} className="code-char">{c}</div>
              ))}
            </div>
            <div className="code-sep">—</div>
            <div className="code-segment">
              {roomCode.slice(3,6).split("").map((c,i) => (
                <div key={i} className="code-char">{c}</div>
              ))}
            </div>
            <div style={{ marginLeft: 12, fontSize: 8, color: "rgba(0,255,245,0.3)", letterSpacing: 1 }}>
              AUTO<br/>GENERATED
            </div>
          </div>
        </div>

        {/* Number of Participants */}
        <div style={{ marginBottom: 32 }}>
          <div className="field-label">NUMBER OF PARTICIPANTS</div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 24 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 10 }}>
                <input type="range" min={5} max={15} value={participants}
                  onChange={e => setParticipants(Number(e.target.value))} />
                <div>
                  <div className="count-display">{participants}</div>
                  <div className="max-label">MAX 15</div>
                </div>
              </div>
              <div className="participant-dots">
                {Array.from({length: 15}, (_, i) => (
                  <div key={i} className={`p-dot ${i < participants ? "active" : "inactive"}`} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Game PIN */}
        <div style={{ marginBottom: 32 }}>
          <div className="field-label">GAME PIN (4-6 DIGITS)</div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <input
              type="text"
              inputMode="numeric"
              value={pin}
              onChange={e => setPin(e.target.value.replace(/[^0-9]/g, '').slice(0, 6))}
              className="pin-input"
              maxLength={6}
            />
            <div style={{ fontSize: 8, color: "rgba(0,255,245,0.3)", letterSpacing: 1 }}>
              SHARE WITH<br/>CREW TO JOIN
            </div>
          </div>
        </div>

        {/* Buttons */}
        <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
          <button className="btn-back" onClick={onBack}>BACK</button>
          <button className={`btn-save ${saved ? "saving" : ""}`} onClick={handleSave}>
            {saved ? "LAUNCHING..." : "SAVE"}
          </button>
        </div>

        <div style={{ marginTop: 24, height: 1, background: "rgba(255,255,255,0.04)" }} />
        <div style={{ marginTop: 10, fontSize: 8, color: "rgba(255,255,255,0.1)", letterSpacing: 1 }}>
          ROLE MATRIX AUTO-ASSIGNED BASED ON CREW SIZE // LEVI AI MONITORING ACTIVE
        </div>
      </div>
    </div>
  );
}
