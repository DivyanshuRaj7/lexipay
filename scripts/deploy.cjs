const { ethers } = require("hardhat");

async function main() {
  const signers = await ethers.getSigners();
  const deployer = signers[0];

  if (!deployer) {
    console.error("\n❌ No deployer account found!");
    console.error("Make sure EVM_PRIVATE_KEY is set correctly in your .env file.");
    console.error("It must be a real 64-character hex private key (e.g. from MetaMask → Account Details → Export Private Key).");
    process.exit(1);
  }

  const balance = await ethers.provider.getBalance(deployer.address);


  console.log("====================================================");
  console.log("Deploying LexPayRegistry to Avalanche Fuji...");
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Balance:  ${ethers.formatEther(balance)} AVAX`);
  console.log("====================================================");

  const pricePerClauseWei = ethers.parseEther("0.0001");

  const LexPayRegistry = await ethers.getContractFactory("LexPayRegistry");
  const registry = await LexPayRegistry.deploy(pricePerClauseWei);

  await registry.waitForDeployment();

  const contractAddress = await registry.getAddress();

  console.log("\n✅ Deployment Complete!");
  console.log(`Contract Address: ${contractAddress}`);
  console.log(`View on Snowtrace: https://testnet.snowtrace.io/address/${contractAddress}`);
  console.log(`\nVerify with:`);
  console.log(`npx hardhat verify --network fuji ${contractAddress} ${pricePerClauseWei}`);
  console.log(`\nAdd to .env:`);
  console.log(`CONTRACT_ADDRESS=${contractAddress}`);
  console.log("====================================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
