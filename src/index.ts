import * as tinygpu from "tinygpu";
import { vec2, vec3 } from "wgpu-matrix";

import "./sass/main.scss";

import renderShader from "./shaders/render.wgsl";
import thresholdShader from "./shaders/threshold.wgsl";
import sortShader from "./shaders/sort.wgsl";

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
  thresholdTask: null,
  task: null,
  textureWidth: 1024,
  textureHeight: 1024,
  uniforms: null,
  sortLimitsBuffer: null,
};

const tex = () => renderer.createTexture({
  size: { width: settings.textureWidth, height: settings.textureHeight },
  format: "rgba8unorm",
  usage:
    GPUTextureUsage.TEXTURE_BINDING |
    GPUTextureUsage.COPY_DST |
    GPUTextureUsage.RENDER_ATTACHMENT |
    GPUTextureUsage.STORAGE_BINDING,
});

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
    [
      settings.textureWidth,
      settings.textureHeight,
      1
    ]
  );

  video.requestVideoFrameCallback(videoFrame);
};

const swap = () => {
  const { pingPongTextures } = settings;
  const texA = pingPongTextures[0].texture;
  pingPongTextures[0].texture = pingPongTextures[1].texture;
  pingPongTextures[1].texture = texA;
};

const process = () => {
  const { pingPongTextures, thresholdTask, task } = settings;

  renderer.compute([thresholdTask]);

  const N = settings.textureWidth;
  const numOuterStages = Math.ceil(Math.log2(N));

  for (let k_stage = 0; k_stage < numOuterStages; k_stage++) {
    for (let j_pass_power = k_stage; j_pass_power >= 0; j_pass_power--) {
      task.uniformManager.updateUniform({ name: "u_k_stage", value: k_stage });
      task.uniformManager.updateUniform({ name: "u_j_pass_power", value: j_pass_power });
      settings.task.uniformManager.update();

      renderer.compute([task]);

      swap();
      task.uniformManager.updateTextures(pingPongTextures);
    }
  }
};

const animate = () => {
  const { scene, renderer, camera, material, pingPongTextures } = settings;

  process();

  material.updateTextures(pingPongTextures);

  renderer.render(scene, camera);

  swap();

  requestAnimationFrame(animate);
};

const start = async () => {
  window.removeEventListener("click", start);

  await renderer.init();
  const scene = renderer.createScene();
  const camera = renderer.createOrthographicCamera();

  const { textureWidth, textureHeight } = settings;

  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: 'environment',
      width: { min: textureWidth, ideal: textureWidth, max: textureWidth },
      height: { min: textureHeight, ideal: textureHeight, max: textureHeight },
      advanced: [
        {
          aspectRatio: 1,
        },
      ],
    },
  });
  video.srcObject = stream;

  const textures = [
    { texture: tex(), accessType: "sample" },
    { texture: tex(), accessType: "write-only" }
  ] as tinygpu.UniformTextureItem[];

  const geo = renderer.createGeometry(tinygpu.geometry.BigTriangle);
  const mat = renderer.createMaterial(tinygpu.material.ShaderMaterial, {
    code: renderShader,
    textures,
  });

  const mesh = renderer.createMesh(geo, mat);
  scene.add(mesh);

  const sortLimitsBuffer = renderer.device.createBuffer({
    size: textureHeight * 4, // u32 per row
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, // Shader writes to it
  });
  settings.sortLimitsBuffer = sortLimitsBuffer;

  const thresholdTask = renderer.createComputeTask({
    shader: renderer.createShaderModule({ code: thresholdShader }),
    dispatchCount: vec3.create(
      1,
      textureHeight,
      1
    ),
    textures: [
      textures[0]
    ],
    uniforms: [
      { name: "texture_dim", value: vec2.create(textureWidth, textureHeight), type: "vec2" },
      { name: "threshold_value", value: 0.9, type: "f32" },
      { name: "sort_key_channel", value: 4, type: "u32" }
    ],
    buffers: [
      { buffer: sortLimitsBuffer, type: "storage" }
    ]
  });

  thresholdTask.uniformManager.update();

  const uniforms = [
    { name: "texture_dim", value: vec2.create(textureWidth, textureHeight), type: "vec2" },
    { name: "u_k_stage", value: 0, type: "u32" },
    { name: "u_j_pass_power", value: 0, type: "u32" },
    { name: "sort_direction_is_ascending", value: 1, type: "u32" },
    { name: "sort_key_channel", value: 4, type: "u32" },
  ];

  const task = renderer.createComputeTask({
    shader: renderer.createShaderModule({ code: sortShader }),
    dispatchCount: vec3.create(
      Math.ceil(textureWidth / 256),
      textureHeight,
      1
    ),
    textures,
    uniforms,
    buffers: [
      { buffer: sortLimitsBuffer, type: "read-only-storage" }
    ]
  });

  settings.scene = scene;
  settings.camera = camera;
  settings.renderer = renderer;
  settings.pingPongTextures = textures;
  settings.material = mat;
  settings.video = video;
  settings.thresholdTask = thresholdTask;
  settings.task = task;
  settings.uniforms = uniforms;

  requestAnimationFrame(animate);

  video.requestVideoFrameCallback(videoFrame);
  await video.play();
};

window.addEventListener("click", start);
