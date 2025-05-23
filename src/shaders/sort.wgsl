
struct Uniforms {
    texture_dim: vec2<u32>,
    u_k_stage: u32,        // Outer loop "k" stage: block size is 2^(k+1)
    u_j_pass_power: u32,   // Inner loop "j" pass: comparison distance is 2^j_pass_power
    sort_direction_is_ascending: u32, // 1 for ascending, 0 for descending
    sort_key_channel: u32, // 0:R, 1:G, 2:B, 3:A, 4:Luminance
};

@group(0) @binding(0) var<uniform> ubo: Uniforms;
@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var inputTex: texture_2d<f32>;
@group(0) @binding(3) var outputTex: texture_storage_2d<rgba8unorm, write>;
@group(0) @binding(4) var<storage, read> sort_limits: array<u32>;

fn extract_key(pixel: vec4<f32>, mode: u32) -> f32 {
    switch(mode) {
        case 0u: { return pixel.r; }
        case 1u: { return pixel.g; }
        case 2u: { return pixel.b; }
        case 3u: { return pixel.a; }
        case 4u: { return dot(pixel.rgb, vec3f(0.299, 0.587, 0.114)); }
        default: { return pixel.r; }
    }
}

const F32_MAX: f32 = 3.402823e+38;
const F32_MIN: f32 = -3.402823e+38;

@compute @workgroup_size(256, 1, 1) // Workgroup X size should ideally be power of 2
fn main_sort(@builtin(global_invocation_id) global_id: vec3<u32>) {
    let texture_width = ubo.texture_dim.x;
    let texture_height = ubo.texture_dim.y;

    let current_col = global_id.x;
    let current_row = global_id.y;

    if (current_col >= texture_width || current_row >= texture_height) {
        return;
    }

    // Get the sort limit for the current row from the buffer
    let sort_limit_for_this_row = sort_limits[current_row];

    // If current_col is at or beyond the sort limit, just pass through the original pixel
    if (current_col >= sort_limit_for_this_row) {
        let original_pixel = textureLoad(inputTex, vec2<u32>(current_col, current_row), 0);
        textureStore(outputTex, vec2<u32>(current_col, current_row), original_pixel);
        return;
    }

    // The effective row width for sorting is now sort_limit_for_this_row
    let row_width_for_sort = sort_limit_for_this_row;

    let k_stage_block_size = 1u << (ubo.u_k_stage + 1u);
    let compare_distance = 1u << ubo.u_j_pass_power;

    let partner_col = current_col ^ compare_distance;

    let my_pixel_value = textureLoad(inputTex, vec2<u32>(current_col, current_row), 0);
    let my_key = extract_key(my_pixel_value, ubo.sort_key_channel);

    var partner_key: f32;
    var partner_pixel_value: vec4<f32>;

    // Partner must also be within the sortable part of the row
    let partner_in_sortable_bounds = partner_col < row_width_for_sort;

    if (partner_in_sortable_bounds) {
        partner_pixel_value = textureLoad(inputTex, vec2<u32>(partner_col, current_row), 0);
        partner_key = extract_key(partner_pixel_value, ubo.sort_key_channel);
    } else {
        if (ubo.sort_direction_is_ascending == 1u) {
            partner_key = F32_MAX;
        } else {
            partner_key = F32_MIN;
        }
    }

    var direction_for_this_comparison_is_ascending = ((current_col & k_stage_block_size) == 0u);
    if (ubo.sort_direction_is_ascending == 0u) {
        direction_for_this_comparison_is_ascending = !direction_for_this_comparison_is_ascending;
    }

    var final_pixel_value = my_pixel_value;
    let i_am_left_of_partner = current_col < partner_col;

    // Comparison logic (no changes needed here due to the partner_in_sortable_bounds check and sentinel keys)
    if (direction_for_this_comparison_is_ascending) {
        if (i_am_left_of_partner) {
            if (my_key > partner_key) { final_pixel_value = partner_pixel_value; }
        } else {
            if (my_key < partner_key) { final_pixel_value = partner_pixel_value; }
        }
    } else {
        if (i_am_left_of_partner) {
            if (my_key < partner_key) { final_pixel_value = partner_pixel_value; }
        } else {
            if (my_key > partner_key) { final_pixel_value = partner_pixel_value; }
        }
    }
    
    if (!partner_in_sortable_bounds) {
        final_pixel_value = my_pixel_value;
    }

    textureStore(outputTex, vec2<u32>(current_col, current_row), final_pixel_value);
}
