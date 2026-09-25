import * as Cesium from 'cesium';

/**
 * Sensor looks rendered as Cesium post-process stages — the same idea as
 * God's Eye View's "reskin reality" styles, rewritten compactly for this app.
 */
const COMMON = /* glsl */ `
  uniform sampler2D colorTexture;
  uniform vec2 colorTextureDimensions;
  uniform float time;
  in vec2 v_textureCoordinates;

  float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }
  float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
  vec3 blur5(vec2 uv, float r) {
    vec2 px = r / colorTextureDimensions;
    vec3 s = texture(colorTexture, uv).rgb * 0.36;
    s += texture(colorTexture, uv + vec2(px.x, 0.0)).rgb * 0.16;
    s += texture(colorTexture, uv - vec2(px.x, 0.0)).rgb * 0.16;
    s += texture(colorTexture, uv + vec2(0.0, px.y)).rgb * 0.16;
    s += texture(colorTexture, uv - vec2(0.0, px.y)).rgb * 0.16;
    return s;
  }
`;

const NVG = /* glsl */ `${COMMON}
  void main() {
    vec2 uv = v_textureCoordinates;
    vec3 src = blur5(uv, 0.8);
    float l = luma(src);
    l = pow(clamp(l * 1.9, 0.0, 1.0), 0.72);           // image-intensifier gain
    float grain = hash(uv * colorTextureDimensions + fract(time * 13.0) * 97.0);
    l += (grain - 0.5) * 0.16;                          // photon shot noise
    l *= 0.93 + 0.07 * sin(uv.y * colorTextureDimensions.y * 1.2); // raster
    l *= 0.97 + 0.03 * sin(time * 30.0);                // tube flicker
    vec2 d = uv - 0.5;
    d.x *= colorTextureDimensions.x / colorTextureDimensions.y;
    float vig = 1.0 - smoothstep(0.35, 0.78, length(d));
    vec3 phosphor = mix(vec3(0.02, 0.10, 0.03), vec3(0.62, 1.0, 0.55), l);
    out_FragColor = vec4(phosphor * vig, 1.0);
  }
`;

const THERMAL = (ironbow) => /* glsl */ `${COMMON}
  vec3 ironbowRamp(float t) {
    t = clamp(t, 0.0, 1.0);
    vec3 c0 = vec3(0.0, 0.0, 0.02);
    vec3 c1 = vec3(0.16, 0.0, 0.36);
    vec3 c2 = vec3(0.55, 0.0, 0.45);
    vec3 c3 = vec3(0.90, 0.16, 0.12);
    vec3 c4 = vec3(1.0, 0.58, 0.0);
    vec3 c5 = vec3(1.0, 0.93, 0.40);
    vec3 c6 = vec3(1.0, 1.0, 1.0);
    float s = t * 6.0;
    if (s < 1.0) return mix(c0, c1, s);
    if (s < 2.0) return mix(c1, c2, s - 1.0);
    if (s < 3.0) return mix(c2, c3, s - 2.0);
    if (s < 4.0) return mix(c3, c4, s - 3.0);
    if (s < 5.0) return mix(c4, c5, s - 4.0);
    return mix(c5, c6, s - 5.0);
  }
  void main() {
    vec2 uv = v_textureCoordinates;
    // Low-resolution microbolometer: snap to a coarse sensor grid, then blur.
    vec2 grid = colorTextureDimensions / 1.6;
    vec2 suv = (floor(uv * grid) + 0.5) / grid;
    vec3 src = mix(texture(colorTexture, suv).rgb, blur5(suv, 1.6), 0.6);
    float t = luma(src);
    // Sky reads cold, sunlit ground and lights read hot.
    t = smoothstep(0.04, 0.85, t);
    t = pow(t, 0.9);
    float grain = hash(uv * colorTextureDimensions + floor(time * 24.0));
    t += (grain - 0.5) * 0.05;
    vec3 col = ${ironbow ? 'ironbowRamp(t)' : 'vec3(t)'};
    vec2 d = uv - 0.5;
    d.x *= colorTextureDimensions.x / colorTextureDimensions.y;
    col *= 1.0 - smoothstep(0.45, 0.85, length(d)) * 0.6;
    out_FragColor = vec4(col, 1.0);
  }
`;

const CRT = /* glsl */ `${COMMON}
  vec2 barrel(vec2 uv) {
    vec2 c = uv * 2.0 - 1.0;
    c *= 1.0 + 0.045 * dot(c, c);
    return c * 0.5 + 0.5;
  }
  void main() {
    vec2 uv = barrel(v_textureCoordinates);
    if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) {
      out_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
      return;
    }
    float ab = 1.2 / colorTextureDimensions.x;
    vec3 col;
    col.r = texture(colorTexture, uv + vec2(ab, 0.0)).r;
    col.g = texture(colorTexture, uv).g;
    col.b = texture(colorTexture, uv - vec2(ab, 0.0)).b;
    float line = 0.78 + 0.22 * sin(uv.y * colorTextureDimensions.y * 1.5708);
    float mask = 0.9 + 0.1 * sin(uv.x * colorTextureDimensions.x * 2.0944);
    col *= line * mask;
    col = pow(col, vec3(0.9)) * 1.18;
    col += (hash(uv * colorTextureDimensions + time) - 0.5) * 0.035;
    col *= 0.985 + 0.015 * sin(time * 50.0);
    vec2 d = v_textureCoordinates - 0.5;
    col *= 1.0 - dot(d, d) * 1.1;
    col = mix(col, col * vec3(0.9, 1.05, 1.0), 0.5);
    out_FragColor = vec4(col, 1.0);
  }
`;

const SHADERS = {
  nvg: NVG,
  flir: THERMAL(false),
  ironbow: THERMAL(true),
  crt: CRT,
};

export const MODE_LABELS = {
  normal: 'EO / NORMAL',
  nvg: 'NVG / GEN III',
  flir: 'FLIR / WHITE-HOT',
  ironbow: 'FLIR / IRONBOW',
  crt: 'CRT / ANALOG',
};

export function createEffects(viewer) {
  const t0 = performance.now();
  const uniforms = { time: () => (performance.now() - t0) / 1000 };
  const stages = {};
  for (const [name, fragmentShader] of Object.entries(SHADERS)) {
    stages[name] = viewer.scene.postProcessStages.add(
      new Cesium.PostProcessStage({ name: `uap-${name}`, fragmentShader, uniforms }),
    );
    stages[name].enabled = false;
  }
  let current = 'normal';
  return {
    get mode() {
      return current;
    },
    set(mode) {
      if (!(mode in MODE_LABELS)) mode = 'normal';
      for (const [name, stage] of Object.entries(stages))
        stage.enabled = name === mode;
      current = mode;
      document.body.dataset.mode = mode;
      return mode;
    },
  };
}
