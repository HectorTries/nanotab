<?php
if (!defined('ABSPATH')) exit;

// --- Content paywall: show excerpt + 402-style notice unless paid ---
add_filter('the_content', 'nanotab_paywall_filter_content', 999);
function nanotab_paywall_filter_content($content) {
    if (is_admin() || !is_singular('post')) return $content;
    $s = nanotab_paywall_get_settings();
    if (empty($s['enabled']) || empty($s['wallet'])) return $content;
    if (current_user_can('read_private_posts')) return $content; // admins/editors free

    $tx_raw = isset($_SERVER['HTTP_X_PAYMENT']) ? wp_unslash($_SERVER['HTTP_X_PAYMENT']) : '';
    $tx = sanitize_text_field($tx_raw);
    if ($tx && nanotab_paywall_verify_payment($tx)) return $content;

    $spec = nanotab_paywall_payment_spec();
    $excerpt = wp_trim_words(wp_strip_all_tags($content), 40);
    return '<div class="nanotab-paywall">'
        . '<p>' . esc_html($excerpt) . '…</p>'
        . '<p><strong>'
        . esc_html(sprintf(
            /* translators: %s: price in USDC */
            __('Pay %s USDC on Base to unlock.', 'nanotab-paywall'),
            $spec['amount']
        ))
        . '</strong></p>'
        . '<p>'
        . esc_html__('Send to', 'nanotab-paywall')
        . ' <code>' . esc_html($spec['to']) . '</code>, '
        . esc_html__('then reload with header', 'nanotab-paywall')
        . ' <code>' . esc_html__('X-Payment: <tx_hash>', 'nanotab-paywall') . '</code>.</p>'
        . '</div>';
}

// --- REST route: GET /wp-json/nanotab/v1/post/<id> -> 402 JSON or full content ---
add_action('rest_api_init', 'nanotab_paywall_register_routes');
function nanotab_paywall_register_routes() {
    register_rest_route('nanotab/v1', '/post/(?P<id>\d+)', array(
        'methods'             => 'GET',
        'callback'            => 'nanotab_paywall_rest_post',
        'permission_callback' => '__return_true',
        'args'                => array(
            'id' => array(
                'validate_callback' => function ($param) {
                    return is_numeric($param) && (int) $param > 0;
                },
                'sanitize_callback' => 'absint',
            ),
        ),
    ));
}

function nanotab_paywall_rest_post($req) {
    $s = nanotab_paywall_get_settings();
    $post_id = absint($req['id']);
    $post = get_post($post_id);
    if (!$post || $post->post_status !== 'publish') {
        return new WP_Error('not_found', esc_html__('Not found', 'nanotab-paywall'), array('status' => 404));
    }
    $tx_header = $req->get_header('X-Payment');
    $tx = is_string($tx_header) ? sanitize_text_field(wp_unslash($tx_header)) : '';
    if ($tx && nanotab_paywall_verify_payment($tx)) {
        return array(
            'id'      => $post->ID,
            'title'   => $post->post_title,
            'content' => apply_filters('the_content', $post->post_content),
        );
    }
    return new WP_REST_Response(array(
        'error'   => 'payment_required',
        'message' => esc_html__('Send X-Payment header with Base USDC tx hash.', 'nanotab-paywall'),
        'payment' => nanotab_paywall_payment_spec(),
    ), 402);
}

// Legacy aliases (deprecated).
function nanotab_filter_content($content) {
    return nanotab_paywall_filter_content($content);
}
function nanotab_rest_post($req) {
    return nanotab_paywall_rest_post($req);
}
