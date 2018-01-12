/*jslint node: true */
"use strict";

exports.port = null;
exports.bServeAsHub = false;
exports.bLight = true;
exports.bIgnoreUnpairRequests = true;

exports.storage = 'sqlite';

exports.hub = 'byteball.org/bb';
exports.deviceName = 'CrosswordFaucet';
exports.permanent_pairing_secret = '0000';
exports.control_addresses = ['0AOKTB2WGSGEQZVLZHFYOE6EGJTAJW3Z4'];
exports.payout_address = 'RFZJOS34ZKAZZ5RO37OQWE6GXVP5RARZ';

exports.MIN_AMOUNT_IN_KB = 50;
exports.MAX_AMOUNT_IN_KB = 100;

exports.KEYS_FILENAME = 'keys.json';

exports.admin_email: "anthony@devera.io";
exports.from_email: "anthony@devera.io";

console.log('finished faucet conf');

