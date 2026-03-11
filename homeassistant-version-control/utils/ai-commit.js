import { gitDiff } from './git.js';
import { aiCommitFailures } from './metrics.js';

const DEFAULT_PROMPT = [
  'You are a commit message generator for a Home Assistant configuration repository.',
  'Given a git diff, write a concise commit message summarizing the changes.',
  'Focus on WHAT changed (e.g. "Update automation for porch lights", "Add new script for morning routine").',
  'Do not use conventional commit prefixes. Do not mention file paths unless they add clarity.',
  'Output ONLY the commit message, nothing else. Keep it under 72 characters.',
].join(' ');

let config = null;

export function initAiCommit() {
  const enabled = process.env.AI_GENERATE_COMMIT_MESSAGES === 'true';
  if (!enabled) {
    console.log('[ai-commit] Disabled (AI_GENERATE_COMMIT_MESSAGES != true)');
    config = null;
    return;
  }

  const baseUrl = process.env.AI_BASE_URL;
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;
  const prompt = process.env.AI_PROMPT || DEFAULT_PROMPT;

  if (!baseUrl) {
    console.warn('[ai-commit] Enabled but AI_BASE_URL is not set — will fall back to simple messages');
    config = null;
    return;
  }

  if (!model) {
    console.warn('[ai-commit] Enabled but AI_MODEL is not set — will fall back to simple messages');
    config = null;
    return;
  }

  // API key is optional for local providers (Ollama, etc.)
  if (!apiKey) {
    console.log('[ai-commit] No API key set — assuming local provider (Ollama, Open WebUI, etc.)');
  }

  const url = baseUrl.replace(/\/+$/, '') + '/chat/completions';

  config = { url, apiKey, model, prompt };
  console.log(`[ai-commit] Enabled — model: ${config.model}, endpoint: ${config.url}`);
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

    const headers = { 'Content-Type': 'application/json' };
    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`;
    }

    const response = await fetch(config.url, {
      method: 'POST',
      headers,
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
      throw new Error(`AI API ${response.status}: ${body}`);
    }

    const data = await response.json();
    const message = data.choices?.[0]?.message?.content?.trim();

    if (!message) {
      throw new Error(`Empty response from ${config.url}`);
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
