import * as tinygpu from "tinygpu";

import "./sass/main.scss";

import renderShader from "./shaders/render.wgsl";

const video = document.createElement("video");
const canvas = document.createElement("canvas");
document.body.appendChild(canvas);

const renderer = new tinygpu.Renderer({ canvas });
const settings = {
  scene: null,
  renderer: null,
  camera: null,
  video: null,
  material: null,
  pingPongTextures: null,
};

const videoFrame = () => {
  const { video, pingPongTextures } = settings;
  const texA = pingPongTextures[0].texture.texture;

  renderer.device.queue.copyExternalImageToTexture(
    {
      source: video,
      flipY: true
    },
    {
      texture: texA,
    },
    [256, 256, 1]
  );

  video.requestVideoFrameCallback(videoFrame);
  animate();
};

const animate = () => {
  const { scene, renderer, camera, material, pingPongTextures } = settings;

  renderer.render(scene, camera);

  settings.pingPongTextures = [
    pingPongTextures[1],
    pingPongTextures[0]
  ];

  material.updateTextures(pingPongTextures);
};

const start = async () => {
  await renderer.init();
  const scene = renderer.createScene();
  const camera = renderer.createOrthographicCamera();

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'environment',
      width: { min: 256, ideal: 256, max: 256 },
      height: { min: 256, ideal: 256, max: 256 },
      advanced: [
        {
          aspectRatio: 1,
        },
      ],
    },

  });
  video.srcObject = stream;

  const texA = renderer.createTexture({
    size: { width: 256, height: 256 },
    format: "rgba8unorm",
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT |
      GPUTextureUsage.STORAGE_BINDING,
  });

  const texB = renderer.createTexture({
    size: { width: 256, height: 256 },
    format: "rgba8unorm",
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT |
      GPUTextureUsage.STORAGE_BINDING,
  });

  const textures = [
    { texture: texA },
    { texture: texB }
  ]

  const geo = renderer.createGeometry(tinygpu.geometry.BigTriangle);
  const mat = renderer.createMaterial(tinygpu.material.ShaderMaterial, {
    code: renderShader,
    textures,
  });

  const mesh = renderer.createMesh(geo, mat);
  scene.add(mesh);

  settings.scene = scene;
  settings.camera = camera;
  settings.renderer = renderer;
  settings.pingPongTextures = textures;
  settings.material = mat;
  settings.video = video;

  requestAnimationFrame(animate);

  video.requestVideoFrameCallback(videoFrame);
  await video.play();
};

window.addEventListener("click", start);
