import { useEffect, useRef, useState } from "react";
import './LandingPage.css';

export default function LandingPage({ onPlay, onCreateRoom }) {
  const [glitch, setGlitch]   = useState(false);
  const [loaded, setLoaded]   = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const glitchTimerRef = useRef(null);

  // Fade-in on mount
  useEffect(() => {
    const id = setTimeout(() => setLoaded(true), 80);
    return () => clearTimeout(id);
  }, []);

  // Title glitch every 4 s
  useEffect(() => {
    const id = setInterval(() => {
      setGlitch(true);
      if (glitchTimerRef.current) clearTimeout(glitchTimerRef.current);
      glitchTimerRef.current = setTimeout(() => setGlitch(false), 160);
    }, 4000);
    return () => {
      clearInterval(id);
      if (glitchTimerRef.current) {
        clearTimeout(glitchTimerRef.current);
        glitchTimerRef.current = null;
      }
    };
  }, []);

  return (
    <div style={S.root}>
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
                <img src={`/images/${name === "SQ" ? "SQ" : name.charAt(0)+name.slice(1).toLowerCase()}.png`}
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
    minHeight: "100vh", background: "transparent",
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
