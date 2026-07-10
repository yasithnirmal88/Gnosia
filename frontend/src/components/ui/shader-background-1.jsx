import { useRef, useEffect } from 'react'

const vertShader = `
  #ifdef GL_ES
  precision highp float;
  #endif

  attribute vec3 aPosition;
  attribute vec2 aTexCoord;

  varying vec2 vTexCoord;

  void main() {
    vTexCoord = aTexCoord;
    vec4 positionVec4 = vec4(aPosition, 1.0);
    positionVec4.xy = positionVec4.xy * 2.0 - 1.0;
    gl_Position = positionVec4;
  }
`

const fragShader = `
  #ifdef GL_ES
  precision highp float;
  #endif

  uniform vec2 iResolution;
  uniform float iTime;
  uniform vec2 iMouse;

  float tanh_approx(float x) {
    x = clamp(x, -3.0, 3.0);
    float x2 = x * x;
    return x * (27.0 + x2) / (27.0 + 9.0 * x2);
  }

  varying vec2 vTexCoord;

  void main() {
    vec2 uv = vTexCoord * 2.0 - 1.0;
    uv.x *= iResolution.x / iResolution.y;

    const int MAX_STEPS = 20;
    const int NOISE_ITER = 7;
    const float INITIAL_OFFSET = 0.1;
    const float RADIAL_SCALE = 5.0;
    const float DEPTH_ATTEN = 0.2;

    float rayDepth = 0.0;
    vec4 finalColor = vec4(0.0);
    vec3 rayDir = normalize(vec3(uv, 1.0));

    for (int step = 0; step < MAX_STEPS; step++) {
      vec3 pos = rayDepth * rayDir + INITIAL_OFFSET;
      float angle = atan(pos.y / 0.2, pos.x) * 2.0;
      float radius = length(pos.xy) - RADIAL_SCALE - rayDepth * DEPTH_ATTEN;
      float height = pos.z / 3.0;
      pos = vec3(angle, height, radius);

      for (int i = 1; i <= NOISE_ITER; i++) {
        float s = float(i);
        vec3 inp = pos.yzx * s + iTime + 0.3 * float(step);
        pos += sin(inp) / s;
      }

      vec3 pattern = 0.4 * cos(pos) - 0.4;
      float dist = length(vec4(pattern, pos.z));
      rayDepth += dist;

      float phase = pos.x + float(step) * 0.4 + rayDepth;
      vec4 cp = vec4(6.0, 1.0, 9.0, 0.0);
      finalColor += (1.0 + cos(phase + cp)) / dist;
    }

    vec4 col = finalColor * finalColor / 400.0;
    col.r = tanh_approx(col.r);
    col.g = tanh_approx(col.g);
    col.b = tanh_approx(col.b);
    col.a = 1.0;
    gl_FragColor = col;
  }
`

export default function ShaderBackground({
  width = typeof window !== 'undefined' ? window.innerWidth : 1920,
  height = typeof window !== 'undefined' ? window.innerHeight : 1080,
  speed = 1,
  mouseEnable = true,
  timeOffset = 0,
  className = '',
}) {
  const containerRef = useRef(null)
  const p5Ref = useRef(null)
  const scriptRef = useRef(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const script = document.createElement('script')
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.0/p5.min.js'
    script.async = true
    document.body.appendChild(script)
    scriptRef.current = script

    script.onload = () => {
      const sketch = (p) => {
        let theShader, shaderBg

        p.setup = () => {
          p.createCanvas(width, height).parent(containerRef.current)
          p.pixelDensity(1)
          p.noStroke()
          shaderBg = p.createGraphics(width, height, p.WEBGL)
          theShader = shaderBg.createShader(vertShader, fragShader)
        }

        p.draw = () => {
          shaderBg.shader(theShader)

          const iTime = (p.millis() / 1000) * speed + timeOffset
          const iResolution = [p.width, p.height]

          let mx = 0, my = 0
          if (mouseEnable) {
            mx = ((p.mouseX / p.width) * 2 - 1) * (p.width / p.height)
            my = (1 - p.mouseY / p.height) * 2 - 1
          }

          theShader.setUniform('iResolution', iResolution)
          theShader.setUniform('iTime', iTime)
          theShader.setUniform('iMouse', [mx, my])

          shaderBg.rect(0, 0, p.width, p.height)
          p.image(shaderBg, 0, 0)
        }

        p.windowResized = () => {
          const w = containerRef.current.clientWidth
          const h = containerRef.current.clientHeight
          p.resizeCanvas(w, h)
          shaderBg.resizeCanvas(w, h)
          theShader.setUniform('iResolution', [w, h])
        }
      }

      p5Ref.current = new window.p5(sketch)
    }

    return () => {
      if (p5Ref.current) p5Ref.current.remove()
      if (scriptRef.current) document.body.removeChild(scriptRef.current)
    }
  }, [width, height, speed, mouseEnable, timeOffset])

  return (
    <div
      ref={containerRef}
      className={className}
      role="img"
      aria-label="Dynamic generative shader background"
    />
  )
}
