import * as THREE from 'three';
import {
  OFFSCREEN_SIZE, PROJECTOR_FOV, CAMERA_POS, PROJECTOR_TARGET,
} from './scene-config.js';
import './shadertoy-direct.js';

// Expose THREE globally so user code executed via eval/AsyncFunction can access it
window.THREE = THREE;

// Expose projector camera constants so preset and user code can match the projection
window.OFFSCREEN_SIZE = OFFSCREEN_SIZE;
window.PROJECTOR_FOV = PROJECTOR_FOV;
window.PROJECTOR_POS = { x: CAMERA_POS.x, y: CAMERA_POS.y, z: CAMERA_POS.z };
window.PROJECTOR_TARGET = { x: PROJECTOR_TARGET.x, y: PROJECTOR_TARGET.y, z: PROJECTOR_TARGET.z };

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

// Initialize before RAFloop starts to prevent undefined reference
window.update = () => {};

// RAFloop: calls window.update() every frame
function tick() {
  requestAnimationFrame(tick);
  if (typeof window.update === 'function') window.update();
}
tick();

/**
 * エンジンを初期化する。
 * OFFSCREEN_SIZE×OFFSCREEN_SIZE のオフスクリーンキャンバスと CanvasTexture を作成する。
 *
 * @param {HTMLCanvasElement} canvas
 * @returns {{ projectionTexture: THREE.CanvasTexture, error: null }
 *          | { projectionTexture: null, error: Error }}
 */
export function initEngine(canvas) {
  try {
    canvas.width = OFFSCREEN_SIZE;
    canvas.height = OFFSCREEN_SIZE;

    // Fill black as default projection
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, OFFSCREEN_SIZE, OFFSCREEN_SIZE);

    const projectionTexture = new THREE.CanvasTexture(canvas);
    projectionTexture.colorSpace = THREE.LinearSRGBColorSpace;
    projectionTexture.minFilter = THREE.LinearFilter;
    projectionTexture.magFilter = THREE.LinearFilter;
    projectionTexture.generateMipmaps = false;

    return { projectionTexture, error: null };
  } catch (error) {
    return { projectionTexture: null, error: error instanceof Error ? error : new Error(String(error)) };
  }
}

/**
 * コードを実行する。
 * UIへの副作用はなく、エラーは返り値で通知する。
 * コードに await が含まれる場合、AsyncFunction にフォールバックする。
 *
 * @param {string} code
 * @returns {Promise<Error | null>} 成功時 null、失敗時 Error
 */
export async function runCode(code) {
  const trimmed = code.trim();
  if (!trimmed) {
    return new Error('Empty');
  }

  try {
    (0, eval)(trimmed);
    return null;
  } catch (error) {
    if (error instanceof SyntaxError && /\bawait\b/.test(trimmed)) {
      try {
        await new AsyncFunction(trimmed)();
        return null;
      } catch (asyncError) {
        return asyncError instanceof Error ? asyncError : new Error(String(asyncError));
      }
    }
    return error instanceof Error ? error : new Error(String(error));
  }
}

/**
 * 前のプリセットの副作用をクリアする。
 * プリセット切替時に使用。
 */
export function cleanup() {
  window.update = () => {};
}

// --- loadScript polyfill ---
window.loadScript = (url) => import(/* @vite-ignore */ url);

// --- Global projector API for user code ---

window.setProjector = function({ fov, pos, target } = {}) {
  const state = window.__projectionState;
  if (!state?.updateProjectorParams) {
    console.warn('setProjector: projector not yet initialized');
    return;
  }

  if (fov === undefined && pos === undefined && target === undefined) return;

  const opts = {};
  if (fov !== undefined) {
    const n = Number(fov);
    if (!Number.isFinite(n)) return;
    opts.fov = Math.max(1, Math.min(179, n));
  }
  if (pos !== undefined) {
    const px = Number(pos.x), py = Number(pos.y), pz = Number(pos.z);
    if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(pz)) return;
    opts.pos = { x: px, y: py, z: pz };
  }
  if (target !== undefined) {
    const tx = Number(target.x), ty = Number(target.y), tz = Number(target.z);
    if (!Number.isFinite(tx) || !Number.isFinite(ty) || !Number.isFinite(tz)) return;
    opts.target = { x: tx, y: ty, z: tz };
  }

  const internalOpts = {};
  if (opts.fov !== undefined) internalOpts.fov = opts.fov;
  if (opts.pos) internalOpts.pos = new THREE.Vector3(opts.pos.x, opts.pos.y, opts.pos.z);
  if (opts.target) internalOpts.target = new THREE.Vector3(opts.target.x, opts.target.y, opts.target.z);
  state.updateProjectorParams(internalOpts);

  Object.assign(state.projectorParams, opts);
  state.projectorVersion++;

  if (opts.fov !== undefined) window.PROJECTOR_FOV = opts.fov;
  if (opts.pos) Object.assign(window.PROJECTOR_POS, opts.pos);
  if (opts.target) Object.assign(window.PROJECTOR_TARGET, opts.target);
};

window.setProjectorFOV = function(fov) {
  window.setProjector({ fov });
};

window.setProjectorPos = function(x, y, z) {
  if (typeof x === 'object') {
    window.setProjector({ pos: x });
  } else {
    window.setProjector({ pos: { x, y, z } });
  }
};

window.setProjectorTarget = function(x, y, z) {
  if (typeof x === 'object') {
    window.setProjector({ target: x });
  } else {
    window.setProjector({ target: { x, y, z } });
  }
};

/** Per-preset projector defaults from @projector metadata; null = use scene-config defaults */
window.__projectorPresetDefaults = null;

window.resetProjector = function() {
  const d = window.__projectorPresetDefaults;
  if (d) {
    window.setProjector(d);
  } else {
    window.setProjector({
      fov: PROJECTOR_FOV,
      pos: { x: CAMERA_POS.x, y: CAMERA_POS.y, z: CAMERA_POS.z },
      target: { x: PROJECTOR_TARGET.x, y: PROJECTOR_TARGET.y, z: PROJECTOR_TARGET.z },
    });
  }
};
