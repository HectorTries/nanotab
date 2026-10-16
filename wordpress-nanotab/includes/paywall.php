<?php
if (!defined('ABSPATH')) exit;

// --- Content paywall: show excerpt + 402-style notice unless paid ---
add_filter('the_content', 'nanotab_filter_content', 999);
function nanotab_filter_content($content) {
    if (is_admin() || !is_singular('post')) return $content;
    $s = nanotab_get_settings();
    if (empty($s['enabled']) || empty($s['wallet'])) return $content;
    if (current_user_can('read_private_posts')) return $content; // admins/editors free

    $tx = isset($_SERVER['HTTP_X_PAYMENT']) ? sanitize_text_field($_SERVER['HTTP_X_PAYMENT']) : '';
    if ($tx && nanotab_verify_payment($tx)) return $content;

    $spec = nanotab_payment_spec();
    $excerpt = wp_trim_words(wp_strip_all_tags($content), 40);
    return '<div class="nanotab-paywall">'
        . '<p>' . esc_html($excerpt) . '…</p>'
        . '<p><strong>🔒 Pay ' . esc_html($spec['amount']) . ' USDC on Base to unlock.</strong></p>'
        . '<p>Send to <code>' . esc_html($spec['to']) . '</code>, then reload with header <code>X-Payment: &lt;tx_hash&gt;</code>.</p>'
        . '</div>';
}

// --- REST route: GET /wp-json/nanotab/v1/post/<id> -> 402 JSON or full content ---
add_action('rest_api_init', function () {
    register_rest_route('nanotab/v1', '/post/(?P<id>\d+)', array(
        'methods'             => 'GET',
        'callback'            => 'nanotab_rest_post',
        'permission_callback' => '__return_true',
    ));
});

function nanotab_rest_post($req) {
    $s = nanotab_get_settings();
    $post = get_post((int) $req['id']);
    if (!$post || $post->post_status !== 'publish') {
        return new WP_Error('not_found', 'Not found', array('status' => 404));
    }
    $tx = $req->get_header('X-Payment');
    if ($tx && nanotab_verify_payment(sanitize_text_field($tx))) {
        return array('id' => $post->ID, 'title' => $post->post_title, 'content' => apply_filters('the_content', $post->post_content));
    }
    return new WP_REST_Response(array(
        'error'   => 'payment_required',
        'message' => 'Send X-Payment header with Base USDC tx hash.',
        'payment' => nanotab_payment_spec(),
    ), 402);
}
