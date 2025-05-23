import * as tinygpu from "tinygpu";

import "./sass/main.scss";

const video = document.createElement("video");
const canvas = document.createElement("canvas");
document.body.appendChild(canvas);

const renderer = new tinygpu.Renderer({ canvas });
const settings = {
  scene: null,
  renderer: null,
  camera: null,
  textures: null,
  material: null,
};

const videoFrame = () => {
  requestAnimationFrame(animate);
};

const animate = () => {
  const { scene, renderer, camera, material, textures } = settings;
  material.updateTextures(textures);
  renderer.render(scene, camera);
  // requestAnimationFrame(animate);
};

const start = async () => {
  await renderer.init();
  const scene = renderer.createScene();
  const camera = renderer.createOrthographicCamera();

  const stream = await navigator.mediaDevices.getUserMedia({
    video: true,
  });
  video.srcObject = stream;

  const textures = [
    { texture: new tinygpu.textures.VideoTexture(renderer.device, video) },
  ];

  const geo = renderer.createGeometry(tinygpu.geometry.BigTriangle);
  const mat = renderer.createMaterial(tinygpu.material.ShaderMaterial, {
    code: `

@group(BG_UNIFORMS) @binding(0) var texSampler: sampler;
@group(BG_UNIFORMS) @binding(1) var video: texture_external;

struct VSOut {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>
}

@vertex
fn vs_main(in: VSIn) -> VSOut {
  return VSOut (
    projectionViewModel() * vec4(in.position, 1.0),
    in.uv
  );
}

@fragment
fn fs_main(in: VSOut) -> @location(0) vec4<f32> {
  let dimensions = vec2<f32>(textureDimensions(video));
  let uv = arFill(dimensions, scene_uniforms.resolution, in.uv);
  return textureSampleBaseClampToEdge(video, texSampler, vec2(uv.x, 1.0 - uv.y));
}

    `,
    textures,
  });

  const mesh = renderer.createMesh(geo, mat);
  scene.add(mesh);

  settings.scene = scene;
  settings.camera = camera;
  settings.renderer = renderer;
  settings.textures = textures;
  settings.material = mat;

  video.requestVideoFrameCallback(videoFrame);
  await video.play();
};

window.addEventListener("click", start);
