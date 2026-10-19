'use strict';

/**
 * agent/extract-granite.js
 *
 * Watsonx.ai Granite extractor.
 * Only active when WATSONX_APIKEY, WATSONX_PROJECT_ID and WATSONX_URL are set.
 * On any error (missing keys, network, bad JSON) it falls back to extract-fallback.js.
 *
 * extract(message, currentSpec) → partialSpec
 */

const { extract: fallbackExtract } = require('./extract-fallback.js');

const REQUIRED_ENV = ['WATSONX_APIKEY', 'WATSONX_PROJECT_ID', 'WATSONX_URL'];

function isConfigured() {
  return REQUIRED_ENV.every(k => process.env[k] && process.env[k].trim());
}

/**
 * Build an IAM bearer token from the API key.
 * Caches the token for 50 minutes.
 */
let _tokenCache = null;
let _tokenExpiry = 0;

async function getBearerToken() {
  if (_tokenCache && Date.now() < _tokenExpiry) return _tokenCache;

  const body = new URLSearchParams({
    grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
    apikey: process.env.WATSONX_APIKEY,
  });

  const resp = await fetch('https://iam.cloud.ibm.com/identity/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!resp.ok) throw new Error(`IAM token fetch failed: ${resp.status}`);
  const data = await resp.json();
  _tokenCache = data.access_token;
  _tokenExpiry = Date.now() + 50 * 60 * 1000; // 50 min
  return _tokenCache;
}

const SYSTEM_PROMPT = `You are a storage sales assistant. Extract specification fields from the user's message.
Return ONLY valid JSON with these optional fields:
{
  "cap": number (TB),
  "capType": "effective"|"usable"|"raw"|"unsure",
  "conn": "fc32"|"fc64"|"iscsi25"|string[],
  "speed": "fc32"|"fc64"|"iscsi25"|"onboard"|"unsure",
  "fcPorts": number,
  "sanSw": "has"|"need"|"direct"|"unsure",
  "ec": 3|5,
  "ecLevel": "Basic"|"Advanced",
  "model": "FS5600"|"FS7600"|null,
  "_companyName": string,
  "_email": string,
  "_opportunityId": string
}
Omit fields you are not confident about. Return only the JSON object, nothing else.`;

async function extract(message, currentSpec) {
  if (!isConfigured()) {
    return fallbackExtract(message, currentSpec);
  }

  const modelId = process.env.WATSONX_MODEL_ID || 'ibm/granite-3-8b-instruct';
  const baseUrl = process.env.WATSONX_URL.replace(/\/$/, '');
  const projectId = process.env.WATSONX_PROJECT_ID;

  const url = `${baseUrl}/ml/v1/text/generation?version=2023-05-29`;

  const prompt = `${SYSTEM_PROMPT}\n\nUser message: ${message}\n\nJSON:`;

  try {
    const token = await getBearerToken();
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        model_id: modelId,
        input: prompt,
        parameters: {
          decoding_method: 'greedy',
          max_new_tokens: 300,
          stop_sequences: ['\n\n', '```'],
        },
        project_id: projectId,
      }),
    });

    if (!resp.ok) {
      console.warn(`[extract-granite] watsonx.ai returned ${resp.status}, falling back.`);
      return fallbackExtract(message, currentSpec);
    }

    const data = await resp.json();
    const generated = (data.results || [])[0]?.generated_text || '';

    // Extract JSON block from response
    const jsonMatch = generated.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[extract-granite] No JSON in response, falling back.');
      return fallbackExtract(message, currentSpec);
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate it's a plain object
    if (typeof parsed !== 'object' || Array.isArray(parsed)) {
      return fallbackExtract(message, currentSpec);
    }

    return parsed;
  } catch (err) {
    console.warn(`[extract-granite] Error: ${err.message}, falling back.`);
    return fallbackExtract(message, currentSpec);
  }
}

module.exports = { extract };
