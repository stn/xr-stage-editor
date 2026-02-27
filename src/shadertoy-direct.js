/**
 * Direct Shadertoy rendering via Three.js RawShaderMaterial.
 *
 * Renders Shadertoy GLSL on a fullscreen quad using createDirectRenderer(),
 * Runs its own requestAnimationFrame loop.
 *
 * Usage:
 *   shadertoy(`
 *     void mainImage(out vec4 fragColor, in vec2 fragCoord) {
 *       vec2 uv = fragCoord / iResolution.xy;
 *       fragColor = vec4(uv, sin(iTime), 1.0);
 *     }
 *   `)
 *
 *   // With custom inputs:
 *   shadertoy(code, { inputs: { speed: 1.0, density: 400.0 } })
 */

const MAIN_IMAGE_RE = /\bvoid\s+mainImage\s*\(/;

const VERTEX_SHADER = /* glsl */ `
precision highp float;
in vec3 position;
void main() {
  gl_Position = vec4(position, 1.0);
}
`;

/**
 * Build a complete GLSL 300 es fragment shader from Shadertoy code.
 * @param {string} userCode  Shadertoy GLSL (with or without mainImage wrapper)
 * @param {Object} inputs    { name: defaultValue } for custom uniforms
 */
function buildFragmentShader(userCode, inputs) {
  // Strip precision directives, #version, SHADERDATA blocks
  let code = userCode
    .replace(/\bprecision\s+(highp|mediump|lowp)\s+\w+\s*;/g, '')
    .replace(/#version\s+\d+(\s+es)?\s*\n?/g, '')
    .replace(/\/\*\*\s*SHADERDATA[\s\S]*?\*\//g, '');

  // Wrap bare code (no mainImage) in a mainImage function
  if (!MAIN_IMAGE_RE.test(code)) {
    code = `void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n${code}\n}`;
  }

  // Build custom input uniform declarations
  const inputUniforms = Object.keys(inputs)
    .map(name => `uniform float ${name};`)
    .join('\n');

  return /* glsl */ `
precision highp float;
precision highp int;

uniform float iTime;
uniform vec3 iResolution;
uniform vec4 iMouse;
uniform int iFrame;

#define texture2D texture

${inputUniforms}

${code}

layout(location = 0) out vec4 _shadertoy_outColor;
void main() {
  mainImage(_shadertoy_outColor, gl_FragCoord.xy);
}
`;
}

/**
 * Convert Shadertoy GLSL code and render it directly via Three.js RawShaderMaterial.
 *
 * @param {string} code       Shadertoy GLSL (with or without mainImage wrapper)
 * @param {Object} [options]
 * @param {Object} [options.inputs]  { name: defaultValue } custom float uniforms
 * @returns {{ set: (name: string, value: number) => void, uniforms: Object, material: THREE.RawShaderMaterial }}
 */
window.shadertoy = function shadertoy(code, options = {}) {
  const { inputs = {} } = options;

  const fragmentShader = buildFragmentShader(code, inputs);

  // Build Three.js uniforms
  const uniforms = {
    iTime: { value: 0.0 },
    iResolution: { value: new THREE.Vector3(OFFSCREEN_SIZE, OFFSCREEN_SIZE, 1.0) },
    iMouse: { value: new THREE.Vector4(0, 0, 0, 0) },
    iFrame: { value: 0 },
  };
  for (const [name, defaultVal] of Object.entries(inputs)) {
    uniforms[name] = { value: defaultVal };
  }

  // Fullscreen quad
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.RawShaderMaterial({
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader,
    glslVersion: THREE.GLSL3,
    depthTest: false,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geometry, material);

  const scene = new THREE.Scene();
  scene.add(mesh);

  // Camera matrices are unused — vertex shader passes position directly to gl_Position
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // Use existing direct renderer infrastructure
  const renderer = createDirectRenderer();

  // GLSL error detection: onShaderError captures the error, then we throw after render
  let shaderError = null;
  renderer.debug.onShaderError = (gl, program, vs, fs) => {
    const fsLog = gl.getShaderInfoLog(fs) || '';
    const vsLog = gl.getShaderInfoLog(vs) || '';
    const log = (fsLog + ' ' + vsLog).trim();
    shaderError = new Error(log || 'Shader compilation failed');
  };

  // Initial render triggers compilation and error detection
  renderer.render(scene, camera);
  if (shaderError) throw shaderError;

  // Independent rAF loop
  const clock = new THREE.Clock();
  let frameCount = 0;
  let rafId;

  function animate() {
    rafId = requestAnimationFrame(animate);
    uniforms.iTime.value = clock.getElapsedTime();
    uniforms.iFrame.value = frameCount++;
    renderer.render(scene, camera);
  }
  animate();

  // Extend cleanup to also stop rAF and dispose our resources
  // Note: createDirectRenderer's cleanup resets window.update (a no-op since we don't use it)
  const baseCleanup = window.__presetCleanup;
  window.__presetCleanup = () => {
    cancelAnimationFrame(rafId);
    baseCleanup();
    material.dispose();
    geometry.dispose();
  };

  return {
    /** Update a custom input uniform at runtime */
    set(name, value) {
      if (uniforms[name]) uniforms[name].value = value;
    },
    uniforms,
    material,
  };
};
