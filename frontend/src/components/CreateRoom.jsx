import { useState } from "react";

export default function CreateRoom({ onSave, onBack }) {
  const [participants, setParticipants] = useState(5);
  const [roomCode] = useState(() => {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    return Array.from({length:6}, () => chars[Math.floor(Math.random()*chars.length)]).join("");
  });
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => {
      onSave && onSave({ roomCode, participants });
    }, 800);
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#000", display: "flex",
      flexDirection: "column", alignItems: "center", justifyContent: "center",
      fontFamily: "'Share Tech Mono', monospace", position: "relative", overflow: "hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');
        * { box-sizing: border-box; }
        .scan-lines {
          position: fixed; inset: 0; pointer-events: none; z-index: 0;
          background: repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,255,65,0.025) 3px, rgba(0,255,65,0.025) 4px);
        }
        .room-panel {
          background: rgba(5, 8, 20, 0.95);
          border: 1px solid rgba(255,0,64,0.3);
          padding: 48px 56px;
          position: relative;
          z-index: 2;
          width: 100%;
          max-width: 620px;
          clip-path: polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 20px 100%, 0 calc(100% - 20px));
        }
        .corner { position: absolute; width: 24px; height: 24px; }
        .c-tl { top: -1px; left: -1px; border-top: 2px solid #ff0040; border-left: 2px solid #ff0040; }
        .c-tr { top: -1px; right: -1px; border-top: 2px solid #ff0040; border-right: 2px solid #ff0040; }
        .c-bl { bottom: -1px; left: -1px; border-bottom: 2px solid #ff0040; border-left: 2px solid #ff0040; }
        .c-br { bottom: -1px; right: -1px; border-bottom: 2px solid #ff0040; border-right: 2px solid #ff0040; }
        .field-label {
          font-size: 9px; letter-spacing: 3px; color: rgba(0,255,245,0.5);
          font-family: 'Orbitron', monospace; margin-bottom: 8px;
          display: flex; align-items: center; gap: 8px;
        }
        .field-label::after { content: ''; flex: 1; height: 1px; background: rgba(255,0,64,0.15); }
        .room-code-display {
          display: flex; align-items: center; gap: 10px;
        }
        .code-segment {
          display: flex; gap: 6px;
        }
        .code-char {
          width: 40px; height: 50px;
          background: rgba(255,0,64,0.05);
          border: 1px solid rgba(255,0,64,0.4);
          display: flex; align-items: center; justify-content: center;
          font-family: 'Orbitron', monospace; font-size: 22px; font-weight: 900;
          color: #ff0040; letter-spacing: 0;
          clip-path: polygon(0 0, calc(100% - 5px) 0, 100% 5px, 100% 100%, 5px 100%, 0 calc(100% - 5px));
        }
        .code-sep { color: rgba(255,255,255,0.2); font-size: 20px; align-self: center; }
        .slider-wrap { position: relative; }
        input[type=range] {
          width: 100%; appearance: none; background: transparent; cursor: pointer; height: 24px;
        }
        input[type=range]::-webkit-slider-runnable-track {
          height: 3px; background: rgba(255,0,64,0.2);
          border-radius: 0;
        }
        input[type=range]::-webkit-slider-thumb {
          appearance: none; width: 18px; height: 18px; margin-top: -7px;
          background: #ff0040; clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
        }
        .participant-dots {
          display: flex; gap: 4px; flex-wrap: wrap; margin-top: 10px;
        }
        .p-dot {
          width: 8px; height: 8px;
          clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
          transition: background 0.15s;
        }
        .p-dot.active { background: #ff0040; }
        .p-dot.inactive { background: rgba(255,0,64,0.12); border: 1px solid rgba(255,0,64,0.2); }
        .pin-input {
          background: rgba(0,255,245,0.03); border: 1px solid rgba(0,255,245,0.2);
          color: #00fff5; font-family: 'Orbitron', monospace; font-size: 18px;
          font-weight: 700; padding: 10px 16px; width: 140px; letter-spacing: 8px;
          outline: none; text-align: center;
        }
        .pin-input:focus { border-color: rgba(0,255,245,0.6); box-shadow: 0 0 12px rgba(0,255,245,0.1); }
        .pin-input::placeholder { color: rgba(0,255,245,0.15); letter-spacing: 4px; font-size: 12px; }
        .btn-save {
          background: rgba(255,0,64,0.08); border: 1px solid #ff0040; color: #ff0040;
          font-family: 'Orbitron', monospace; font-size: 11px; font-weight: 700;
          letter-spacing: 4px; padding: 14px 40px; cursor: pointer;
          clip-path: polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%);
          transition: all 0.2s;
        }
        .btn-save:hover { background: #ff0040; color: #000; box-shadow: 0 0 24px rgba(255,0,64,0.4); }
        .btn-save.saving { background: #ff0040; color: #000; }
        .btn-back {
          background: transparent; border: 1px solid rgba(255,255,255,0.1); color: rgba(255,255,255,0.3);
          font-family: 'Share Tech Mono', monospace; font-size: 10px;
          letter-spacing: 3px; padding: 14px 28px; cursor: pointer;
          transition: all 0.2s;
        }
        .btn-back:hover { border-color: rgba(255,255,255,0.3); color: rgba(255,255,255,0.6); }
        .sweep {
          position: absolute; left: 0; right: 0; height: 1px; top: 0;
          background: linear-gradient(90deg, transparent, rgba(0,255,245,0.3), transparent);
          animation: sweep 5s linear infinite;
        }
        @keyframes sweep { from { top: 0; } to { top: 100%; } }
        .count-display {
          font-family: 'Orbitron', monospace; font-size: 32px; font-weight: 900;
          color: #ff0040; min-width: 48px; text-align: right;
          text-shadow: 0 0 20px rgba(255,0,64,0.4);
        }
        .max-label { font-size: 9px; color: rgba(255,255,255,0.15); letter-spacing: 1px; margin-top: 2px; }
      `}</style>

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
                <input type="range" min={5} max={5} value={participants}
                  onChange={e => setParticipants(Number(e.target.value))} />
                <div>
                  <div className="count-display">{participants}</div>
                  <div className="max-label">MAX 5</div>
                </div>
              </div>
              <div className="participant-dots">
                {Array.from({length: 5}, (_, i) => (
                  <div key={i} className={`p-dot ${i < participants ? "active" : "inactive"}`} />
                ))}
              </div>
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
