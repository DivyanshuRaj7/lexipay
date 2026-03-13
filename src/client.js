import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import * as readline from 'readline/promises';
import { clearLine, cursorTo } from 'readline';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { baseSepolia } from 'viem/chains';


// Load environment variables
dotenv.config();

const API_URL = 'http://localhost:3001';

async function setupPaymentFetch() {
  const account = privateKeyToAccount(process.env.EVM_PRIVATE_KEY);
  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http()
  });

  let wrapFetchWithPayment;

  try {
    const facinet = await import('facinet-sdk');
    wrapFetchWithPayment = facinet.wrapFetchWithPayment || facinet.default?.wrapFetchWithPayment;
    console.log('✅ Loaded payment wrapper via facinet-sdk.');
  } catch (err) {
    try {
      const x402 = await import('x402-fetch');
      wrapFetchWithPayment = x402.wrapFetchWithPayment || x402.default?.wrapFetchWithPayment || x402.default;
      console.log('✅ Loaded payment wrapper via x402-fetch fallback.');
    } catch (e) {
      console.warn('⚠️ No payment SDK found, proceeding with standard fetch (will fail if 402 is strictly enforced).');
      return fetch;
    }
  }

  if (wrapFetchWithPayment) {
    return wrapFetchWithPayment(fetch, walletClient);
  } else {
    return fetch;
  }
}

async function main() {
  const filePath = process.argv[2];
  
  if (!filePath) {
    console.error('❌ Error: Missing file path.');
    console.error('Usage: node src/client.js <path-to-contract-pdf-or-txt>');
    process.exit(1);
  }

  if (!fs.existsSync(filePath)) {
    console.error(`❌ Error: File not found at ${filePath}`);
    process.exit(1);
  }

  if (!process.env.EVM_PRIVATE_KEY) {
    console.error(`❌ Error: EVM_PRIVATE_KEY is not defined in .env`);
    process.exit(1);
  }

  console.log(`\n📤 Uploading contract: ${filePath}...`);
  
  const fileBuffer = fs.readFileSync(filePath);
  const blob = new Blob([fileBuffer]);
  const formData = new FormData();
  formData.append('contract', blob, path.basename(filePath));

  let uploadRes;
  try {
    uploadRes = await fetch(`${API_URL}/upload`, {
      method: 'POST',
      body: formData,
    });

  } catch (err) {
    console.error(`❌ Server connection failed: ${err.message}. Is the server running on port 3001?`);
    process.exit(1);
  }

  if (!uploadRes.ok) {
    const errorBody = await uploadRes.text();
    console.error(`❌ Upload failed: ${uploadRes.status} ${uploadRes.statusText}`, errorBody);
    process.exit(1);
  }

  const sessionInfo = await uploadRes.json();
  const { sessionId, totalClauses, estimatedTotal, pricePerClause } = sessionInfo;

  console.log('--------------------------------------------------');
  console.log(`✅ Upload Successful! Session ID: ${sessionId}`);
  console.log(`📄 Total Clauses Identified: ${totalClauses}`);
  console.log(`💲 Estimated Cost: ${estimatedTotal} USDC`);
  console.log('--------------------------------------------------');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('\nProceed to analyze all clauses? (y/n) ');
  
  if (answer.toLowerCase() !== 'y') {
    console.log('✋ Analysis aborted. Exiting.');
    rl.close();
    process.exit(0);
  }
  rl.close();

  console.log('\n⚙️  Setting up wallet and payment transport...');
  const fetchWithPay = await setupPaymentFetch();
  
  console.log('\n🔍 Beginning analysis sequence...\n');

  let successCount = 0;

  for (let i = 0; i < totalClauses; i++) {
    process.stdout.write(`Analyzing clause ${i + 1}/${totalClauses}... `);
    
    try {
      const analyzeRes = await fetchWithPay(`${API_URL}/analyze/${sessionId}/${i}`, {
        method: 'POST'
      });

      if (!analyzeRes.ok) {
        console.log(`❌ Failed [${analyzeRes.status} ${analyzeRes.statusText}]`);
        continue;
      }

      const result = await analyzeRes.json();
      successCount++;
      
      // Clear the "Analyzing..." line
      clearLine(process.stdout, 0);
      cursorTo(process.stdout, 0);

      const sevDisplay = String(result.severity || 'LOW').padEnd(8);
      
      console.log(`┌────────────────────────────────────────────────────────────┐`);
      console.log(`│ Clause ${i} — ${sevDisplay} (${result.risk_type.substring(0, 15)})`.padEnd(61) + '│');
      
      // Formatting the explanation inside the box
      const expChunks = String(result.explanation || '').match(/.{1,56}(\s|$)/g) || [''];
      for (const line of expChunks) {
        console.log(`│ ${line.trim().padEnd(58)} │`);
      }
      
      console.log(`│ Rec: ${(result.recommendation || '').substring(0, 53).padEnd(53)} │`);
      console.log(`│ Tx: ${(result.txHash || '').substring(0, 54).padEnd(54)} │`);
      console.log(`└────────────────────────────────────────────────────────────┘\n`);

    } catch (err) {
      clearLine(process.stdout, 0);
      cursorTo(process.stdout, 0);
      console.log(`❌ Network or Payment Error on Clause ${i}: ${err.message}`);
    }

    if (i < totalClauses - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log('\n📊 Fetching final session summary...');
  
  try {
    const resultsRes = await fetch(`${API_URL}/results/${sessionId}`);
    if (resultsRes.ok) {
      const finalData = await resultsRes.json();
      const sum = finalData.summary;
      
      console.log(`\n================= ANALYSIS COMPLETE =================`);
      console.log(` Total Clauses Run  : ${sum.analyzedCount} / ${sum.totalClauses}`);
      console.log(` CRITICAL Risks     : ${sum.criticalCount}`);
      console.log(` HIGH Risks         : ${sum.highCount}`);
      const actualCost = (sum.analyzedCount * Number(pricePerClause)).toFixed(4);
      console.log(` ---------------------------------------------------`);
      console.log(` 💲 Total Auth Spend : ${actualCost} USDC`);
      console.log(`=====================================================\n`);
    } else {
      console.log(`❌ Could not fetch final summary.`);
    }
  } catch (err) {
    console.log(`❌ Failed to retrieve summary: ${err.message}`);
  }

}

main().catch(err => {
  console.error('\nFatal Client Error:', err);
  process.exit(1);
});
