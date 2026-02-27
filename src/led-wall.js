import * as THREE from 'three';
import { DISPLAY_WIDTH, DISPLAY_HEIGHT, buildInstallationScene } from './scene-config.js';

const opener = window.opener;

if (!opener?.__projectionState) {
  const msg = document.createElement('p');
  msg.id = 'msg';
  msg.textContent = 'このウィンドウはメインアプリから開いてください。';
  document.body.appendChild(msg);
} else {
  const { canvas } = opener.__projectionState;

  // popup realm で CanvasTexture を生成（cross-realm typed array 問題を回避）
  // engine.js と同じ設定を明示的に適用する
  const projectionTexture = new THREE.CanvasTexture(canvas);
  projectionTexture.colorSpace = THREE.LinearSRGBColorSpace;
  projectionTexture.minFilter = THREE.LinearFilter;
  projectionTexture.magFilter = THREE.LinearFilter;
  projectionTexture.generateMipmaps = false;

  // popup realm でシーンを独立構築（geometry の typed array も popup realm になる）
  const { scene, projectorHelper, updateProjectorParams: localUpdateProjector } = buildInstallationScene(projectionTexture);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(DISPLAY_WIDTH * 2, DISPLAY_HEIGHT + DISPLAY_WIDTH);
  document.body.appendChild(renderer.domElement);

  const views = [
    {
      left: 0, bottom: DISPLAY_WIDTH, width: DISPLAY_WIDTH, height: DISPLAY_HEIGHT,
      bg: new THREE.Color().setRGB(0.5, 0.5, 0.7, THREE.SRGBColorSpace),
      cam: (() => {
        const c = new THREE.OrthographicCamera(-1.5, 1.5, 1, -1, 0.01, 100);
        c.position.set(4, 1, 1.5); c.up.set(0, 1, 0); c.lookAt(0, 1, 1.5); return c;
      })(),
    },
    {
      left: DISPLAY_WIDTH, bottom: DISPLAY_WIDTH, width: DISPLAY_WIDTH, height: DISPLAY_HEIGHT,
      bg: new THREE.Color().setRGB(0.7, 0.5, 0.5, THREE.SRGBColorSpace),
      cam: (() => {
        const c = new THREE.OrthographicCamera(-1.5, 1.5, 1, -1, 0.01, 100);
        c.position.set(1.5, 1, 4); c.up.set(0, 1, 0); c.lookAt(1.5, 1, 0); return c;
      })(),
    },
    {
      left: 0, bottom: 0, width: DISPLAY_WIDTH, height: DISPLAY_WIDTH,
      bg: new THREE.Color().setRGB(0.5, 0.7, 0.7, THREE.SRGBColorSpace),
      cam: (() => {
        const c = new THREE.OrthographicCamera(-1.5, 1.5, 1.5, -1.5, 0.01, 100);
        c.position.set(1.5, 4, 1.5); c.up.set(0, 0, -1); c.lookAt(1.5, 1, 1.5); return c;
      })(),
    },
  ];

  // f キーでフルスクリーン
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'f' && e.key !== 'F') return;
    if (!document.fullscreenElement) {
      renderer.domElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen();
    }
  });

  let lastProjectorVersion = 0;
  let currentTextureSource = canvas;

  function renderLoop() {
    if (!opener || opener.closed) { renderer.dispose(); return; }
    requestAnimationFrame(renderLoop);
    if (!opener.__projectionState) return;

    // テクスチャソースの同期（direct-mode プリセット対応）
    const state = opener.__projectionState;
    const mainTextureSource = state.projectionTexture.image;
    if (mainTextureSource !== currentTextureSource) {
      currentTextureSource = mainTextureSource;
      projectionTexture.image = currentTextureSource;
    }
    projectionTexture.needsUpdate = true;

    // プロジェクタパラメータの同期
    if (state.projectorVersion > lastProjectorVersion) {
      lastProjectorVersion = state.projectorVersion;
      const opts = {};
      if (state.projectorParams.fov !== undefined) opts.fov = state.projectorParams.fov;
      if (state.projectorParams.pos) {
        const p = state.projectorParams.pos;
        opts.pos = new THREE.Vector3(p.x, p.y, p.z);
      }
      if (state.projectorParams.target) {
        const t = state.projectorParams.target;
        opts.target = new THREE.Vector3(t.x, t.y, t.z);
      }
      localUpdateProjector(opts);
    }

    projectorHelper.visible = false;
    const savedBg = scene.background;
    scene.background = null;

    for (const v of views) {
      renderer.setViewport(v.left, v.bottom, v.width, v.height);
      renderer.setScissor(v.left, v.bottom, v.width, v.height);
      renderer.setScissorTest(true);
      renderer.setClearColor(v.bg);
      renderer.render(scene, v.cam);
    }

    scene.background = savedBg;
    projectorHelper.visible = true;
  }

  renderLoop();
}
