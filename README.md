# LexiPay 🏛️⚡

> AI-powered legal contract risk analyzer with per-clause x402 micropayments via @x402/express

## What it does

LexiPay analyzes legal contracts clause by clause, flagging risks (LIABILITY, IP_OWNERSHIP, CONFIDENTIALITY, etc.) and charging a small USDC fee per clause analyzed — automatically, using the x402 payment protocol over Base Sepolia.

**No more signing up for expensive legal review services. Pay only for what you analyze.**

---

## Demo

```bash
npm start                                    # Start the server
node src/client.js sample-contract.txt       # Analyze a contract
curl.exe http://localhost:3001/results/<id>  # View full results JSON
```

Sample output:
```
Clause 4 — CRITICAL (LIABILITY)
  Contractor's total liability capped at $1 regardless of damages.
  Rec: Negotiate a reasonable liability cap tied to contract value.
  Tx: 0x6e709446b33ae3d...
```

---

## Tech Stack

| Layer | Tech |
|-------|------|
| AI Analysis | Groq (llama-3.3-70b-versatile) |
| Payments | @x402/express + x402 protocol |
| Payment Network | Base Sepolia (USDC) |
| Smart Contract | Solidity 0.8.24 on Avalanche Fuji |
| Backend | Node.js + Express |
| Database | SQLite (better-sqlite3) |
| CLI Client | Node.js + @x402/fetch |

---

## x402 Integration

Each clause analysis hits a payment-gated endpoint:

```
POST /analyze/:sessionId/:clauseIndex
```

The x402 middleware:
1. Returns `402 Payment Required` if no payment header
2. Client auto-pays using `wrapFetchWithPayment`
3. Server verifies payment, runs AI analysis, returns result with tx hash

**Price:** `0.001 USDC per clause`

---

## Setup

### Prerequisites
- Node.js 18+
- MetaMask wallet with Base Sepolia USDC
- Groq API key (free at console.groq.com)

### Install
```bash
git clone https://github.com/DivyanshuRaj7/lexipay.git
cd lexipay
npm install
```

### Configure `.env`
```bash
AI_BASE_URL=https://api.groq.com/openai/v1
AI_API_KEY=gsk_your_groq_key
AI_MODEL=llama-3.3-70b-versatile

EVM_PRIVATE_KEY=your_64_char_private_key
PAY_TO_ADDRESS=0xYourWalletAddress
FACILITATOR_URL=https://x402.org/facilitator
PRICE_PER_CLAUSE=0.001

PORT=3001
```

### Run
```bash
npm start
node src/client.js sample-contract.txt
```

---

## API Endpoints

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| GET | `/health` | Free | Server status + pricing |
| GET | `/info` | Free | Project info |
| POST | `/upload` | Free | Upload contract, get session ID |
| POST | `/analyze/:sessionId/:clauseIndex` | **x402 Payment** | Analyze one clause |
| GET | `/results/:sessionId` | Free | Get all results for session |

---

## Smart Contract

**LexPayRegistry** — logs review sessions on-chain

- Network: Avalanche Fuji Testnet
- Contract Address: `<CONTRACT_ADDRESS>`
- [View on Snowtrace](https://testnet.snowtrace.io/address/<CONTRACT_ADDRESS>)

Key function:
```solidity
function logReview(
    uint256 clauseCount,
    uint256 criticalCount,
    uint256 highCount,
    string calldata documentHash
) external payable
```

---

## Project Structure

```
lexipay/
├── src/
│   ├── server.js       # Express server with x402 payment gate
│   ├── client.js       # CLI client with auto-payment
│   ├── analyzer.js     # AI clause risk analysis (Groq)
│   ├── extractor.js    # PDF/TXT clause extraction
│   └── db.js           # SQLite session + results storage
├── contracts/
│   └── LexPayRegistry.sol
├── scripts/
│   └── deploy.cjs
├── sample-contract.txt
└── README.md
```

---

## Risk Severity Levels

| Level | Description |
|-------|-------------|
| 🔴 CRITICAL | Immediate legal/financial danger |
| 🟠 HIGH | Significant risk, needs negotiation |
| 🟡 MEDIUM | Moderate concern, review recommended |
| 🟢 LOW | Minor issue, informational |

---

## Team

Built at **Vibe-A-Thon** — Heritage Institute of Technology, March 14, 2026
