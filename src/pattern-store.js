/**
 * Pattern data management — no DOM dependencies.
 * Manages builtin patterns (from presets.js) and user patterns (localStorage).
 */
import { scenes } from './presets.js';

// --- ID generation (with HTTP/LAN fallback) ---

function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
}

// --- Builtin patterns ---

export const BUILTIN_PATTERNS = Object.entries(scenes).map(([key, code]) => ({
  id: `builtin-${key}`,
  name: key,
  code,
}));

function isBuiltinId(id) {
  return typeof id === 'string' && id.startsWith('builtin-');
}

// --- localStorage keys ---

const PATTERNS_KEY = 'xr-stage-patterns';
const ACTIVE_KEY = 'xr-stage-active-pattern';
const DRAFTS_KEY = 'xr-stage-drafts';
const LEGACY_KEY = 'xr-stage-custom-code';

// --- Pub/Sub ---

const subscribers = [];

export function subscribe(callback) {
  subscribers.push(callback);
  return () => {
    const idx = subscribers.indexOf(callback);
    if (idx >= 0) subscribers.splice(idx, 1);
  };
}

function notify() {
  for (const cb of subscribers) cb();
}

// --- Safe localStorage ---

function safeSetItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'QuotaExceededError') {
      console.warn('localStorage quota exceeded');
      return false;
    }
    throw e;
  }
}

// --- User patterns ---

let userPatterns = [];

function loadUserPatterns() {
  try {
    const raw = localStorage.getItem(PATTERNS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* corrupted data */ }
  return [];
}

function saveUserPatterns() {
  return safeSetItem(PATTERNS_KEY, JSON.stringify(userPatterns));
}

// --- Active pattern ---

let activeId = null;

export function getActiveId() {
  return activeId;
}

export function setActiveId(id) {
  activeId = id;
  safeSetItem(ACTIVE_KEY, id || '');
  notify();
}

function restoreActiveId() {
  const stored = localStorage.getItem(ACTIVE_KEY);
  if (stored && findPattern(stored)) return stored;
  return BUILTIN_PATTERNS[0]?.id ?? null;
}

// --- Drafts (per-builtin map) ---

let drafts = {};

function loadDrafts() {
  try {
    const raw = localStorage.getItem(DRAFTS_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* corrupted */ }
  return {};
}

function saveDrafts() {
  safeSetItem(DRAFTS_KEY, JSON.stringify(drafts));
}

export function getDraft(builtinId) {
  return drafts[builtinId] ?? null;
}

export function setDraft(builtinId, code) {
  drafts[builtinId] = code;
  saveDrafts();
}

export function clearDraft(builtinId) {
  delete drafts[builtinId];
  saveDrafts();
}

export function clearAllDrafts() {
  drafts = {};
  localStorage.removeItem(DRAFTS_KEY);
}

// --- Query ---

export function allPatterns() {
  return [...BUILTIN_PATTERNS, ...userPatterns];
}

export function findPattern(id) {
  return BUILTIN_PATTERNS.find(p => p.id === id) || userPatterns.find(p => p.id === id) || null;
}

export function getUserPatterns() {
  return [...userPatterns];
}

export function isBuiltin(id) {
  return isBuiltinId(id);
}

// --- Fork name counter ---

function generateForkName(baseName) {
  const all = allPatterns();
  let candidate = `${baseName} (edited)`;
  let n = 2;
  while (all.some(p => p.name === candidate)) {
    candidate = `${baseName} (edited ${n++})`;
  }
  return candidate;
}

// --- CRUD ---

export function createPattern(name = 'Untitled', code = 'shadertoy(`\nvoid mainImage(out vec4 fragColor, in vec2 fragCoord) {\n  vec2 uv = fragCoord / iResolution.xy;\n  fragColor = vec4(uv, 0.5 + 0.5 * sin(iTime), 1.0);\n}\n`)') {
  const id = generateId();
  userPatterns.push({ id, name, code });
  saveUserPatterns();
  notify();
  return id;
}

export function duplicatePattern(sourceId) {
  const source = findPattern(sourceId);
  if (!source) return null;
  const id = generateId();
  const name = generateForkName(source.name);
  userPatterns.push({ id, name, code: source.code });
  saveUserPatterns();
  notify();
  return id;
}

export function forkFromBuiltin(builtinId, code) {
  const builtin = findPattern(builtinId);
  if (!builtin || !isBuiltinId(builtinId)) return null;
  const id = generateId();
  const name = generateForkName(builtin.name);
  userPatterns.push({ id, name, code });
  saveUserPatterns();
  clearDraft(builtinId);
  notify();
  return id;
}

export function deletePattern(id) {
  if (isBuiltinId(id)) return null;
  const idx = userPatterns.findIndex(p => p.id === id);
  if (idx === -1) return null;
  userPatterns.splice(idx, 1);
  saveUserPatterns();

  // Determine fallback
  let fallback = null;
  if (activeId === id) {
    fallback = userPatterns[idx] ?? userPatterns[idx - 1] ?? BUILTIN_PATTERNS[0] ?? null;
  }
  notify();
  return fallback?.id ?? null;
}

export function renamePattern(id, newName) {
  if (isBuiltinId(id)) return false;
  const trimmed = newName.replace(/\n/g, ' ').trim();
  if (!trimmed) return false;
  const name = trimmed.slice(0, 100);
  const pattern = userPatterns.find(p => p.id === id);
  if (!pattern) return false;
  pattern.name = name;
  saveUserPatterns();
  notify();
  return true;
}

export function updatePatternCode(id, code) {
  if (isBuiltinId(id)) return false;
  const pattern = userPatterns.find(p => p.id === id);
  if (!pattern) return false;
  pattern.code = code;
  saveUserPatterns();
  return true;
}

export function deleteAllUserPatterns() {
  userPatterns = [];
  saveUserPatterns();
  clearAllDrafts();
  notify();
}

// --- Import / Export ---

export function exportPattern(id) {
  const pattern = findPattern(id);
  if (!pattern) return null;
  return JSON.stringify({ version: 1, patterns: [{ name: pattern.name, code: pattern.code }] }, null, 2);
}

export function importPatterns(jsonString) {
  const data = JSON.parse(jsonString);
  let items = [];

  if (Array.isArray(data)) {
    items = data;
  } else if (data.patterns && Array.isArray(data.patterns)) {
    items = data.patterns;
  } else if (typeof data.code === 'string') {
    items = [data];
  } else {
    throw new Error('Invalid format');
  }

  const imported = [];
  for (const item of items) {
    if (typeof item.code !== 'string') continue;
    const id = generateId();
    const name = (typeof item.name === 'string' && item.name.trim()) ? item.name.trim().slice(0, 100) : 'Imported';
    userPatterns.push({ id, name, code: item.code });
    imported.push(id);
  }

  if (imported.length === 0) throw new Error('No valid patterns found');
  saveUserPatterns();
  notify();
  return imported;
}

// --- Legacy migration (idempotent) ---

export function migrateLegacy() {
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (!legacy || !legacy.trim()) return null;

  const existing = loadUserPatterns();
  const alreadyMigrated = existing.some(p => p.code === legacy && p.name === 'Custom');
  if (alreadyMigrated) return null;

  const id = generateId();
  existing.push({ id, name: 'Custom', code: legacy });
  userPatterns = existing;
  saveUserPatterns();
  // Note: do NOT delete LEGACY_KEY (backwards compatibility with older versions)
  notify();
  return id;
}

// --- Init ---

export function init() {
  userPatterns = loadUserPatterns();
  drafts = loadDrafts();
  activeId = restoreActiveId();
}

init();
