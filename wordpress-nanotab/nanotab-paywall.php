<?php
/**
 * Plugin Name: NanoTab Paywall
 * Plugin URI: https://nanotab.example.com
 * Description: Paywall posts/API with USDC micropayments on Base. Returns HTTP 402 + payment spec for unpaid readers, verifies X-Payment via Base RPC (pure PHP).
 * Version: 0.1.0
 * Author: NanoTab
 * License: MIT
 * Requires at least: 6.0
 * Requires PHP: 7.4
 */

if (!defined('ABSPATH')) exit;

define('NANOTAB_VERSION', '0.1.0');
define('NANOTAB_USDC_BASE', '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA4a5E'); // USDC on Base
define('NANOTAB_OPTION', 'nanotab_settings');

require_once __DIR__ . '/includes/admin-settings.php';
require_once __DIR__ . '/includes/verify.php';
require_once __DIR__ . '/includes/paywall.php';
