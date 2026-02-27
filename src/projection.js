import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  CAMERA_FOV, CAMERA_POS, PROJECTOR_TARGET,
  buildInstallationScene,
} from './scene-config.js';

/**
 * @param {HTMLElement} container
 * @param {THREE.CanvasTexture} projectionTexture
 */
export function initProjection(container, projectionTexture) {
  // --- Renderer ---
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  container.appendChild(renderer.domElement);

  // --- Scene ---
  const { scene, updateProjectorParams } = buildInstallationScene(projectionTexture);

  // --- Camera ---
  const camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 50);
  camera.position.copy(CAMERA_POS);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.target.copy(PROJECTOR_TARGET);
  controls.update();
  controls.saveState();

  function resetOrbit() { controls.reset(); }

  // --- Render Loop ---

  let paused = false;

  function render() {
    requestAnimationFrame(render);
    if (paused) return;
    projectionTexture.needsUpdate = true;
    controls.update();
    renderer.render(scene, camera);
  }

  // --- Resize ---
  function resize() {
    const { width, height } = container.getBoundingClientRect();
    if (width === 0 || height === 0) return;
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    // ビューポートを上方向にオフセット（LED Wall を画面上方に表示）
    const yOffset = Math.round(height * 0.3);
    camera.setViewOffset(width, height + yOffset, 0, yOffset, width, height);
  }

  // ResizeObserver で自動リサイズ（手動 resize() 呼び出し不要）
  new ResizeObserver(() => resize()).observe(container);

  function setPaused(v) {
    const wasPaused = paused;
    paused = v;
    if (wasPaused && !v) {
      // unpause 時: reflow 強制 → resize → 正しいサイズで最初のフレーム描画
      void container.offsetHeight;
      resize();
    }
  }

  return {
    start() {
      resize();
      render();
    },
    camera,
    updateProjectorParams,
    setPaused,
    resetOrbit,
  };
}
