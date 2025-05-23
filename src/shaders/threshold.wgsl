// threshold_finder.wgsl
struct ThresholdUniforms {
    texture_dim: vec2<u32>,      // e.g., [256, 256]
    threshold_value: f32,        // Your threshold, e.g., 0.5
    sort_key_channel: u32,       // e.g., 4 for luminance (must match sort shader's key)
};

@group(0) @binding(0) var<uniform> ubo: ThresholdUniforms;
@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var inputTex: texture_2d<f32>;
@group(0) @binding(3) var<storage, read_write> sort_limits_output: array<u32>;

// Re-use the same key extraction logic as your sort shader
fn extract_key(pixel: vec4<f32>, mode: u32) -> f32 {
    switch(mode) {
        case 0u: { return pixel.r; }
        case 1u: { return pixel.g; }
        case 2u: { return pixel.b; }
        case 3u: { return pixel.a; }
        case 4u: { return dot(pixel.rgb, vec3f(0.299, 0.587, 0.114)); }
        default: { return pixel.r; } // Default to Red
    }
}

// Shared memory for the workgroup to find the minimum column index
var<workgroup> min_col_for_this_row_atomic: atomic<u32>;

// We'll dispatch one workgroup per row.
// Workgroup X-size should ideally be your texture width (256 in this case).
@compute @workgroup_size(256, 1, 1)
fn main_find_threshold(
    @builtin(local_invocation_id) local_id: vec3<u32>,
    @builtin(workgroup_id) workgroup_id: vec3<u32> // workgroup_id.y is the current row
) {
    let row_idx = workgroup_id.y;
    let current_col_in_row = local_id.x; // This thread's column to check

    // Only the first invocation in the workgroup initializes the shared atomic
    if (local_id.x == 0u) {
        atomicStore(&min_col_for_this_row_atomic, ubo.texture_dim.x); // Default to full width (no threshold met)
    }
    workgroupBarrier(); // Ensure initialization is complete for all threads

    // Check if this thread is within the valid bounds of the row
    if (row_idx < ubo.texture_dim.y && current_col_in_row < ubo.texture_dim.x) {
        let pixel_coords = vec2<u32>(current_col_in_row, row_idx);
        let pixel_value = textureLoad(inputTex, pixel_coords, 0);
        let key = extract_key(pixel_value, ubo.sort_key_channel);

        if (key > ubo.threshold_value) {
            // If this pixel's key is over the threshold, try to set it as the minimum column
            atomicMin(&min_col_for_this_row_atomic, current_col_in_row);
        }
    }
    workgroupBarrier(); // Ensure all atomicMin operations are complete

    // Only the first invocation writes the final minimum column for this row to the output buffer
    if (local_id.x == 0u && row_idx < ubo.texture_dim.y) {
        sort_limits_output[row_idx] = atomicLoad(&min_col_for_this_row_atomic);
    }
}
