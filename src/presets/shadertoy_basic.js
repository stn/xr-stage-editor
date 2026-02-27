// @projector fov:70 pos:3,1.6,4.6 target:0,1,0

shadertoy(`
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  fragColor = vec4(uv, 0.5 + 0.5 * sin(iTime), 1.0);
}
`);
