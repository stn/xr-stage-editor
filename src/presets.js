/**
 * Preset code strings.
 * Presets are loaded from individual .js files in src/presets/ via ?raw import.
 * Files are sorted alphabetically by filename.
 */

const modules = import.meta.glob('./presets/*.js', {
  query: '?raw',
  import: 'default',
  eager: true,
});

export const scenes = {};

for (const [path, raw] of Object.entries(modules)) {
  // './presets/shadertoy_auroras.js' → 'shadertoy_auroras'
  const key = path.replace('./presets/', '').replace(/\.js$/, '');
  if (scenes[key]) {
    console.warn(`Duplicate preset key "${key}", skipping ${path}`);
    continue;
  }
  scenes[key] = raw.replace(/^\uFEFF/, '').trim();
}
