// @projector fov:42 pos:3,1.6,4.6 target:0,0.4,0

scene = new THREE.Scene()
camera = createProjectorCamera()
renderer = createDirectRenderer()

geometry = new THREE.BoxGeometry()
material = new THREE.MeshBasicMaterial({color: 0x00ff00})
cube = new THREE.Mesh(geometry, material);
scene.add(cube)

update = () => {
  cube.rotation.x += 0.01;
  cube.rotation.y += 0.01;
  renderer.render(scene, camera);
}
