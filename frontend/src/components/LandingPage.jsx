import { useEffect, useRef, useState } from "react";
import './LandingPage.css';

export default function LandingPage({ onPlay, onCreateRoom }) {
  const [glitch, setGlitch]   = useState(false);
  const [loaded, setLoaded]   = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [showNews, setShowNews] = useState(false);
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
    <div style={S.root} className="g-root">
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
      <div style={S.layout} className="g-layout">

        {/* ── LEFT PANEL ── */}
        <div style={S.leftPanel} className="g-left">

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
            <span className="g-link" onClick={() => setShowAbout(true)}>ABOUT</span>
            <span className="g-link" onClick={() => setShowHowToPlay(true)}>HOW TO PLAY</span>
            <span className="g-link" onClick={() => setShowNews(true)}>NEWS</span>
          </div>
        </div>

        {/* ── RIGHT PANEL — character art ── */}
        <div style={S.rightPanel} className="g-right">
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
              <br/>
              <p>
                <strong style={{color:"#00fff5"}}>4. WIN CONDITIONS:</strong><br/>
                <ul style={{marginLeft:"20px", marginTop:"10px", lineHeight: "1.8"}}>
                  <li><span style={{color:"#00ff78"}}>HUMANS WIN</span> when every Gnosia is eliminated (voted into Cold Sleep or killed).</li>
                  <li><span style={{color:"#ff0040"}}>GNOSIA WIN</span> when they outnumber the surviving humans after any elimination.</li>
                  <li>The loop repeats — Discussion → Voting → Warp — until one side meets its win condition.</li>
                </ul>
              </p>
              <br/>
              <p>
                <strong style={{color:"#00fff5"}}>5. ROLE QUICK REFERENCE:</strong><br/>
                <ul style={{marginLeft:"20px", marginTop:"10px", lineHeight: "1.8"}}>
                  <li><span style={{color:"#ffffff"}}>HUMAN</span> — a normal crew member. No special power, so debate and deduction are your only weapons.</li>
                  <li><span style={{color:"#4ade80"}}>ENGINEER</span> — scans one crew member during the warp to learn if they are Human or Gnosia.</li>
                  <li><span style={{color:"#f87171"}}>DOCTOR</span> — checks the most recently cold-slept player to reveal their true alignment.</li>
                  <li><span style={{color:"#c084fc"}}>GUARDIAN ANGEL</span> — shields one crew member per warp from a Gnosia kill.</li>
                  <li><span style={{color:"#ff0040"}}>GNOSIA</span> — blend in and talk your way out of suspicion. Eliminate one human every warp.</li>
                </ul>
              </p>
              <br/>
              <p>
                <strong style={{color:"#00fff5"}}>6. PRIVATE ROOMS:</strong><br/>
                Create a private room to play with friends. Share the room code and PIN, and the host can start the game once at least the minimum crew are aboard and every active member signals ready.
              </p>
            </div>
            <button className="g-btn-close" onClick={() => setShowHowToPlay(false)}>CLOSE TERMINAL</button>
          </div>
        </div>
      )}

      {/* About Modal */}
      {showAbout && (
        <div className="g-modal-overlay" onClick={() => setShowAbout(false)}>
          <div className="g-modal-content" onClick={e => e.stopPropagation()}>
            <h2 className="g-modal-title">SYSTEM LOG // ABOUT GNOSIA</h2>
            <div className="g-modal-body">
              <p>
                <strong style={{color:"#ff0040"}}>GNOSIA</strong> is a real-time multiplayer social deduction game played in the browser.
                A shapeshifting virus has boarded the vessel NOVA-7 and is indistinguishable from the human crew.
                Each cycle the crew debates, votes someone into Cold Sleep, and survives a warp — while hidden roles act in the dark.
              </p>
              <br/>
              <p>
                This web build is a fan-made adaptation of the anime-inspired social deduction experience. It runs the full
                game loop — discussion, voting, night actions, and win detection — over a live WebSocket connection with
                voice comms across peers, an AI narrator (LEVI), and per-game analytics.
              </p>
            </div>
            <button className="g-btn-close" onClick={() => setShowAbout(false)}>CLOSE TERMINAL</button>
          </div>
        </div>
      )}

      {/* News Modal */}
      {showNews && (
        <div className="g-modal-overlay" onClick={() => setShowNews(false)}>
          <div className="g-modal-content" onClick={e => e.stopPropagation()}>
            <h2 className="g-modal-title">SIGNAL LOG // NEWS</h2>
            <div className="g-modal-body">
              <p style={{color:"#00fff5", marginBottom: 8}}>V2.0 — CREW READINESS OVERHAUL</p>
              <ul style={{marginLeft:"20px", lineHeight: "1.9"}}>
                <li>Full lobby: live crew roster with ready signals, host crown, and connection status.</li>
                <li>Host-only departure — the game starts once the minimum crew are aboard and everyone is ready.</li>
                <li>Room code and PIN sharing with a copy-invite button.</li>
                <li>Leave Room support, with the host role passing to the next connected crew member.</li>
                <li>Fixed a race that could leave a freshly created room stuck syncing instead of launching.</li>
                <li>Responsive layout for smaller screens and improvements to the about/news/help terminals.</li>
              </ul>
            </div>
            <button className="g-btn-close" onClick={() => setShowNews(false)}>CLOSE TERMINAL</button>
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
