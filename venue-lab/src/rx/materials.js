// ─────────────────────────────────────────────────────────────────────────────
// rx materials: every material the room draws with gets four things added to
// its shader, without touching how the app builds it.
//
//  1. a second colour output (the scene target is a two-attachment target):
//     the surface's view-space normal, roughness and how much it reflects, for
//     the screen-space passes (AO, reflections) to read.
//  2. the baked light (gi.js): the room's indirect light from a volume of
//     probes, weighted live by what each light is doing, in place of the
//     environment map's diffuse and the room's hemisphere fill.
//  3. last frame's ambient occlusion and reflection coverage, reprojected to
//     this frame: AO darkens only the indirect light (the GI and the
//     environment), and where the screen-space reflection found something the
//     environment map's reflection steps aside for it.
//  4. a box-projected environment: the reflection probe (probe.js) is a
//     capture of the room itself, and a reflection off the stage floor is
//     looked up where it really meets the walls.
// ─────────────────────────────────────────────────────────────────────────────

import * as THREE from 'three';

// One set of uniform objects shared by every patched material: setting a value
// here sets it everywhere.
export const RXU = {
  rxOn: { value: 1 },
  rxGIOn: { value: 0 },
  rxGI0: { value: null }, rxGI1: { value: null }, rxGI2: { value: null },
  rxGIOrigin: { value: new THREE.Vector3() },
  rxGISize: { value: new THREE.Vector3(1, 1, 1) },
  rxGIOffset: { value: 0.4 },
  rxGIGain: { value: 1 },
  rxPrev: { value: null },          // r: AO, g: view depth, b: reflection coverage
  rxPrevOn: { value: 0 },
  rxPrevVP: { value: new THREE.Matrix4() },
  rxAOStrength: { value: 1 },
  rxBoxOn: { value: 0 },
  rxBoxMin: { value: new THREE.Vector3() },
  rxBoxMax: { value: new THREE.Vector3() },
  rxProbePos: { value: new THREE.Vector3() },
  rxShadowSeed: { value: 0 },
};

// the soft shadows' sample pattern turns every frame, so the temporal
// resolve sees many more taps than one frame draws (patched once, globally:
// this runs only in the Lab's bundle)
let chunksDone = false;
export function patchChunks() {
  if (chunksDone) return;
  chunksDone = true;
  const C = THREE.ShaderChunk;
  C.shadowmap_pars_fragment = C.shadowmap_pars_fragment
    .replace('#if NUM_SPOT_LIGHT_SHADOWS > 0', 'uniform float rxShadowSeed;\n#if NUM_SPOT_LIGHT_SHADOWS > 0')
    .replaceAll('interleavedGradientNoise( gl_FragCoord.xy )', 'interleavedGradientNoise( gl_FragCoord.xy + vec2( rxShadowSeed * 5.588238, rxShadowSeed * 2.2 ) )');
  // eight taps of the Vogel disk rather than five
  C.shadowmap_pars_fragment = C.shadowmap_pars_fragment.replace(
    /shadow = \(\s*texture\( shadowMap, vec3\( shadowCoord\.xy \+ vogelDiskSample\( 0, 5, phi \) \* radius, shadowCoord\.z \) \) \+[\s\S]*?\) \* 0\.2;/,
    `shadow = 0.0;
				for ( int i = 0; i < 8; i ++ ) shadow += texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( i, 8, phi ) * radius, shadowCoord.z ) );
				shadow *= 0.125;`);
}

const OCT = /* glsl */`
  vec2 rxOctWrap(vec2 v) { return (1.0 - abs(v.yx)) * vec2(v.x >= 0.0 ? 1.0 : -1.0, v.y >= 0.0 ? 1.0 : -1.0); }
  vec2 rxOctEncode(vec3 n) { n /= (abs(n.x) + abs(n.y) + abs(n.z)); n.xy = n.z >= 0.0 ? n.xy : rxOctWrap(n.xy); return n.xy; }
`;
export const OCT_DECODE = /* glsl */`
  vec3 rxOctDecode(vec2 f) { vec3 n = vec3(f.x, f.y, 1.0 - abs(f.x) - abs(f.y)); float t = clamp(-n.z, 0.0, 1.0); n.x += n.x >= 0.0 ? -t : t; n.y += n.y >= 0.0 ? -t : t; return normalize(n); }
`;

const FRAG_HEAD = (lit) => /* glsl */`
layout(location = 1) out highp vec4 rxG;
${OCT}
${lit ? /* glsl */`
varying vec3 vRxW;
uniform float rxOn, rxGIOn, rxGIOffset, rxGIGain, rxPrevOn, rxAOStrength, rxBoxOn;
uniform highp sampler3D rxGI0, rxGI1, rxGI2;
uniform vec3 rxGIOrigin, rxGISize, rxBoxMin, rxBoxMax, rxProbePos;
uniform sampler2D rxPrev;
uniform mat4 rxPrevVP;
// the baked irradiance at a point, for a surface facing n (world space):
// first-order spherical harmonics, already convolved with the cosine
vec3 rxGI(vec3 p, vec3 n) {
  vec3 uvw = (p + n * rxGIOffset - rxGIOrigin) / rxGISize;
  if (any(lessThan(uvw, vec3(0.0))) || any(greaterThan(uvw, vec3(1.0)))) return vec3(0.0);
  vec4 r = texture(rxGI0, uvw), g = texture(rxGI1, uvw), b = texture(rxGI2, uvw);
  return max(vec3(r.x + dot(r.yzw, n), g.x + dot(g.yzw, n), b.x + dot(b.yzw, n)), 0.0) * rxGIGain;
}
// last frame's AO and reflection coverage at this point, if it was seen there
vec2 rxPrevAt(vec3 p) {
  if (rxPrevOn < 0.5) return vec2(1.0, 0.0);
  vec4 c = rxPrevVP * vec4(p, 1.0);
  if (c.w <= 0.0) return vec2(1.0, 0.0);
  vec2 uv = c.xy / c.w * 0.5 + 0.5;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return vec2(1.0, 0.0);
  vec4 s = texture(rxPrev, uv);
  // occluded last frame by something else (or newly in view): not this point's
  if (abs(s.g - c.w) > 0.04 * c.w + 0.05) return vec2(1.0, 0.0);
  return vec2(mix(1.0, s.r, rxAOStrength), s.b);
}
vec3 rxBoxProject(vec3 dir) {
  if (rxBoxOn < 0.5) return dir;
  vec3 p = vRxW;
  if (any(lessThan(p, rxBoxMin)) || any(greaterThan(p, rxBoxMax))) return dir;
  vec3 t1 = (rxBoxMax - p) / dir, t2 = (rxBoxMin - p) / dir;
  vec3 tm = max(t1, t2);
  float t = min(min(tm.x, tm.y), tm.z);
  return normalize(p + dir * t - rxProbePos);
}
` : ''}
`;

const VERT_HEAD = 'varying vec3 vRxW;\n';
const VERT_BODY = /* glsl */`
  {
    vec4 rxP = vec4( transformed, 1.0 );
    #ifdef USE_BATCHING
      rxP = batchingMatrix * rxP;
    #endif
    #ifdef USE_INSTANCING
      rxP = instanceMatrix * rxP;
    #endif
    vRxW = ( modelMatrix * rxP ).xyz;
  }
`;

const MAIN = /void\s+main\s*\(\s*(void)?\s*\)\s*\{/;

// What the second output gets where nothing better is known: blended draws
// leave it as it is (their blend makes a zero write a no-op, a multiply's a
// one), opaque ones mark it "normal unknown, rough".
function defaultWrite(m) {
  const blended = m.transparent || m.blending !== THREE.NormalBlending;
  if (!blended) return 'rxG = vec4(0.0, 0.0, 1.0, -1.0);';
  const mul = m.blending === THREE.MultiplyBlending || (m.blending === THREE.CustomBlending && m.blendSrc === THREE.ZeroFactor && m.blendDst === THREE.SrcColorFactor);
  return mul ? 'rxG = vec4(1.0);' : 'rxG = vec4(0.0);';
}

function kindOf(m) {
  if (m.isMeshStandardMaterial) return 'std';
  if (m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshToonMaterial) return 'lit';
  if (m.isRawShaderMaterial || m.glslVersion === THREE.GLSL3) return null;
  if (m.isShaderMaterial) return 'shader';
  if (m.isMeshBasicMaterial || m.isMeshMatcapMaterial || m.isMeshNormalMaterial || m.isLineBasicMaterial || m.isPointsMaterial || m.isSpriteMaterial || m.isMeshDepthMaterial || m.isMeshDistanceMaterial || m.isShadowMaterial || m.isLineDashedMaterial) return 'basic';
  return null;
}

function inject(s, kind, m) {
  const lit = kind === 'std' || kind === 'lit';
  const blended = m.transparent || m.blending !== THREE.NormalBlending;
  let f = s.fragmentShader;
  if (!MAIN.test(f)) return;
  f = FRAG_HEAD(lit) + f;
  f = f.replace(MAIN, (x) => `${x}\n  ${defaultWrite(m)}\n`);
  if (lit) {
    // the GI in place of the environment's (and the hemisphere's) fill
    f = f.replace('#include <lights_fragment_maps>', /* glsl */`#include <lights_fragment_maps>
      #if defined( RE_IndirectDiffuse )
        if ( rxOn > 0.5 && rxGIOn > 0.5 ) {
          vec3 rxWN = normalize( ( vec4( geometryNormal, 0.0 ) * viewMatrix ).xyz );
          iblIrradiance = rxGI( vRxW, rxWN );
        }
      #endif`);
    f = f.replace('#include <aomap_fragment>', /* glsl */`#include <aomap_fragment>
      if ( rxOn > 0.5 ) {
        vec2 rxPA = rxPrevAt( vRxW );
        reflectedLight.indirectDiffuse *= rxPA.x;
        #if defined( STANDARD )
          float rxNV = saturate( dot( geometryNormal, geometryViewDir ) );
          float rxSO = saturate( pow( rxNV + rxPA.x, exp2( - 16.0 * material.roughness - 1.0 ) ) - 1.0 + rxPA.x );
          // where the screen-space reflection has it, the environment steps aside
          reflectedLight.indirectSpecular *= rxSO * ( 1.0 - rxPA.y );
        #endif
      }`);
    if (!blended) {
      const rough = kind === 'std' ? 'material.roughness' : '1.0';
      const spec = kind === 'std'
        ? /* glsl */`
          #ifdef USE_ENVMAP
            float rxEnvI = envMapIntensity;
          #else
            float rxEnvI = 0.0;
          #endif
          float rxSpec = dot( material.specularColor, vec3( 0.2126, 0.7152, 0.0722 ) ) * rxEnvI;`
        : 'float rxSpec = 0.0;';
      f = f.replace('#include <dithering_fragment>', `#include <dithering_fragment>
        {
          ${spec}
          rxG = vec4( rxOctEncode( normalize( normal ) ), ${rough}, rxSpec );
        }`);
    }
    s.vertexShader = VERT_HEAD + s.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>\n${VERT_BODY}`);
    if (kind === 'std') {
      s.fragmentShader = f;
      // the box projection, in the environment lookup
      s.fragmentShader = s.fragmentShader.replace('#include <envmap_physical_pars_fragment>',
        THREE.ShaderChunk.envmap_physical_pars_fragment.replace(
          'reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );',
          'reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );\n\t\t\treflectVec = rxBoxProject( reflectVec );'));
      f = s.fragmentShader;
    }
    for (const k of Object.keys(RXU)) s.uniforms[k] = RXU[k];
  } else {
    s.uniforms.rxShadowSeed = RXU.rxShadowSeed;
  }
  s.fragmentShader = f;
}

const patched = new WeakSet();
const baseKey = THREE.Material.prototype.customProgramCacheKey;

export function patchMaterial(m) {
  if (patched.has(m)) return;
  patched.add(m);
  const kind = kindOf(m);
  if (!kind) return;
  const prev = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey;
  const hadOwn = prev && prev !== THREE.Material.prototype.onBeforeCompile;
  // the app's own key, worked out from its own hook (the default key is the
  // hook's source, which the wrapper below would replace)
  const key0 = prevKey !== baseKey ? null : (hadOwn ? prev.toString() : '');
  const blendKey = `${m.transparent ? 1 : 0}${m.blending}${m.blendSrc}${m.blendDst}`;
  m.onBeforeCompile = function rxCompile(s, r) {
    if (hadOwn) prev.call(this, s, r);
    inject(s, kind, this);
  };
  m.customProgramCacheKey = function rxKey() {
    return `${key0 ?? prevKey.call(this)}|rx:${kind}:${blendKey}`;
  };
  m.needsUpdate = true;
}

export function patchTree(root) {
  root.traverse((o) => {
    const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of ms) if (!patched.has(m)) patchMaterial(m);
  });
}
