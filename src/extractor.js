import fs from 'fs';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

/**
 * Extracts raw text from a given file path.
 * Supports PDF mapping and fallback to UTF-8 parsing.
 * 
 * @param {string} filePath - Absolute path to the file
 * @param {string} mimetype - The uploaded file's MIME type
 * @returns {Promise<string>} - Extracted text contents
 */
export async function extractTextFromFile(filePath, mimetype) {
  const isPdf = mimetype === 'application/pdf' || filePath.toLowerCase().endsWith('.pdf');
  
  if (isPdf) {
    const dataBuffer = await fs.promises.readFile(filePath);
    const data = await pdfParse(dataBuffer);
    return data.text;
  }
  
  // Fallback for txt or other raw text plain formats
  return await fs.promises.readFile(filePath, 'utf8');
}

/**
 * Splits contract text intelligently into individual clauses.
 * 
 * @param {string} text - The raw contract text
 * @returns {string[]} - Array of clause strings (max 50)
 */
export function splitIntoClauses(text) {
  if (!text) return [];

  // Normalize line endings
  const normalizedText = text.replace(/\r\n/g, '\n');

  // Split by:
  // 1. Two or more consecutive newlines (paragraph boundary)
  // 2. OR matching a specific keyword at the start of a newline (lookahead to preserve the keyword)
  // 3. OR matching a list marker (e.g. "1.", "a.", "iv.", "A.") at the start of a newline 
  const clauseDelimiters = /(?:\n\s*){2,}|(?=^(?:WHEREAS|NOW THEREFORE|The parties|Party|Contractor|Client|In the event|Notwithstanding|Subject to)\b)|(?=^\s*[a-zA-Z0-9]{1,4}\.\s)/mi;

  const rawSegments = normalizedText.split(clauseDelimiters);

  return rawSegments
    .map(segment => segment.trim())
    // Filter out clauses shorter than 30 characters
    .filter(segment => segment.length >= 30)
    // Maximum 50 clauses
    .slice(0, 50);
}

/**
 * Counts the valid clauses that would be identified in the text.
 * 
 * @param {string} text - The raw contract text
 * @returns {number} - Count of clauses
 */
export function countClauses(text) {
  return splitIntoClauses(text).length;
}
