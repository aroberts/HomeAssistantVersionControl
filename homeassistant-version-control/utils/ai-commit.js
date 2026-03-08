import { gitDiff } from './git.js';
import { aiCommitFailures } from './metrics.js';

const DEFAULT_MODEL = 'liquid/lfm-2.5-1.2b-thinking:free';
const DEFAULT_PROMPT = [
  'You are a commit message generator for a Home Assistant configuration repository.',
  'Given a git diff, write a concise commit message summarizing the changes.',
  'Focus on WHAT changed (e.g. "Update automation for porch lights", "Add new script for morning routine").',
  'Do not use conventional commit prefixes. Do not mention file paths unless they add clarity.',
  'Output ONLY the commit message, nothing else. Keep it under 72 characters.',
].join(' ');
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

let config = null;

export function initAiCommit() {
  const enabled = process.env.OPENROUTER_GENERATE_COMMIT_MESSAGES === 'true';
  if (!enabled) {
    console.log('[ai-commit] Disabled (OPENROUTER_GENERATE_COMMIT_MESSAGES != true)');
    config = null;
    return;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.warn('[ai-commit] Enabled but OPENROUTER_API_KEY is not set — will fall back to simple messages');
    config = null;
    return;
  }

  config = {
    apiKey,
    model: process.env.OPENROUTER_MODEL || DEFAULT_MODEL,
    prompt: process.env.OPENROUTER_PROMPT || DEFAULT_PROMPT,
  };

  console.log(`[ai-commit] Enabled with model: ${config.model}`);
}

export function isAiCommitEnabled() {
  return config !== null;
}

export async function generateAiCommitMessage(fallbackMessage) {
  if (!config) return fallbackMessage;

  try {
    const diff = await gitDiff(['--cached', '--stat']);
    const fullDiff = await gitDiff(['--cached']);

    // Truncate to avoid blowing up the context window on large commits
    const maxDiffLen = 8000;
    const truncatedDiff = fullDiff.length > maxDiffLen
      ? fullDiff.slice(0, maxDiffLen) + '\n... (diff truncated)'
      : fullDiff;

    const userContent = `Diff summary:\n${diff}\n\nFull diff:\n${truncatedDiff}`;

    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: 'system', content: config.prompt },
          { role: 'user', content: userContent },
        ],
        max_tokens: 100,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenRouter API ${response.status}: ${body}`);
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message?.content?.trim();

    if (!message) {
      throw new Error('Empty response from OpenRouter');
    }

    // Strip quotes if the model wraps the message in them
    const cleaned = message.replace(/^["']|["']$/g, '');
    console.log(`[ai-commit] Generated: ${cleaned}`);
    return cleaned;
  } catch (error) {
    console.warn(`[ai-commit] Failed to generate message: ${error.message}`);
    aiCommitFailures.inc();
    return fallbackMessage;
  }
}
