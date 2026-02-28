import * as THREE from 'three';

export const OFFSCREEN_SIZE = 1024;

export const CAMERA_FOV = 70;
export const CAMERA_POS = new THREE.Vector3(3, 1.6, 4.6);
export const PROJECTOR_FOV = 70;
export const PROJECTOR_TARGET = new THREE.Vector3(0, 1.0, 0);

// LED Wall display dimensions (matches Display panel layout)
export const DISPLAY_SCALE = 2;
export const DISPLAY_WIDTH = Math.floor(1536 / DISPLAY_SCALE);
export const DISPLAY_HEIGHT = Math.floor(1024 / DISPLAY_SCALE);

export const vertexShader = /* glsl */ `
  uniform mat4 projectorMatrix;
  varying vec3 vNormal;
  varying vec4 vProjCoord;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vProjCoord = projectorMatrix * worldPosition;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

export const fragmentShader = /* glsl */ `
  precision highp float;
  uniform sampler2D projectionTexture;
  uniform vec3 baseColor;
  uniform float intensity;
  varying vec3 vNormal;
  varying vec4 vProjCoord;

  void main() {
    vec3 lightDir = normalize(vec3(0.3, 1.0, 0.6));
    float light = max(dot(normalize(vNormal), lightDir), 0.0);
    vec3 color = baseColor * (0.35 + light * 0.65);

    float safeW = max(vProjCoord.w, 0.00001);
    vec3 projCoord = vProjCoord.xyz / safeW;
    float visible = step(0.0, projCoord.x) * step(projCoord.x, 1.0) *
                    step(0.0, projCoord.y) * step(projCoord.y, 1.0) *
                    step(0.0, vProjCoord.w);

    vec3 projected = texture2D(projectionTexture, projCoord.xy).rgb;
    color = mix(color, projected, visible * intensity);

    gl_FragColor = vec4(color, 1.0);
  }
`;

// Displayの平面配置
const PLANE_CONFIGS = [
  { rotation: [0, Math.PI / 2, 0], position: [0, 1, 1.5], width: 3, height: 2 },
  { rotation: [0, 0, 0],           position: [1.5, 1, 0], width: 3, height: 2 },
  { rotation: [-Math.PI / 2, 0, Math.PI / 2], position: [1.5, 0, 1.5], width: 3, height: 3 },
];

const biasMatrix = new THREE.Matrix4().set(
  0.5, 0.0, 0.0, 0.5,
  0.0, 0.5, 0.0, 0.5,
  0.0, 0.0, 0.5, 0.5,
  0.0, 0.0, 0.0, 1.0,
);

// モジュールレベルの一時変数で GC 圧力を回避
// 注意: 返り値は共有一時変数のため、呼び出し側は .copy() で取り出すこと
const _tempPM = new THREE.Matrix4();
const _tempResult = new THREE.Matrix4();

function computeProjectorMatrix(projectorCamera) {
  projectorCamera.updateMatrixWorld();
  projectorCamera.updateProjectionMatrix();
  _tempPM.copy(projectorCamera.projectionMatrix)
    .multiply(projectorCamera.matrixWorldInverse);
  return _tempResult.copy(biasMatrix).multiply(_tempPM);
}

/**
 * Three.js のインストレーションシーンを構築して返す。
 * 各ウィンドウの realm でそれぞれ呼び出すことで、typed array の
 * クロスレルム問題（instanceof 失敗）を回避する。
 * @param {THREE.Texture} projectionTexture
 * @returns {{ scene: THREE.Scene, projectorHelper: THREE.CameraHelper, updateProjectorParams: Function }}
 */
export function buildInstallationScene(projectionTexture) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a2a32);
  scene.fog = new THREE.Fog(0x2a2a32, 8, 16);

  const ambient = new THREE.AmbientLight(0xffffff, 0.25);
  scene.add(ambient);
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
  dirLight.position.set(4, 6, 3);
  scene.add(dirLight);

  const projectorCamera = new THREE.PerspectiveCamera(PROJECTOR_FOV, 1, 0.1, 15);
  projectorCamera.position.copy(CAMERA_POS);
  projectorCamera.lookAt(PROJECTOR_TARGET);

  const projectorHelper = new THREE.CameraHelper(projectorCamera);
  projectorHelper.material.depthTest = false;
  projectorHelper.material.transparent = true;
  projectorHelper.material.opacity = 0.35;
  scene.add(projectorHelper);

  // 初期プロジェクタ行列
  const projectorMatrix = computeProjectorMatrix(projectorCamera);

  // plane の uniform 参照を収集
  const planeUniforms = [];

  const installation = new THREE.Group();
  for (const p of PLANE_CONFIGS) {
    const geometry = new THREE.PlaneGeometry(p.width, p.height);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        projectionTexture: { value: projectionTexture },
        projectorMatrix: { value: new THREE.Matrix4().copy(projectorMatrix) },
        baseColor: { value: new THREE.Color(0x000000) },
        intensity: { value: 1.0 },
      },
      vertexShader,
      fragmentShader,
      side: THREE.DoubleSide,
    });
    planeUniforms.push(material.uniforms);
    const plane = new THREE.Mesh(geometry, material);
    plane.rotation.set(p.rotation[0], p.rotation[1], p.rotation[2]);
    plane.position.fromArray(p.position);
    installation.add(plane);
  }
  scene.add(installation);

  // lookAt 先を追跡
  let currentTarget = PROJECTOR_TARGET.clone();

  /**
   * プロジェクタカメラのパラメータを更新し、行列を再計算する。
   * @param {{ fov?: number, pos?: THREE.Vector3, target?: THREE.Vector3 }} opts
   */
  function updateProjectorParams(opts = {}) {
    if (opts.fov === undefined && !opts.pos && !opts.target) return;

    if (opts.fov !== undefined) projectorCamera.fov = opts.fov;
    if (opts.pos) projectorCamera.position.copy(opts.pos);
    if (opts.target) currentTarget.copy(opts.target);
    projectorCamera.lookAt(currentTarget);

    const newMatrix = computeProjectorMatrix(projectorCamera);
    for (const u of planeUniforms) {
      u.projectorMatrix.value.copy(newMatrix);
    }
    projectorHelper.update();
  }

  return { scene, projectorHelper, updateProjectorParams };
}
