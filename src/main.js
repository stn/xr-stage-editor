import './styles.css';
import { OFFSCREEN_SIZE, DISPLAY_WIDTH, DISPLAY_HEIGHT } from './scene-config.js';
import { initEngine, runCode, cleanup } from './engine.js';
import { initProjection } from './projection.js';
import { initProjectorGUI } from './projector-gui.js';
import { parseProjectorMeta, applyProjectorMeta } from './projector-meta.js';
import {
  BUILTIN_PATTERNS, allPatterns, findPattern, isBuiltin,
  getActiveId, setActiveId, getUserPatterns,
  getDraft, setDraft,
  createPattern, duplicatePattern, forkFromBuiltin,
  deletePattern, renamePattern, updatePatternCode,
  deleteAllUserPatterns, exportPattern, importPatterns,
  subscribe, migrateLegacy,
} from './pattern-store.js';

// --- Legacy migration (idempotent, runs before anything else) ---
migrateLegacy();

// --- DOM ---
const xrStageCanvas = document.getElementById('xr-stage-canvas');
const codeEditor = document.getElementById('xr-stage-editor');
const runButton = document.getElementById('xr-stage-run');
const statusElement = document.getElementById('xr-stage-status');
const container = document.getElementById('three');
const rightPanel = document.getElementById('right-panel');
const btnTogglePanel = document.getElementById('btn-toggle-panel');
const tabPreviewBtn = document.getElementById('tab-preview');
const tabPatternsBtn = document.getElementById('tab-patterns');
const tabPanelPreview = document.getElementById('tabpanel-preview');
const tabPanelPatterns = document.getElementById('tabpanel-patterns');
const patternListEl = document.getElementById('pattern-list');
const miniPreviewCanvas = document.getElementById('mini-preview');
const btnNew = document.getElementById('btn-pattern-new');
const btnDuplicate = document.getElementById('btn-pattern-duplicate');
const btnRename = document.getElementById('btn-pattern-rename');
const btnDelete = document.getElementById('btn-pattern-delete');
const btnOverflow = document.getElementById('btn-overflow');
const overflowMenu = document.getElementById('overflow-menu');
const btnImport = document.getElementById('btn-pattern-import');
const btnExport = document.getElementById('btn-pattern-export');
const btnDeleteAll = document.getElementById('btn-pattern-delete-all');
const btnResetOrbit = document.getElementById('btn-reset-orbit');

if (
  !xrStageCanvas || !codeEditor || !runButton ||
  !statusElement || !container || !rightPanel ||
  !btnTogglePanel || !tabPreviewBtn || !tabPatternsBtn ||
  !tabPanelPreview || !tabPanelPatterns || !patternListEl ||
  !miniPreviewCanvas || !btnNew || !btnDuplicate || !btnRename || !btnDelete ||
  !btnOverflow || !overflowMenu || !btnImport || !btnExport || !btnDeleteAll ||
  !btnResetOrbit
) {
  throw new Error('Required DOM elements not found.');
}

// --- エンジン初期化 ---
const { projectionTexture, error: initError } = initEngine(xrStageCanvas);
if (initError) {
  setStatus(initError.message, true);
  throw initError;
}

// --- Three.js 投影初期化 ---
const { start, camera, updateProjectorParams, setPaused, resetOrbit } = initProjection(container, projectionTexture);

// --- LED Wall ポップアップ ---
window.__projectionState = {
  camera, canvas: xrStageCanvas, projectionTexture, updateProjectorParams,
  projectorParams: {}, projectorVersion: 0,
};

// --- Direct Three.js utilities for presets ---
window.createProjectorCamera = function(near = 0.1, far = 1000) {
  const camera = new THREE.PerspectiveCamera(PROJECTOR_FOV, 1, near, far);
  camera.position.set(PROJECTOR_POS.x, PROJECTOR_POS.y, PROJECTOR_POS.z);
  camera.lookAt(PROJECTOR_TARGET.x, PROJECTOR_TARGET.y, PROJECTOR_TARGET.z);
  return camera;
};

window.createDirectRenderer = function(opts) {
  const renderer = new THREE.WebGLRenderer({ ...opts, preserveDrawingBuffer: true });
  renderer.setSize(OFFSCREEN_SIZE, OFFSCREEN_SIZE);
  projectionTexture.image = renderer.domElement;
  window.__presetCleanup = () => {
    update = () => {};
    renderer.dispose();
    renderer.forceContextLoss();
  };
  return renderer;
};

initProjectorGUI(container);

let popupWin = null;
document.getElementById('btn-popout-ledwall').addEventListener('click', () => {
  if (popupWin && !popupWin.closed) { popupWin.focus(); return; }
  // Approximate window chrome: ~16px horizontal borders, ~27px title bar + borders
  const popW = DISPLAY_WIDTH * 2 + 16;
  const popH = DISPLAY_HEIGHT + DISPLAY_WIDTH + 27;
  popupWin = window.open('/led-wall.html', 'ledwall', `width=${popW},height=${popH},resizable=yes`);
  if (!popupWin) return;
  const timer = setInterval(() => {
    if (!popupWin || popupWin.closed) {
      clearInterval(timer);
      popupWin = null;
    }
  }, 500);
});

// --- UI ステータス ---
function setStatus(message, isError = false) {
  statusElement.textContent = message;
  statusElement.title = message;
  statusElement.dataset.state = isError ? 'error' : 'ready';
}

// --- コード実行 ---
let runId = 0;

async function execCode(code) {
  if (!code.trim()) {
    setStatus('Empty', true);
    return;
  }

  // 前回のプリセットが差し替えたテクスチャソースをリセット
  projectionTexture.image = xrStageCanvas;
  // 前回のプリセットのリソースをクリーンアップ
  if (window.__presetCleanup) {
    window.__presetCleanup();
    window.__presetCleanup = null;
  }

  const activeId = getActiveId();
  const pattern = findPattern(activeId);

  // Auto-fork: if editing a builtin and code differs
  if (pattern && isBuiltin(activeId) && code.trim() !== pattern.code.trim()) {
    const forkId = forkFromBuiltin(activeId, code);
    if (forkId) {
      setActiveId(forkId);
      setStatus(`Forked as "${findPattern(forkId)?.name}"`);
    }
    cleanup();
  }

  applyProjectorMeta(parseProjectorMeta(code));

  const currentRun = ++runId;
  setStatus('Running…');
  const error = await runCode(code);
  if (currentRun !== runId) return;
  if (error) {
    console.error('Code error', error);
    setStatus(error.message || 'Failed', true);
  } else {
    setStatus('OK');
  }
}

// --- パターンアクティベート ---
function activatePattern(id) {
  const pattern = findPattern(id);
  if (!pattern) return;

  setActiveId(id);
  window.__projectorPresetDefaults = null;
  cleanup();
  if (window.resetProjector) window.resetProjector();

  // Check for draft if builtin
  const draft = isBuiltin(id) ? getDraft(id) : null;
  const code = draft || pattern.code;
  codeEditor.value = code;
  execCode(code);
}

// --- Platform-aware placeholder ---
const modifier = /Mac|iPhone|iPad/.test(navigator.userAgent) ? 'Cmd' : 'Ctrl';
codeEditor.placeholder = `// shadertoy(\`...\`) — ${modifier}+Enter to run`;

// --- Tab Switching ---
let activeTab = 'preview';

function switchTab(tab) {
  activeTab = tab;
  const isPreview = tab === 'preview';

  tabPreviewBtn.classList.toggle('tab-btn--active', isPreview);
  tabPatternsBtn.classList.toggle('tab-btn--active', !isPreview);
  tabPreviewBtn.setAttribute('aria-selected', String(isPreview));
  tabPatternsBtn.setAttribute('aria-selected', String(!isPreview));
  tabPreviewBtn.tabIndex = isPreview ? 0 : -1;
  tabPatternsBtn.tabIndex = isPreview ? -1 : 0;

  if (isPreview) {
    tabPanelPreview.hidden = false;
    tabPanelPatterns.hidden = true;
    setPaused(false);
    stopMiniPreview();
  } else {
    tabPanelPreview.hidden = true;
    tabPanelPatterns.hidden = false;
    setPaused(true);
    startMiniPreview();
    renderPatternList();
  }
}

// Roving tabindex for tabs
const tabBtns = [tabPreviewBtn, tabPatternsBtn];
tabPreviewBtn.addEventListener('click', () => switchTab('preview'));
tabPatternsBtn.addEventListener('click', () => switchTab('patterns'));

document.querySelector('.panel-tabs').addEventListener('keydown', (e) => {
  if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
  e.preventDefault();
  const current = tabBtns.indexOf(document.activeElement);
  if (current === -1) return;
  const next = e.key === 'ArrowRight'
    ? (current + 1) % tabBtns.length
    : (current - 1 + tabBtns.length) % tabBtns.length;
  tabBtns[current].tabIndex = -1;
  tabBtns[next].tabIndex = 0;
  tabBtns[next].focus();
  switchTab(next === 0 ? 'preview' : 'patterns');
});

// --- Panel Toggle ---
let panelVisible = true;

function togglePanel() {
  panelVisible = !panelVisible;
  rightPanel.classList.toggle('right-panel--hidden', !panelVisible);
  btnTogglePanel.setAttribute('aria-expanded', String(panelVisible));

  if (panelVisible) {
    switchTab('preview');
  }
}

rightPanel.addEventListener('transitionend', (e) => {
  if (e.propertyName !== 'flex-basis') return;
  if (panelVisible && activeTab === 'preview') {
    setPaused(false);
  }
});

btnTogglePanel.addEventListener('click', togglePanel);

// Keyboard shortcut: Cmd+\ / Ctrl+\
document.addEventListener('keydown', (e) => {
  if (e.key === '\\' && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
    e.preventDefault();
    togglePanel();
  }
});

// --- Orbit Reset ---
btnResetOrbit.addEventListener('click', (e) => {
  e.stopPropagation();
  resetOrbit();
});

document.addEventListener('keydown', (e) => {
  if (e.key !== 'r' || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
  const el = document.activeElement;
  if (el?.tagName === 'TEXTAREA' || el?.tagName === 'INPUT' || el?.isContentEditable) return;
  if (activeTab !== 'preview' || !panelVisible) return;
  e.preventDefault();
  resetOrbit();
});

// --- Mini Preview ---
let miniPreviewTimer = null;
const miniCtx = miniPreviewCanvas.getContext('2d');

function startMiniPreview() {
  if (miniPreviewTimer) return;
  // Draw immediately
  miniCtx.drawImage(projectionTexture.image, 0, 0, 160, 160);
  miniPreviewTimer = setInterval(() => {
    miniCtx.drawImage(projectionTexture.image, 0, 0, 160, 160);
  }, 100); // ~10fps
}

function stopMiniPreview() {
  if (miniPreviewTimer) {
    clearInterval(miniPreviewTimer);
    miniPreviewTimer = null;
  }
}

// --- Pattern List Rendering ---
let isRenaming = false;

function renderPatternList() {
  if (isRenaming) return; // Guard: don't destroy rename input

  const activeId = getActiveId();
  const patterns = allPatterns();
  const frag = document.createDocumentFragment();

  for (const pattern of patterns) {
    const li = document.createElement('li');
    li.className = 'pattern-item';
    li.setAttribute('aria-current', pattern.id === activeId ? 'true' : 'false');
    li.dataset.id = pattern.id;
    li.tabIndex = -1;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'pattern-item__name';
    nameSpan.textContent = pattern.name;
    if (isBuiltin(pattern.id)) {
      const srOnly = document.createElement('span');
      srOnly.className = 'sr-only';
      srOnly.textContent = ' (built-in)';
      nameSpan.appendChild(srOnly);
    }
    li.appendChild(nameSpan);

    li.addEventListener('click', () => activatePattern(pattern.id));
    li.addEventListener('dblclick', () => {
      if (!isBuiltin(pattern.id)) startRename(li, pattern.id);
    });

    frag.appendChild(li);
  }

  patternListEl.innerHTML = '';
  patternListEl.appendChild(frag);

  // Update toolbar button states
  const selected = findPattern(activeId);
  const isBuiltinSelected = selected ? isBuiltin(selected.id) : true;
  btnDelete.disabled = !activeId || isBuiltinSelected;
  btnRename.disabled = !activeId || isBuiltinSelected;
  btnDuplicate.disabled = !activeId;
  btnExport.disabled = !activeId;
}

// Subscribe to store changes
subscribe(() => {
  if (activeTab === 'patterns') renderPatternList();
});

// --- Inline Rename ---
function startRename(li, patternId) {
  const pattern = findPattern(patternId);
  if (!pattern) return;

  isRenaming = true;
  const nameSpan = li.querySelector('.pattern-item__name');
  const input = document.createElement('input');
  input.className = 'pattern-name-input';
  input.type = 'text';
  input.value = pattern.name;
  input.maxLength = 100;

  nameSpan.replaceWith(input);
  input.focus();
  input.select();

  function commit() {
    const newName = input.value.replace(/\n/g, ' ').trim();
    if (newName && newName !== pattern.name) {
      renamePattern(patternId, newName);
    }
    isRenaming = false;
    renderPatternList();
  }

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      input.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      isRenaming = false;
      renderPatternList();
    }
    e.stopPropagation(); // Prevent list keyboard navigation
  });
}

// --- Pattern List Keyboard Navigation ---
patternListEl.addEventListener('keydown', (e) => {
  if (isRenaming) return;
  const items = [...patternListEl.querySelectorAll('.pattern-item')];
  const current = items.indexOf(document.activeElement);

  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const next = e.key === 'ArrowDown'
      ? Math.min(current + 1, items.length - 1)
      : Math.max(current - 1, 0);
    items[next]?.focus();
  } else if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    const id = document.activeElement?.dataset?.id;
    if (id) activatePattern(id);
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    const id = document.activeElement?.dataset?.id;
    if (id && !isBuiltin(id)) {
      if (window.confirm(`Delete "${findPattern(id)?.name}"?`)) {
        const fallbackId = deletePattern(id);
        if (fallbackId) activatePattern(fallbackId);
      }
    }
  } else if (e.key === 'F2') {
    const id = document.activeElement?.dataset?.id;
    if (id && !isBuiltin(id)) {
      startRename(document.activeElement, id);
    }
  } else if (e.key === 'Escape') {
    document.activeElement?.blur();
  }
});

// --- Pattern CRUD Buttons ---
btnNew.addEventListener('click', () => {
  const id = createPattern();
  setActiveId(id);
  codeEditor.value = findPattern(id).code;
  // Find the new item and start rename
  renderPatternList();
  const li = patternListEl.querySelector(`[data-id="${id}"]`);
  if (li) startRename(li, id);
});

btnDuplicate.addEventListener('click', () => {
  const id = duplicatePattern(getActiveId());
  if (id) activatePattern(id);
});

btnRename.addEventListener('click', () => {
  if (isRenaming) return;
  const activeId = getActiveId();
  if (!activeId || isBuiltin(activeId)) return;
  const li = patternListEl.querySelector(`[data-id="${activeId}"]`);
  if (li) {
    li.scrollIntoView({ block: 'nearest' });
    startRename(li, activeId);
  }
});

btnDelete.addEventListener('click', () => {
  const activeId = getActiveId();
  const pattern = findPattern(activeId);
  if (!pattern || isBuiltin(activeId)) return;
  if (window.confirm(`Delete "${pattern.name}"?`)) {
    const fallbackId = deletePattern(activeId);
    if (fallbackId) activatePattern(fallbackId);
  }
});

// --- Overflow Menu ---
btnOverflow.addEventListener('click', (e) => {
  e.stopPropagation();
  const isOpen = !overflowMenu.hidden;
  overflowMenu.hidden = isOpen;
  btnOverflow.setAttribute('aria-expanded', String(!isOpen));
});

function closeOverflowMenu() {
  overflowMenu.hidden = true;
  btnOverflow.setAttribute('aria-expanded', 'false');
}

document.addEventListener('click', closeOverflowMenu);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !overflowMenu.hidden) {
    closeOverflowMenu();
  }
});

btnImport.addEventListener('click', () => {
  closeOverflowMenu();
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.addEventListener('change', async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const imported = importPatterns(text);
      setStatus(`Imported ${imported.length} pattern(s)`);
      if (imported[0]) activatePattern(imported[0]);
    } catch (err) {
      setStatus('Import failed: ' + err.message, true);
    }
  });
  input.click();
});

btnExport.addEventListener('click', () => {
  closeOverflowMenu();
  const json = exportPattern(getActiveId());
  if (!json) return;
  const pattern = findPattern(getActiveId());
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${(pattern?.name || 'pattern').replace(/\s+/g, '-').toLowerCase()}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

btnDeleteAll.addEventListener('click', () => {
  closeOverflowMenu();
  if (getUserPatterns().length === 0) return;
  if (window.confirm('Delete all user patterns?')) {
    deleteAllUserPatterns();
    activatePattern(BUILTIN_PATTERNS[0].id);
  }
});

// --- Code Editor Events ---
codeEditor.addEventListener('keydown', (e) => {
  if (e.isComposing) return;

  // Ctrl/Cmd+Enter → 実行
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault();
    execCode(codeEditor.value);
    return;
  }

  // Tab → 2スペース挿入
  if (e.key === 'Tab' && !e.shiftKey) {
    e.preventDefault();
    document.execCommand('insertText', false, '  ');
    return;
  }

  // Shift+Tab → アウトデント
  if (e.key === 'Tab' && e.shiftKey) {
    e.preventDefault();
    const { value, selectionStart } = codeEditor;
    const lineStart = value.lastIndexOf('\n', selectionStart - 1) + 1;
    const leadingSpaces = value.substring(lineStart, lineStart + 2);
    const removeCount = leadingSpaces === '  ' ? 2 : leadingSpaces[0] === ' ' ? 1 : 0;
    if (removeCount > 0) {
      codeEditor.setSelectionRange(lineStart, lineStart + removeCount);
      document.execCommand('delete', false);
    }
    return;
  }

  // Escape → blur
  if (e.key === 'Escape') {
    codeEditor.blur();
  }
});

runButton.addEventListener('click', () => {
  execCode(codeEditor.value);
});

codeEditor.addEventListener('input', () => {
  const activeId = getActiveId();
  if (isBuiltin(activeId)) {
    // Save as draft for this builtin
    setDraft(activeId, codeEditor.value);
  } else {
    // Auto-save user pattern code
    updatePatternCode(activeId, codeEditor.value);
  }
});

// --- 初期化 ---
// Restore active pattern + draft (single execution)
const initialId = getActiveId();
const initialPattern = findPattern(initialId);
if (initialPattern) {
  const draft = isBuiltin(initialId) ? getDraft(initialId) : null;
  const code = draft || initialPattern.code;
  window.__projectorPresetDefaults = null;
  cleanup();
  if (window.resetProjector) window.resetProjector();
  codeEditor.value = code;
  execCode(code);
} else {
  // Fallback: first builtin
  const fallbackId = BUILTIN_PATTERNS[0].id;
  setActiveId(fallbackId);
  const code = BUILTIN_PATTERNS[0].code;
  codeEditor.value = code;
  execCode(code);
}

// --- レンダーループ開始 ---
start();
