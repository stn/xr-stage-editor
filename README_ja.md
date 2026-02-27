# XR Stage Editor

Three.js + Shadertoy GLSL によるリアルタイムプロジェクションマッピングエディタ

[English](README.md) | 日本語

## Three.js プリセットの書き方

`createDirectRenderer()` を使うと、Three.js のシーンを直接投影テクスチャに反映できます。

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

- `createProjectorCamera(near?, far?)` はプロジェクタ設定（FOV, 位置, ターゲット）に合わせた `PerspectiveCamera` を作成（aspect 1:1 固定）
- `createDirectRenderer(opts?)` は `WebGLRenderer` を作成し、投影テクスチャとクリーンアップを自動設定
- `renderer.shadowMap.enabled = true` 等の追加設定は `createDirectRenderer()` 呼び出し後に行う
- `// @projector fov:42 pos:3,1.6,4.6 target:0,0.4,0` でプロジェクタ設定をカスタマイズ可能

## Shadertoy からのインポート

### `shadertoy()`

`shadertoy()` は Shadertoy の GLSL コードを Three.js `RawShaderMaterial` で直接レンダリングします。GLSL 300 es (WebGL 2) の全機能が使え、元のコードをほぼそのまま実行できます。

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
  // speed は uniform としてどこからでもアクセス可能
  float t = iTime * speed;
  ...
}
`, { inputs: { speed: 1.0 } })
```

`inputs` で渡した値は uniform としてコード全体からアクセス可能（ヘルパー関数内でも直接使える）

#### 未サポート

- `iChannel0` 等のテクスチャチャンネル
- マルチパスレンダリング（Buffer A/B/C/D）

## コマンド

```bash
pnpm dev      # Vite dev server 起動
pnpm build    # プロダクションビルド
pnpm preview  # プロダクションビルドのプレビュー
```

## ライセンス

MIT License.
