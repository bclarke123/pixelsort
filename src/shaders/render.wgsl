@group(BG_UNIFORMS) @binding(0) var texSampler: sampler;
@group(BG_UNIFORMS) @binding(1) var video: texture_2d<f32>;

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
  return textureSample(video, texSampler, uv);
}
