/**
 * Parse and apply @projector metadata from code comments.
 *
 * Syntax: // @projector fov:90 pos:3,1.6,4.5 target:0,0,0
 * All fields are optional. The directive must appear in the leading
 * comment block (contiguous // lines at the top of the code).
 */

import {
  PROJECTOR_FOV, CAMERA_POS, PROJECTOR_TARGET,
} from './scene-config.js';

/**
 * Parse @projector metadata from code comments.
 * @param {string} code
 * @returns {{ fov?: number, pos?: {x:number,y:number,z:number}, target?: {x:number,y:number,z:number} } | null}
 */
export function parseProjectorMeta(code) {
  if (!code) return null;

  const lines = code.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    if (!trimmed.startsWith('//')) break;

    const match = trimmed.match(/^\/\/\s*@projector\b(.*)$/);
    if (!match) continue;

    const rest = match[1];
    const result = {};

    const fovMatch = rest.match(/\bfov:([-+\d.eE]+)/);
    if (fovMatch) {
      const n = Number(fovMatch[1]);
      if (Number.isFinite(n)) result.fov = n;
    }

    const posMatch = rest.match(/\bpos:([-+\d.eE]+),([-+\d.eE]+),([-+\d.eE]+)/);
    if (posMatch) {
      const x = Number(posMatch[1]), y = Number(posMatch[2]), z = Number(posMatch[3]);
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
        result.pos = { x, y, z };
      }
    }

    const targetMatch = rest.match(/\btarget:([-+\d.eE]+),([-+\d.eE]+),([-+\d.eE]+)/);
    if (targetMatch) {
      const x = Number(targetMatch[1]), y = Number(targetMatch[2]), z = Number(targetMatch[3]);
      if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)) {
        result.target = { x, y, z };
      }
    }

    return Object.keys(result).length > 0 ? result : null;
  }

  return null;
}

/**
 * Apply parsed projector metadata via the global setProjector API.
 * @param {{ fov?: number, pos?: {x,y,z}, target?: {x,y,z} } | null} meta
 */
export function applyProjectorMeta(meta) {
  if (!meta || !window.setProjector) return;
  window.setProjector(meta);
  window.__projectorPresetDefaults = {
    fov: meta.fov ?? PROJECTOR_FOV,
    pos: meta.pos ? { ...meta.pos } : { x: CAMERA_POS.x, y: CAMERA_POS.y, z: CAMERA_POS.z },
    target: meta.target ? { ...meta.target } : { x: PROJECTOR_TARGET.x, y: PROJECTOR_TARGET.y, z: PROJECTOR_TARGET.z },
  };
}
