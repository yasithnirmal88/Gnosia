import { useState, useEffect } from "react";

export default function LandingPage({ onPlay, onCreateRoom }) {
  const [glitch, setGlitch]   = useState(false);
  const [loaded, setLoaded]   = useState(false);
  const [scanY,  setScanY]    = useState(0);
  const [showHowToPlay, setShowHowToPlay] = useState(false);

  // Fade-in on mount
  useEffect(() => { setTimeout(() => setLoaded(true), 80); }, []);

  // Title glitch every 4 s
  useEffect(() => {
    const id = setInterval(() => {
      setGlitch(true);
      setTimeout(() => setGlitch(false), 160);
    }, 4000);
    return () => clearInterval(id);
  }, []);

  // Scan-line sweep (CSS handles it, this is just a shimmer ticker for the data readout)
  useEffect(() => {
    const id = setInterval(() => setScanY(v => (v + 1) % 100), 40);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={S.root}>
      <style>{CSS}</style>

      {/* Overlay effects */}
      <div className="g-scanlines" />
      <div className="g-noise"     />

      {/* Top status bars */}
      <div style={{ ...S.statusBar, left: 20 }}>
        VESSEL: NOVA-7 &nbsp;// STATUS: ACTIVE &nbsp;// CREW: AWAITING
      </div>
      <div style={{ ...S.statusBar, right: 20, textAlign: "right", color: "rgba(0,255,245,.35)" }}>
        LEVI AI: ONLINE &nbsp;// THREAT: <span style={{ color: "#ff0040" }}>DETECTED</span>
      </div>

      {/* Main layout */}
      <div style={S.layout}>

        {/* ── LEFT PANEL ── */}
        <div style={S.leftPanel}>

          {/* Sub-label */}
          <div className={`g-fadein ${loaded ? "g-fadein-go" : ""}`} style={{ animationDelay: ".05s" }}>
            <span style={S.subLabel}>// INTERGALACTIC SURVIVAL STATION</span>
          </div>

          {/* Title */}
          <div className={`g-fadein ${loaded ? "g-fadein-go" : ""}`} style={{ animationDelay: ".15s" }}>
            <h1
              className={`g-title ${glitch ? "g-glitch" : ""}`}
              data-text="GNOSIA"
            >
              GNOSIA
            </h1>
            <div style={S.titleRule} />
          </div>

          {/* Lore blurb */}
          <div className={`g-fadein ${loaded ? "g-fadein-go" : ""}`} style={{ animationDelay: ".3s", maxWidth: 400 }}>
            <p style={S.lore}>
              An intergalactic virus has infiltrated the crew.<br />
              Trust no one. Survive the warp.<br />
              Find the <span style={{ color: "#ff0040", fontWeight: "bold" }}>GNOSIA</span>.
            </p>
          </div>

          {/* Buttons */}
          <div className={`g-fadein ${loaded ? "g-fadein-go" : ""}`}
               style={{ animationDelay: ".45s", display: "flex", flexDirection: "column", gap: 14 }}>
            <button className="g-btn-primary" onClick={onPlay}>
              ▶&nbsp; ENTER THE SHIP
            </button>
            <button className="g-btn-secondary" onClick={onCreateRoom}>
              // CREATE PRIVATE ROOM
            </button>
          </div>

          {/* Footer links */}
          <div className={`g-fadein ${loaded ? "g-fadein-go" : ""}`}
               style={{ animationDelay: ".6s", display: "flex", gap: 28, marginTop: 8 }}>
            <span className="g-link">ABOUT</span>
            <span className="g-link" onClick={() => setShowHowToPlay(true)}>HOW TO PLAY</span>
            <span className="g-link">NEWS</span>
          </div>
        </div>

        {/* ── RIGHT PANEL — character art ── */}
        <div style={S.rightPanel}>
          <div style={S.charFrame} className="g-pulse-border">
            {/* Corner brackets */}
            <span className="g-corner g-tl" /><span className="g-corner g-tr" />
            <span className="g-corner g-bl" /><span className="g-corner g-br" />

            {/* Cyan scan sweep */}
            <div className="g-sweep" />

            {/* Character image */}
            <img
              src="/images/LandingPage.jpeg"
              alt="Gnosia character"
              style={{
                ...S.charImg,
                opacity: loaded ? 1 : 0,
                transition: "opacity 1.2s ease .4s",
              }}
            />

            {/* Info strip at bottom */}
            <div style={S.charInfo}>
              <div style={{ color: "#ff0040", fontSize: 8, letterSpacing: 2, marginBottom: 2 }}>
                SUBJECT ID: チピエ &nbsp;// THREAT LEVEL: <span style={{ color: "#ff4444" }}>CRITICAL</span>
              </div>
              <div style={{ color: "rgba(0,255,245,.5)", fontSize: 8, letterSpacing: 1 }}>
                BIOMETRICS: CALIBRATING &nbsp;|&nbsp; NEURAL NET: ACTIVE
              </div>
            </div>
          </div>

          {/* Mini crew readout */}
          <div style={S.crewReadout}>
            {[
              ["SETSU",  "#4dc3ff"],
              ["JINA",   "#c084fc"],
              ["SQ",     "#f87171"],
              ["STELLA", "#4ade80"],
            ].map(([name, col]) => (
              <div key={name} style={{ ...S.crewItem, borderColor: col + "40" }}>
                <img src={`/images/${name.charAt(0)+name.slice(1).toLowerCase()}.png`}
                     onError={e => { e.target.style.display="none"; }}
                     alt={name}
                     style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 2, filter: "brightness(.8)" }} />
                <span style={{ color: col, fontSize: 8, letterSpacing: 1 }}>{name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom watermark */}
      <div style={S.watermark}>
        GNOSIA // INTERGALACTIC SURVIVAL STATION // LEVI AI SYSTEM v2.4
      </div>

      {/* How To Play Modal */}
      {showHowToPlay && (
        <div className="g-modal-overlay" onClick={() => setShowHowToPlay(false)}>
          <div className="g-modal-content" onClick={e => e.stopPropagation()}>
            <h2 className="g-modal-title">SYSTEM INSTRUCTIONS // HOW TO PLAY</h2>
            <div className="g-modal-body">
              <p>
                <strong style={{color:"#ff0040"}}>OVERVIEW:</strong><br/>
                You are trapped on a drifting spaceship. Among your crew are the <span style={{color:"#ff0040"}}>Gnosia</span> — hostile entities who mimic humans and eliminate one occupant every time the ship enters hypersleep.
              </p>
              <br/>
              <p>
                <strong style={{color:"#00fff5"}}>1. DISCUSSION PHASE:</strong><br/>
                Debate with your crew. Pay attention to who is acting suspicious, deflecting blame, or backing up likely enemies. Use voice comms logically.
              </p>
              <br/>
              <p>
                <strong style={{color:"#00fff5"}}>2. VOTING PHASE:</strong><br/>
                All crew members must vote to place one suspected player into "Cold Sleep". The player with the highest votes is eliminated from active duty.
              </p>
              <br/>
              <p>
                <strong style={{color:"#00fff5"}}>3. NIGHT / WARP PHASE:</strong><br/>
                The ship warps. During this time:
                <ul style={{marginLeft:"20px", marginTop:"10px", lineHeight: "1.8"}}>
                  <li><span style={{color:"#ff0040"}}>Gnosia</span> communicate secretly and choose one human to kill.</li>
                  <li><span style={{color:"#4ade80"}}>Engineer</span> investigates one player to reveal if they are Human or Gnosia.</li>
                  <li><span style={{color:"#f87171"}}>Doctor</span> investigates the most recently cold-slept player's true identity.</li>
                  <li><span style={{color:"#c084fc"}}>Guardian Angel</span> secretly protects one player from a Gnosia attack.</li>
                </ul>
              </p>
            </div>
            <button className="g-btn-close" onClick={() => setShowHowToPlay(false)}>CLOSE TERMINAL</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Inline styles ──────────────────────────────────────── */
const S = {
  root: {
    minHeight: "100vh", background: "#060810",
    display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center",
    overflow: "hidden", position: "relative",
    fontFamily: "'Share Tech Mono', 'Courier New', monospace",
  },
  statusBar: {
    position: "absolute", top: 18,
    fontSize: 9, letterSpacing: 2,
    color: "rgba(255,0,64,.3)", zIndex: 5,
  },
  layout: {
    display: "flex", alignItems: "center", justifyContent: "center",
    gap: 60, position: "relative", zIndex: 2,
    maxWidth: 1100, width: "100%", padding: "0 40px",
  },
  leftPanel: {
    flex: 1, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 28,
  },
  subLabel: {
    fontSize: 10, letterSpacing: 5, color: "rgba(255,0,64,.55)",
    fontFamily: "'Orbitron', monospace",
  },
  titleRule: {
    width: "100%", height: 2, marginTop: 6,
    background: "linear-gradient(90deg, #ff0040, transparent)",
  },
  lore: {
    fontSize: 12, color: "rgba(190,210,220,.5)",
    lineHeight: 2, letterSpacing: 1,
  },
  rightPanel: {
    flex: 1, display: "flex", flexDirection: "column",
    alignItems: "flex-end", gap: 12,
  },
  charFrame: {
    position: "relative", display: "inline-block",
    border: "1px solid rgba(255,0,64,.25)",
  },
  charImg: {
    width: "clamp(260px,34vw,480px)", display: "block",
    filter: "drop-shadow(0 0 28px rgba(255,0,64,.5)) drop-shadow(0 0 60px rgba(0,255,245,.15))",
    position: "relative", zIndex: 1,
  },
  charInfo: {
    position: "absolute", bottom: 12, left: 12, right: 12, zIndex: 3,
    background: "rgba(0,0,0,.75)", border: "1px solid rgba(255,0,64,.25)",
    padding: "8px 12px", backdropFilter: "blur(6px)",
  },
  crewReadout: {
    display: "flex", gap: 8,
  },
  crewItem: {
    display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
    border: "1px solid", padding: "6px 8px", background: "rgba(0,0,0,.4)",
    minWidth: 48,
  },
  watermark: {
    position: "absolute", bottom: 14, left: "50%", transform: "translateX(-50%)",
    fontSize: 8, color: "rgba(255,255,255,.1)", letterSpacing: 3, whiteSpace: "nowrap",
  },
};

/* ─── CSS string ─────────────────────────────────────────── */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@700;900&family=Share+Tech+Mono&display=swap');

.g-scanlines {
  position:fixed; inset:0; pointer-events:none; z-index:1;
  background: repeating-linear-gradient(
    0deg, transparent, transparent 3px,
    rgba(0,255,65,.025) 3px, rgba(0,255,65,.025) 4px
  );
}
.g-noise {
  position:fixed; inset:0; pointer-events:none; z-index:1; opacity:.045;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
}

/* Fade-in */
.g-fadein { opacity:0; transform:translateY(18px); }
.g-fadein-go { animation: gFadeUp .7s ease forwards; }
@keyframes gFadeUp { to { opacity:1; transform:translateY(0); } }

/* Title */
.g-title {
  font-family:'Orbitron',monospace;
  font-size: clamp(58px,9vw,110px);
  font-weight:900; color:#fff; letter-spacing:8px; line-height:1;
  text-shadow: 0 0 40px rgba(255,255,255,.08);
  position:relative;
}
.g-glitch::before, .g-glitch::after {
  content: attr(data-text);
  position:absolute; top:0; left:0; width:100%; height:100%; overflow:hidden;
}
.g-glitch::before {
  color:#ff0040; clip-path:polygon(0 15%,100% 15%,100% 35%,0 35%);
  transform:translate(-5px,0); opacity:.85;
}
.g-glitch::after {
  color:#00fff5; clip-path:polygon(0 58%,100% 58%,100% 78%,0 78%);
  transform:translate(5px,0); opacity:.85;
}

/* Buttons */
.g-btn-primary {
  font-family:'Orbitron',monospace; font-size:13px; font-weight:900;
  letter-spacing:5px; padding:16px 56px;
  background:transparent; border:2px solid #ff0040; color:#ff0040;
  clip-path:polygon(14px 0%,100% 0%,calc(100% - 14px) 100%,0 100%);
  cursor:pointer; transition:all .2s;
}
.g-btn-primary:hover {
  background:#ff0040; color:#000;
  box-shadow:0 0 30px #ff0040, 0 0 70px rgba(255,0,64,.35);
}
.g-btn-secondary {
  font-size:11px; letter-spacing:4px; padding:12px 42px;
  background:transparent; border:1px solid rgba(0,255,245,.25); color:rgba(0,255,245,.55);
  cursor:pointer; transition:all .2s;
}
.g-btn-secondary:hover { border-color:#00fff5; color:#00fff5; background:rgba(0,255,245,.05); }

/* Footer links */
.g-link {
  font-size:9px; color:rgba(255,255,255,.2); letter-spacing:3px; cursor:pointer;
  transition:color .2s;
}
.g-link:hover { color:rgba(0,255,245,.6); }

/* Pulse border on char frame */
.g-pulse-border { animation: pBorder 2s ease-in-out infinite; }
@keyframes pBorder {
  0%,100% { box-shadow:0 0 0 1px rgba(255,0,64,.2); }
  50%      { box-shadow:0 0 0 1px rgba(255,0,64,.7), 0 0 25px rgba(255,0,64,.15); }
}

/* Corner brackets */
.g-corner { position:absolute; width:18px; height:18px; }
.g-tl { top:0;    left:0;  border-top:2px solid #ff0040; border-left:2px solid #ff0040; }
.g-tr { top:0;    right:0; border-top:2px solid #ff0040; border-right:2px solid #ff0040; }
.g-bl { bottom:0; left:0;  border-bottom:2px solid #ff0040; border-left:2px solid #ff0040; }
.g-br { bottom:0; right:0; border-bottom:2px solid #ff0040; border-right:2px solid #ff0040; }

/* Cyan scan sweep */
.g-sweep {
  position:absolute; left:0; right:0; height:2px; z-index:2;
  background:linear-gradient(90deg,transparent,rgba(0,255,245,.45),transparent);
  animation:gSweep 3s linear infinite;
}
@keyframes gSweep { 0%{top:-2px} 100%{top:100%} }

/* Modal Styles */
.g-modal-overlay {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(0, 5, 16, 0.85);
  backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
  padding: 40px;
  animation: gFadeIn 0.3s forwards;
}
@keyframes gFadeIn { from{opacity:0;} to{opacity:1;} }

.g-modal-content {
  background: rgba(0, 10, 25, 0.9);
  border: 1px solid rgba(0, 255, 245, 0.4);
  max-width: 680px; width: 100%;
  padding: 40px;
  position: relative;
  box-shadow: 0 0 50px rgba(0, 255, 245, 0.15), inset 0 0 20px rgba(0, 255, 245, 0.1);
  clip-path: polygon(20px 0, 100% 0, 100% calc(100% - 20px), calc(100% - 20px) 100%, 0 100%, 0 20px);
}

.g-modal-title {
  font-family: 'Orbitron', monospace;
  font-size: 18px; color: #00fff5; letter-spacing: 4px;
  margin-bottom: 30px; border-bottom: 1px solid rgba(0,255,245,0.2);
  padding-bottom: 15px;
}

.g-modal-body {
  font-family: 'Share Tech Mono', monospace;
  font-size: 14px;
  color: rgba(200, 220, 230, 0.8);
  line-height: 1.6; letter-spacing: 1px;
}

.g-btn-close {
  margin-top: 40px;
  width: 100%; padding: 16px;
  background: rgba(0,255,245,0.05);
  border: 1px solid rgba(0,255,245,0.3);
  color: #00fff5; font-family: 'Orbitron', monospace;
  font-size: 11px; letter-spacing: 5px; font-weight: 700;
  cursor: pointer; transition: all 0.2s;
  clip-path: polygon(10px 0, 100% 0, calc(100% - 10px) 100%, 0 100%);
}
.g-btn-close:hover {
  background: #00fff5; color: #000; box-shadow: 0 0 20px rgba(0,255,245,0.4);
}
`;
