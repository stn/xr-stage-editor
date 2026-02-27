# XR Stage Editor

A real-time projection mapping editor powered by Three.js + Shadertoy GLSL.

English | [日本語](README_ja.md)

## Writing Three.js Presets

Use `createDirectRenderer()` to render a Three.js scene directly onto the projection texture.

```javascript
// @projector fov:42 pos:3,1.6,4.6 target:0,0.4,0

scene = new THREE.Scene()
camera = createProjectorCamera()
renderer = createDirectRenderer()

mesh = new THREE.Mesh(
  new THREE.BoxGeometry(),
  new THREE.MeshBasicMaterial({ color: 0x00ff00 })
)
scene.add(mesh)

update = () => {
  mesh.rotation.x += 0.01
  renderer.render(scene, camera)
}
```

- `createProjectorCamera(near?, far?)` creates a `PerspectiveCamera` matching the projector settings (FOV, position, target) with a fixed 1:1 aspect ratio
- `createDirectRenderer(opts?)` creates a `WebGLRenderer` and automatically sets up the projection texture and cleanup
- Additional settings such as `renderer.shadowMap.enabled = true` should be applied after calling `createDirectRenderer()`
- `// @projector fov:42 pos:3,1.6,4.6 target:0,0.4,0` customizes the projector configuration

## Importing from Shadertoy

### `shadertoy()`

`shadertoy()` renders Shadertoy GLSL code directly via Three.js `RawShaderMaterial`. It supports the full GLSL 300 es (WebGL 2) feature set, allowing you to run the original code almost as-is.

```javascript
shadertoy(`
mat2 rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, s, -s, c);
}

float sdBox(vec3 p, vec3 b) {
  vec3 q = abs(p) - b;
  return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0);
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  // speed is accessible anywhere as a uniform
  float t = iTime * speed;
  ...
}
`, { inputs: { speed: 1.0 } })
```

Values passed via `inputs` are available as uniforms throughout the entire shader code (including inside helper functions).

#### Not Supported

- Texture channels such as `iChannel0`
- Multi-pass rendering (Buffer A/B/C/D)

## Commands

```bash
pnpm dev      # Start Vite dev server
pnpm build    # Production build
pnpm preview  # Preview production build
```

## License

MIT License.
