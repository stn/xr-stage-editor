import GUI from 'lil-gui';

export function initProjectorGUI(container) {
  const params = {
    fov: window.PROJECTOR_FOV,
    posX: window.PROJECTOR_POS.x,
    posY: window.PROJECTOR_POS.y,
    posZ: window.PROJECTOR_POS.z,
    targetX: window.PROJECTOR_TARGET.x,
    targetY: window.PROJECTOR_TARGET.y,
    targetZ: window.PROJECTOR_TARGET.z,
  };

  const gui = new GUI({ container, title: 'Projector' });

  // Re-entrancy guard: fireChange sets true to prevent syncFromProjector
  // from redundantly re-reading globals during GUI-initiated changes.
  let updating = false;

  function fireChange() {
    if (updating) return;
    updating = true;
    try {
      window.setProjector({
        fov: params.fov,
        pos: { x: params.posX, y: params.posY, z: params.posZ },
        target: { x: params.targetX, y: params.targetY, z: params.targetZ },
      });
    } finally {
      updating = false;
    }
  }

  // Flat layout — folders add unnecessary click cost for 7 params
  // Ranges match setProjector clamp [1,179] for FOV; [-10,10] for pos/target
  const sliders = [
    gui.add(params, 'fov', 1, 179, 1).name('FOV').onChange(fireChange),
    gui.add(params, 'posX', -10, 10, 0.1).name('Pos X').onChange(fireChange),
    gui.add(params, 'posY', -10, 10, 0.1).name('Pos Y').onChange(fireChange),
    gui.add(params, 'posZ', -10, 10, 0.1).name('Pos Z').onChange(fireChange),
    gui.add(params, 'targetX', -10, 10, 0.1).name('Target X').onChange(fireChange),
    gui.add(params, 'targetY', -10, 10, 0.1).name('Target Y').onChange(fireChange),
    gui.add(params, 'targetZ', -10, 10, 0.1).name('Target Z').onChange(fireChange),
  ];
  gui.add({ reset: () => window.resetProjector() }, 'reset').name('Reset');
  gui.add({
    copy() {
      const r = n => parseFloat(n.toFixed(2));
      const { fov, posX, posY, posZ, targetX, targetY, targetZ } = params;
      const line = `// @projector fov:${r(fov)} pos:${r(posX)},${r(posY)},${r(posZ)} target:${r(targetX)},${r(targetY)},${r(targetZ)}`;
      navigator.clipboard.writeText(line).catch(() => {});
    }
  }, 'copy').name('Copy @projector');

  gui.close();

  function syncFromProjector() {
    if (updating) return;
    updating = true;
    params.fov = window.PROJECTOR_FOV;
    params.posX = window.PROJECTOR_POS.x;
    params.posY = window.PROJECTOR_POS.y;
    params.posZ = window.PROJECTOR_POS.z;
    params.targetX = window.PROJECTOR_TARGET.x;
    params.targetY = window.PROJECTOR_TARGET.y;
    params.targetZ = window.PROJECTOR_TARGET.z;
    sliders.forEach(c => c.updateDisplay());
    updating = false;
  }

  // Monkey-patch setProjector to auto-sync GUI on ANY projector change
  // (user code, @projector, resetProjector all call window.setProjector)
  // OrbitControls bind to renderer.domElement (canvas), not the container,
  // so lil-gui events (sibling DOM tree) do not trigger orbit.
  const originalSetProjector = window.setProjector;
  window.setProjector = function(opts) {
    originalSetProjector(opts);
    syncFromProjector();
  };

  return { gui, syncFromProjector };
}
