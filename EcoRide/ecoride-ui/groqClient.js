require('dotenv').config();

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

// Free-plan chat models (per Groq's rate-limit docs): openai/gpt-oss-120b,
// openai/gpt-oss-20b, qwen/qwen3.8-27b. Each model has its OWN rate-limit
// bucket (30 requests/min, 8K tokens/min, 1K requests/day), so when one is
// rate-limited we fall through to the next. Model names change often:
// override with GROQ_MODELS=model1,model2 in .env without touching code.
const DEFAULT_MODELS = 'openai/gpt-oss-120b,openai/gpt-oss-20b';

function modelChain() {
    const raw = process.env.GROQ_MODELS || process.env.GROQ_MODEL || DEFAULT_MODELS;
    return raw.split(',').map(s => s.trim()).filter(Boolean);
}

class GroqError extends Error {
    constructor(message, status, retryAfter) {
        super(message);
        this.name = 'GroqError';
        this.status = status || 0;
        this.retryAfter = retryAfter || 0;
    }
}

/**
 * Sends a chat completion request and returns { content, model }.
 *
 * opts.messages        [{role, content}]
 * opts.schema          optional JSON schema -> strict structured output
 * opts.schemaName      name for the schema
 * opts.maxTokens       cap on completion tokens (reasoning tokens count too)
 * opts.temperature
 * opts.reasoningEffort 'low' | 'medium' | 'high' (gpt-oss); dropped automatically
 *                      if a model rejects the parameter
 * opts.fetchImpl, opts.sleep   injectable for testing
 */
async function chat(opts) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
        throw new GroqError('GROQ_API_KEY is not set in .env', 401);
    }

    const fetchImpl = opts.fetchImpl || fetch;
    const sleep = opts.sleep || (ms => new Promise(r => setTimeout(r, ms)));
    const models = modelChain();

    let lastErr = null;
    let rateLimited = null;

    for (const model of models) {
        let useReasoning = !!opts.reasoningEffort;

        for (let attempt = 0; attempt < 2; attempt++) {
            const body = {
                model,
                messages: opts.messages,
                temperature: opts.temperature ?? 0.1,
                max_completion_tokens: opts.maxTokens ?? 1000
            };
            if (useReasoning) body.reasoning_effort = opts.reasoningEffort;
            if (opts.schema) {
                body.response_format = {
                    type: 'json_schema',
                    json_schema: { name: opts.schemaName || 'result', strict: true, schema: opts.schema }
                };
            }

            let res;
            try {
                res = await fetchImpl(GROQ_URL, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify(body)
                });
            } catch (e) {
                lastErr = new GroqError('Could not reach Groq: ' + e.message, 0);
                break; // try the next model
            }

            if (res.ok) {
                const data = await res.json();
                const choice = data && data.choices && data.choices[0];
                const content = choice && choice.message && choice.message.content;
                if (content && content.trim()) {
                    return { content: content.trim(), model };
                }
                lastErr = new GroqError(
                    `Groq returned no content (finish_reason: ${choice && choice.finish_reason})`, 502);
                break;
            }

            const text = await res.text().catch(() => '');

            if (res.status === 401 || res.status === 403) {
                throw new GroqError('Groq rejected the API key. Check GROQ_API_KEY in .env.', res.status);
            }
            if (res.status === 429) {
                const ra = parseFloat(res.headers && res.headers.get ? res.headers.get('retry-after') : 0) || 0;
                rateLimited = { retryAfter: ra };
                lastErr = new GroqError('Groq rate limit reached', 429, ra);
                break; // next model has its own bucket
            }
            if (res.status === 400 && useReasoning && /reasoning/i.test(text)) {
                useReasoning = false; // model doesn't accept reasoning_effort: retry without it
                continue;
            }
            lastErr = new GroqError(`Groq error ${res.status}: ${text.slice(0, 200)}`, res.status);
            break; // 404 (retired model), 5xx, other 400s: try the next model
        }
    }

    // Every model failed. If we were rate-limited and the wait is short, wait once and retry.
    if (rateLimited && rateLimited.retryAfter > 0 && rateLimited.retryAfter <= 8 && !opts._retried) {
        await sleep(rateLimited.retryAfter * 1000);
        return chat({ ...opts, _retried: true });
    }
    if (rateLimited) {
        throw new GroqError('Groq rate limit reached', 429, rateLimited.retryAfter);
    }
    throw lastErr || new GroqError('Groq request failed', 0);
}

module.exports = { chat, GroqError, modelChain };
