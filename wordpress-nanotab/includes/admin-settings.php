<?php
if (!defined('ABSPATH')) exit;

add_action('admin_menu', function () {
    add_options_page('NanoTab Paywall', 'NanoTab', 'manage_options', 'nanotab', 'nanotab_admin_page');
});
add_action('admin_init', function () {
    register_setting('nanotab', NANOTAB_OPTION);
});

function nanotab_admin_page() {
    $s = nanotab_get_settings();
    if (isset($_POST['nanotab_save']) && check_admin_referer('nanotab_save')) {
        update_option(NANOTAB_OPTION, array(
            'wallet'  => sanitize_text_field($_POST['wallet']),
            'price'   => sanitize_text_field($_POST['price']),
            'rpc'     => esc_url_raw($_POST['rpc']),
            'enabled' => isset($_POST['enabled']) ? 1 : 0,
        ));
        $s = nanotab_get_settings();
        echo '<div class="notice notice-success"><p>Saved.</p></div>';
    }
    ?>
    <div class="wrap"><h1>NanoTab Paywall</h1>
    <form method="post"><?php wp_nonce_field('nanotab_save'); ?>
    <table class="form-table">
      <tr><th>Merchant wallet (Base)</th><td><input name="wallet" size="50" value="<?php echo esc_attr($s['wallet']); ?>" placeholder="0x…"></td></tr>
      <tr><th>Price (USDC)</th><td><input name="price" size="10" value="<?php echo esc_attr($s['price']); ?>"></td></tr>
      <tr><th>Base RPC endpoint</th><td><input name="rpc" size="50" value="<?php echo esc_attr($s['rpc']); ?>"></td></tr>
      <tr><th>Enabled</th><td><input type="checkbox" name="enabled" <?php checked($s['enabled'], 1); ?>></td></tr>
    </table>
    <p><input type="submit" name="nanotab_save" class="button button-primary" value="Save"></p>
    </form>
    <p>Readers pay via <code>X-Payment: &lt;tx_hash&gt;</code>. API: <code>GET /wp-json/nanotab/v1/post/&lt;id&gt;</code></p>
    </div>
    <?php
}
