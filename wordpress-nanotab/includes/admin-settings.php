<?php
if (!defined('ABSPATH')) exit;

add_action('admin_menu', 'nanotab_paywall_admin_menu');
function nanotab_paywall_admin_menu() {
    add_options_page(
        esc_html__('NanoTab Paywall', 'nanotab-paywall'),
        esc_html__('NanoTab', 'nanotab-paywall'),
        'manage_options',
        'nanotab-paywall',
        'nanotab_paywall_admin_page'
    );
}

add_action('admin_init', 'nanotab_paywall_register_settings');
function nanotab_paywall_register_settings() {
    register_setting('nanotab_paywall', NANOTAB_PAYWALL_OPTION, 'nanotab_paywall_sanitize_settings');
}

function nanotab_paywall_sanitize_settings($input) {
    return array(
        'wallet'  => isset($input['wallet']) ? nanotab_paywall_sanitize_wallet($input['wallet']) : '',
        'price'   => isset($input['price']) ? nanotab_paywall_sanitize_price($input['price']) : '0.05',
        'rpc'     => isset($input['rpc']) ? esc_url_raw($input['rpc']) : 'https://mainnet.base.org',
        'enabled' => !empty($input['enabled']) ? 1 : 0,
    );
}

function nanotab_paywall_sanitize_wallet($v) {
    $v = sanitize_text_field($v);
    return preg_match('/^0x[0-9a-fA-F]{40}$/', $v) ? $v : '';
}

function nanotab_paywall_sanitize_price($v) {
    $v = sanitize_text_field($v);
    return (is_numeric($v) && (float) $v > 0) ? $v : '0.05';
}

function nanotab_paywall_admin_page() {
    if (!current_user_can('manage_options')) {
        wp_die(esc_html__('You do not have sufficient permissions to access this page.', 'nanotab-paywall'));
    }
    $s = nanotab_paywall_get_settings();
    if (isset($_POST['nanotab_paywall_save']) && check_admin_referer('nanotab_paywall_save')) {
        $updated = nanotab_paywall_sanitize_settings(array(
            'wallet'  => isset($_POST['wallet']) ? wp_unslash($_POST['wallet']) : '',
            'price'   => isset($_POST['price']) ? wp_unslash($_POST['price']) : '',
            'rpc'     => isset($_POST['rpc']) ? wp_unslash($_POST['rpc']) : '',
            'enabled' => isset($_POST['enabled']) ? 1 : 0,
        ));
        update_option(NANOTAB_PAYWALL_OPTION, $updated);
        $s = nanotab_paywall_get_settings();
        echo '<div class="notice notice-success"><p>' . esc_html__('Saved.', 'nanotab-paywall') . '</p></div>';
    }
    ?>
    <div class="wrap"><h1><?php echo esc_html__('NanoTab Paywall', 'nanotab-paywall'); ?></h1>
    <form method="post"><?php wp_nonce_field('nanotab_paywall_save'); ?>
    <table class="form-table">
      <tr><th scope="row"><?php echo esc_html__('Merchant wallet (Base)', 'nanotab-paywall'); ?></th><td><input name="wallet" size="50" value="<?php echo esc_attr($s['wallet']); ?>" placeholder="0x…"></td></tr>
      <tr><th scope="row"><?php echo esc_html__('Price (USDC)', 'nanotab-paywall'); ?></th><td><input name="price" size="10" value="<?php echo esc_attr($s['price']); ?>"></td></tr>
      <tr><th scope="row"><?php echo esc_html__('Base RPC endpoint', 'nanotab-paywall'); ?></th><td><input name="rpc" size="50" value="<?php echo esc_attr($s['rpc']); ?>"></td></tr>
      <tr><th scope="row"><?php echo esc_html__('Enabled', 'nanotab-paywall'); ?></th><td><input type="checkbox" name="enabled" <?php checked($s['enabled'], 1); ?>></td></tr>
    </table>
    <p><input type="submit" name="nanotab_paywall_save" class="button button-primary" value="<?php echo esc_attr__('Save', 'nanotab-paywall'); ?>"></p>
    </form>
    <p><?php echo esc_html__('Readers pay via X-Payment: <tx_hash>. API: GET /wp-json/nanotab/v1/post/<id>', 'nanotab-paywall'); ?></p>
    </div>
    <?php
}
