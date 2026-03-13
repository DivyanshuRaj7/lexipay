import express from 'express';
import multer from 'multer';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

import { extractTextFromFile, splitIntoClauses, countClauses } from './extractor.js';
import { analyzeClause } from './analyzer.js';
import {
  createSession,
  saveClauseResult,
  markClausePaid,
  getClauseResult,
  getSessionResults,
  getSession
} from './db.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const PRICE_PER_CLAUSE = process.env.PRICE_PER_CLAUSE || '0.001';
const PAY_TO_ADDRESS = process.env.PAY_TO_ADDRESS;
const FACILITATOR_URL = process.env.FACILITATOR_URL;

app.use(express.json());

// Set up Multer for file uploads
const upload = multer({ dest: 'uploads/' });

// In-memory cache to hold clauses for active sessions to avoid re-parsing files
const sessionCache = new Map();

// Generate a mock or real payment middleware dynamically
let paymentMiddleware = (req, res, next) => next();

try {
  let middlewareFactory;
  try {
    const facinet = await import('facinet-sdk');
    middlewareFactory = facinet.x402Express || facinet.default?.x402Express;
    console.log('✅ Found facinet-sdk.');
  } catch (err) {
    console.log('⚠️ facinet-sdk not found, falling back to x402-express...');
    const x402 = await import('x402-express');
    middlewareFactory = x402.default || x402.x402Express || x402;
    console.log('✅ Found x402-express.');
  }
  
  if (middlewareFactory) {
    paymentMiddleware = middlewareFactory({
      amount: PRICE_PER_CLAUSE,
      payTo: PAY_TO_ADDRESS,
      facilitatorUrl: FACILITATOR_URL
    });
    console.log('✅ Payment middleware configured successfully.');
  } else {
    console.warn('⚠️ Could not extract payment middleware constructor from the imported module.');
  }
} catch (error) {
  console.warn('❌ Failed to load any payment middleware. Proceeding with a dummy passthrough middleware.', error.message);
  // Setting a fallback dummy middleware to avoid crashing
  paymentMiddleware = (req, res, next) => {
    // If we wanted to strictly mock 402 locally, we could do it here
    next();
  };
}

// ----------------------------------------------------
// Public Informational Endpoints
// ----------------------------------------------------

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    pricePerClause: PRICE_PER_CLAUSE,
    payToAddress: PAY_TO_ADDRESS
  });
});

app.get('/info', (req, res) => {
  res.json({
    name: 'LexPay',
    description: 'Legal tech payment and contract analysis platform',
    pricing: {
      unit: 'per clause',
      price: PRICE_PER_CLAUSE,
      currency: 'USDC' 
    }
  });
});

// ----------------------------------------------------
// Core Workflow Endpoints
// ----------------------------------------------------

/**
 * 1. Upload Contract (Free)
 * Extracts text, splits it, creates a DB session.
 */
app.post('/upload', upload.single('contract'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No contract file uploaded.' });
  }

  try {
    const filePath = req.file.path;
    const text = await extractTextFromFile(filePath, req.file.mimetype);
    const clauses = splitIntoClauses(text);
    const totalClauses = clauses.length;

    const sessionId = crypto.randomUUID();
    
    // Save session metadata
    createSession(sessionId, req.file.originalname, totalClauses);

    // Cache the extracted clauses in memory for subsequent API calls
    sessionCache.set(sessionId, { clauses, filePath });

    const estimatedTotal = (Number(PRICE_PER_CLAUSE) * totalClauses).toString();

    res.json({
      sessionId,
      filename: req.file.originalname,
      totalClauses,
      pricePerClause: PRICE_PER_CLAUSE,
      estimatedTotal
    });
  } catch (error) {
    console.error('Upload Error:', error);
    res.status(500).json({ error: 'Failed to process the uploaded file', details: error.message });
  }
});

/**
 * 2. Analyze Clause (PAID Route)
 * Uses x402 payment middleware to ensure monetization per run.
 */
app.post('/analyze/:sessionId/:clauseIndex', paymentMiddleware, async (req, res) => {
  const sessionId = req.params.sessionId;
  const clauseIndex = parseInt(req.params.clauseIndex, 10);

  // Transaction Hash from the payment middleware
  const txHash = req.x402Payment?.transactionHash || req.facinetPayment?.transactionHash || 'tx_mock_hash';
  console.log(`💰 Payment received for clause ${clauseIndex}, session ${sessionId}, tx: ${txHash}`);

  // 1. Check DB first — if already paid+analyzed, return cached result immediately
  const existingResult = getClauseResult(sessionId, clauseIndex);
  if (existingResult && existingResult.paid === 1) {
    return res.json({
      clauseIndex,
      clause: existingResult.clause_text,
      severity: existingResult.severity,
      risk_type: existingResult.risk_type,
      explanation: existingResult.explanation,
      recommendation: existingResult.recommendation,
      txHash: existingResult.tx_hash
    });
  }

  // 2. Check in-memory cache for clause text
  const cached = sessionCache.get(sessionId);
  if (!cached) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (clauseIndex < 0 || clauseIndex >= cached.clauses.length) {
    return res.status(400).json({ error: 'Invalid clause index' });
  }

  const clauseText = cached.clauses[clauseIndex];

  try {
    // 3. Perform OpenAI analysis
    const analysisResult = await analyzeClause(clauseText, clauseIndex);

    // Save and link the blockchain transaction
    if (!existingResult) {
      saveClauseResult(sessionId, analysisResult);
    }
    markClausePaid(sessionId, clauseIndex, txHash);

    // 4. Cleanup: if all clauses are now analyzed, free memory and delete file
    const session = getSession(sessionId);
    const allResults = getSessionResults(sessionId);
    const analyzedCount = allResults.filter(r => r.paid === 1).length;

    if (session && analyzedCount >= session.total_clauses) {
      try {
        if (cached.filePath && fs.existsSync(cached.filePath)) {
          fs.unlinkSync(cached.filePath);
        }
        sessionCache.delete(sessionId);
        console.log(`🧹 Session ${sessionId} cleanup complete`);
      } catch (cleanupErr) {
        console.warn(`⚠️ Cleanup failed for session ${sessionId}:`, cleanupErr.message);
      }
    }

    res.json({
      clauseIndex,
      clause: analysisResult.clause,
      severity: analysisResult.severity,
      risk_type: analysisResult.risk_type,
      explanation: analysisResult.explanation,
      recommendation: analysisResult.recommendation,
      txHash
    });
  } catch (err) {
    console.error(`Analysis failed for clause ${clauseIndex}:`, err);
    res.status(500).json({ error: 'Failed to analyze clause' });
  }
});

/**
 * 3. Fetch All Session Results (Free)
 * Summarizes the paid and completed clause analyses.
 */
app.get('/results/:sessionId', (req, res) => {
  const sessionId = req.params.sessionId;
  const session = getSession(sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const results = getSessionResults(sessionId);
  
  // Only return results that have actually been paid and analyzed
  const paidResults = results.filter(r => r.paid === 1);
  const criticalCount = paidResults.filter(r => r.severity === 'CRITICAL').length;
  const highCount = paidResults.filter(r => r.severity === 'HIGH').length;

  res.json({
    summary: {
      totalClauses: session.total_clauses,
      analyzedCount: paidResults.length,
      criticalCount,
      highCount
    },
    results: paidResults.map(r => ({
        clauseIndex: r.clause_index,
        clause: r.clause_text,
        severity: r.severity,
        risk_type: r.risk_type,
        explanation: r.explanation,
        recommendation: r.recommendation,
        txHash: r.tx_hash,
        analyzedAt: r.analyzed_at
    }))
  });
});

// Global error-handling middleware (must be after all routes)
app.use((err, req, res, next) => {
  console.error('Unhandled Error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`LexPay Server running on port ${PORT}`);
  console.log(`=========================================`);
  console.log('Registered Endpoints:');
  console.log('  GET  /health');
  console.log('  GET  /info');
  console.log('  POST /upload (Accepts "contract" file)');
  console.log('  POST /analyze/:sessionId/:clauseIndex (x402 Gated)');
  console.log('  GET  /results/:sessionId');
  console.log(`=========================================`);
});
