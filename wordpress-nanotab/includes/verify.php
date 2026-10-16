<?php
if (!defined('ABSPATH')) exit;

function nanotab_get_settings() {
    return wp_parse_args(get_option(NANOTAB_OPTION, array()), array(
        'wallet'  => '',
        'price'   => '0.05',   // USDC
        'rpc'     => 'https://mainnet.base.org',
        'enabled' => 1,
    ));
}

// Verify payment: lookup tx hash from X-Payment header via eth_getTransactionReceipt,
// then confirm a USDC Transfer(to=merchant, value>=price) log exists.
function nanotab_verify_payment($tx_hash) {
    $s = nanotab_get_settings();
    if (empty($s['wallet']) || empty($tx_hash)) return false;
    if (!preg_match('/^0x[0-9a-fA-F]{64}$/', $tx_hash)) return false;

    $resp = nanotab_rpc('eth_getTransactionReceipt', array($tx_hash));
    if (empty($resp['result']['logs'])) return false;

    // USDC Transfer event topic
    $transfer_topic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4c6686a363f43db763';
    $merchant_padded = '0x' . str_pad(strtolower(ltrim($s['wallet'], '0x')), 64, '0', STR_PAD_LEFT);
    $min_amount = (int) round(((float) $s['price']) * 1e6); // USDC = 6 decimals

    foreach ($resp['result']['logs'] as $log) {
        if (strcasecmp($log['address'], NANOTAB_USDC_BASE) !== 0) continue;
        if (empty($log['topics'][0]) || strcasecmp($log['topics'][0], $transfer_topic) !== 0) continue;
        if (empty($log['topics'][2]) || strcasecmp($log['topics'][2], $merchant_padded) !== 0) continue;
        $amount = hexdec(ltrim($log['data'], '0x') ?: '0');
        if ($amount >= $min_amount) return true;
    }
    return false;
}

function nanotab_rpc($method, $params) {
    $s = nanotab_get_settings();
    $r = wp_remote_post($s['rpc'], array(
        'timeout' => 15,
        'headers' => array('Content-Type' => 'application/json'),
        'body'    => wp_json_encode(array('jsonrpc' => '2.0', 'id' => 1, 'method' => $method, 'params' => $params)),
    ));
    if (is_wp_error($r)) return null;
    return json_decode(wp_remote_retrieve_body($r), true);
}

function nanotab_payment_spec() {
    $s = nanotab_get_settings();
    return array(
        'spec'     => 'nanotab/1',
        'network'  => 'base',
        'asset'    => 'USDC',
        'contract' => NANOTAB_USDC_BASE,
        'to'       => $s['wallet'],
        'amount'   => $s['price'],
        'header'   => 'X-Payment: <tx_hash>',
    );
}
