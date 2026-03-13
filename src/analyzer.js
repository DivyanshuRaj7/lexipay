import dotenv from 'dotenv';
import OpenAI from 'openai';

// Load environment variables
dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.AI_API_KEY,
  baseURL: process.env.AI_BASE_URL,
});

const model = process.env.AI_MODEL;

const SYSTEM_PROMPT = `You are an expert legal contract reviewer. Analyze the given contract clause and identify risks. 
Respond ONLY with valid JSON in this exact format:
{
  "severity": "LOW|MEDIUM|HIGH|CRITICAL",
  "risk_type": "LIABILITY|PAYMENT|TERMINATION|IP_OWNERSHIP|CONFIDENTIALITY|INDEMNITY|GOVERNING_LAW|OTHER",
  "explanation": "1-2 sentence explanation of the risk",
  "recommendation": "One sentence recommendation"
}
Be strict. Err on the side of flagging risks rather than missing them.`;

// Sleep helper function for rate limiting
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Analyzes a single contract clause using an OpenAI-compatible API.
 * 
 * @param {string} clauseText - The text of the clause to analyze.
 * @param {number} clauseIndex - The index of the clause.
 * @returns {Promise<Object>} The analysis result.
 */
export async function analyzeClause(clauseText, clauseIndex) {
  try {
    const response = await openai.chat.completions.create({
      model: model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: clauseText }
      ],
      response_format: { type: 'json_object' }
    });

    const content = response.choices[0].message.content;
    const parsed = JSON.parse(content);

    return {
      index: clauseIndex,
      clause: clauseText,
      severity: parsed.severity,
      risk_type: parsed.risk_type,
      explanation: parsed.explanation,
      recommendation: parsed.recommendation
    };
  } catch (error) {
    console.error(`Error analyzing clause ${clauseIndex}:`, error.message);
    // Fallback if parsing fails or API errors out
    return {
      index: clauseIndex,
      clause: clauseText,
      severity: "LOW",
      risk_type: "OTHER",
      explanation: "Could not analyze",
      recommendation: ""
    };
  }
}

/**
 * Analyzes an array of contract clauses sequentially with a delay to respect rate limits.
 * 
 * @param {string[]} clauses - Array of clause strings.
 * @returns {Promise<Object[]>} Array of analysis results.
 */
export async function analyzeAllClauses(clauses) {
  const results = [];
  
  for (let i = 0; i < clauses.length; i++) {
    const result = await analyzeClause(clauses[i], i);
    results.push(result);
    
    // Add 300ms delay between calls (except after the very last clause)
    if (i < clauses.length - 1) {
      await sleep(300);
    }
  }
  
  return results;
}
