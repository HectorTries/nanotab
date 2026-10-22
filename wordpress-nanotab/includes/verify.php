<?php
if (!defined('ABSPATH')) exit;

function nanotab_paywall_get_settings() {
    return wp_parse_args(get_option(NANOTAB_PAYWALL_OPTION, array()), array(
        'wallet'  => '',
        'price'   => '0.05',   // USDC
        'rpc'     => 'https://mainnet.base.org',
        'enabled' => 1,
    ));
}

// Legacy alias (deprecated).
function nanotab_get_settings() {
    return nanotab_paywall_get_settings();
}

function nanotab_paywall_hex_gte($amount_hex_raw, $min_int) {
    $amount_hex = ltrim(preg_replace('/^0x/i', '', (string) $amount_hex_raw), '0') ?: '0';
    $min_hex = ltrim(dechex(max(0, (int) $min_int)), '0') ?: '0';
    $la = strlen($amount_hex); $lm = strlen($min_hex);
    return ($la > $lm || ($la === $lm && strcmp($amount_hex, $min_hex) >= 0));
}

// Legacy alias (deprecated).
function nanotab_hex_gte($amount_hex_raw, $min_int) {
    return nanotab_paywall_hex_gte($amount_hex_raw, $min_int);
}

// Verify payment: lookup tx hash from X-Payment header via eth_getTransactionReceipt,
// then confirm BOTH legs exist in the same receipt:
//   1. USDC Transfer(to=merchant, value>=price-fee) — merchant net
//   2. USDC Transfer(to=NANOTAB_PAYWALL_PROTOCOL_WALLET, value>=price*0.001) — 0.1% protocol fee (non-optional)
// Missing fee leg -> reject.
function nanotab_paywall_verify_payment($tx_hash) {
    $s = nanotab_paywall_get_settings();
    if (empty($s['wallet']) || empty($tx_hash)) return false;
    if (!preg_match('/^0x[0-9a-fA-F]{64}$/', $tx_hash)) return false;

    $resp = nanotab_paywall_rpc('eth_getTransactionReceipt', array($tx_hash));
    if (!is_array($resp) || empty($resp['result']['logs']) || !is_array($resp['result']['logs'])) return false;
    if (isset($resp['result']['status']) && $resp['result']['status'] !== '0x1') return false;

    // USDC Transfer event topic
    $transfer_topic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
    $wallet_clean = preg_replace('/^0x/i', '', (string) $s['wallet']);
    if (!preg_match('/^[0-9a-fA-F]{40}$/', $wallet_clean)) return false;
    $merchant_padded = '0x' . str_pad(strtolower($wallet_clean), 64, '0', STR_PAD_LEFT);
    $protocol_clean = preg_replace('/^0x/i', '', NANOTAB_PAYWALL_PROTOCOL_WALLET);
    $protocol_padded = '0x' . str_pad(strtolower($protocol_clean), 64, '0', STR_PAD_LEFT);
    $gross_units = (int) round(((float) $s['price']) * 1e6); // USDC = 6 decimals
    $fee_units = (int) floor($gross_units * NANOTAB_PAYWALL_PROTOCOL_FEE_BPS / 10000);
    $net_units = $gross_units - $fee_units;

    $got_merchant = false; $got_fee = false;
    foreach ($resp['result']['logs'] as $log) {
        if (!is_array($log) || empty($log['address']) || empty($log['topics'][0]) || empty($log['topics'][2]) || !isset($log['data'])) continue;
        if (strcasecmp($log['address'], NANOTAB_PAYWALL_USDC_BASE) !== 0) continue;
        if (strcasecmp($log['topics'][0], $transfer_topic) !== 0) continue;
        if (strcasecmp($log['topics'][2], $merchant_padded) === 0 && nanotab_paywall_hex_gte($log['data'], $net_units)) $got_merchant = true;
        if (strcasecmp($log['topics'][2], $protocol_padded) === 0 && nanotab_paywall_hex_gte($log['data'], $fee_units)) $got_fee = true;
    }
    return ($got_merchant && $got_fee);
}

// Legacy alias (deprecated).
function nanotab_verify_payment($tx_hash) {
    return nanotab_paywall_verify_payment($tx_hash);
}

function nanotab_paywall_rpc($method, $params) {
    $s = nanotab_paywall_get_settings();
    $rpc = esc_url_raw($s['rpc']);
    if (empty($rpc)) return null;
    $r = wp_remote_post($rpc, array(
        'timeout' => 15,
        'headers' => array('Content-Type' => 'application/json'),
        'body'    => wp_json_encode(array('jsonrpc' => '2.0', 'id' => 1, 'method' => $method, 'params' => $params)),
    ));
    if (is_wp_error($r)) return null;
    $decoded = json_decode(wp_remote_retrieve_body($r), true);
    return is_array($decoded) ? $decoded : null;
}

// Legacy alias (deprecated).
function nanotab_rpc($method, $params) {
    return nanotab_paywall_rpc($method, $params);
}

function nanotab_paywall_payment_spec() {
    $s = nanotab_paywall_get_settings();
    return array(
        'spec'     => 'nanotab/1',
        'network'  => 'base',
        'asset'    => 'USDC',
        'contract' => NANOTAB_PAYWALL_USDC_BASE,
        'to'       => $s['wallet'],
        'amount'   => $s['price'],
        'header'   => 'X-Payment: <tx_hash>',
    );
}

// Legacy alias (deprecated).
function nanotab_payment_spec() {
    return nanotab_paywall_payment_spec();
}
