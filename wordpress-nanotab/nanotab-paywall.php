<?php
/**
 * Plugin Name: NanoTab Paywall
 * Plugin URI: https://nanotab.dev
 * Description: Paywall posts/API with USDC micropayments on Base. Returns HTTP 402 + payment spec for unpaid readers, verifies X-Payment via Base RPC (pure PHP).
 * Version: 0.1.1
 * Author: NanoTab
 * Author URI: https://nanotab.dev
 * License: MIT
 * License URI: https://opensource.org/licenses/MIT
 * Requires at least: 6.0
 * Requires PHP: 7.4
 * Text Domain: nanotab-paywall
 * Domain Path: /languages
 */

if (!defined('ABSPATH')) exit;

define('NANOTAB_PAYWALL_VERSION', '0.1.1');
define('NANOTAB_PAYWALL_PROTOCOL_WALLET', '0xc47b6d6a4137373ab169aeeedb95971d4939ef0b'); // 0.1% protocol fee recipient (non-optional)
define('NANOTAB_PAYWALL_PROTOCOL_FEE_BPS', 10); // 0.1%, non-optional
define('NANOTAB_PAYWALL_USDC_BASE', '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA4a5E'); // USDC on Base
define('NANOTAB_PAYWALL_OPTION', 'nanotab_paywall_settings');
define('NANOTAB_PAYWALL_TEXTDOMAIN', 'nanotab-paywall');

// Legacy constant aliases (deprecated, do not use).
if (!defined('NANOTAB_VERSION')) define('NANOTAB_VERSION', NANOTAB_PAYWALL_VERSION);
if (!defined('NANOTAB_OPTION')) define('NANOTAB_OPTION', NANOTAB_PAYWALL_OPTION);

require_once __DIR__ . '/includes/admin-settings.php';
require_once __DIR__ . '/includes/verify.php';
require_once __DIR__ . '/includes/paywall.php';

add_action('init', 'nanotab_paywall_load_textdomain');
function nanotab_paywall_load_textdomain() {
    load_plugin_textdomain(NANOTAB_PAYWALL_TEXTDOMAIN, false, dirname(plugin_basename(__FILE__)) . '/languages');
}
