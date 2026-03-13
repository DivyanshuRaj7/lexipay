import { createRequire } from "module";
const require = createRequire(import.meta.url);
require("@nomicfoundation/hardhat-toolbox");

import dotenv from "dotenv";
dotenv.config();

/** Returns true only if key is a valid 64-char hex string (with optional 0x prefix) */
function isValidPrivateKey(key) {
  if (!key) return false;
  const stripped = key.startsWith("0x") ? key.slice(2) : key;
  return /^[0-9a-fA-F]{64}$/.test(stripped);
}

/** @type import('hardhat/config').HardhatUserConfig */

export default {
  solidity: "0.8.24",
  networks: {
    fuji: {
      url: "https://api.avax-test.network/ext/bc/C/rpc",
      // Only include account if key looks like a real 32-byte hex private key
      accounts: isValidPrivateKey(process.env.EVM_PRIVATE_KEY)
        ? [process.env.EVM_PRIVATE_KEY]
        : [],

    },
  },
};
