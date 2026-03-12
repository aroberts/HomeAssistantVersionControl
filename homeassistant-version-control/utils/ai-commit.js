import { gitDiff } from './git.js';
import { aiCommitFailures } from './metrics.js';
import { log } from './log.js';

const DEFAULT_PROMPT = [
  'You are a commit message generator for a Home Assistant configuration repository.',
  'Given a git diff, write a commit message with a short subject line and a longer body.',
  '',
  'Format:',
  '<subject line — max 72 characters, summarizing WHAT changed>',
  '',
  '<body — a few sentences explaining the changes in more detail>',
  '',
  'Rules:',
  '- The subject should be concise and focus on WHAT changed',
  '  (e.g. "Add garage door open alert automation")',
  '- Do not use conventional commit prefixes (feat:, fix:, etc.)',
  '- The body should explain WHY or provide context for the changes',
  '- Mention specific entities, automations, or scripts by name when relevant',
  '- Do not mention file paths unless they add clarity',
  '- Output ONLY the commit message (subject + blank line + body), nothing else',
].join('\n');

let config = null;

/**
 * Extract the commit message from a chat completion choice.
 * Handles normal content, <think> blocks in content, and the
 * separate `reasoning` field used by Ollama thinking models.
 */
function extractCommitMessage(choice) {
  if (!choice?.message) return null;
  const { content, reasoning } = choice.message;

  // Try content first, stripping <think> blocks
  if (content) {
    const stripped = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    if (stripped) return stripped.replace(/^["']|["']$/g, '');
  }

  // content was empty — try the reasoning field as a last resort.
  // Thinking models sometimes put everything in reasoning and never fill content.
  if (reasoning) {
    const lines = reasoning.split('\n').map(l => l.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (line.length <= 72 && !line.startsWith('-') && !line.startsWith('*') && !line.includes('?')) {
        return line.replace(/^["']|["']$/g, '');
      }
    }
  }

  return null;
}

export function initAiCommit() {
  const enabled = process.env.AI_GENERATE_COMMIT_MESSAGES === 'true';
  if (!enabled) {
    log.info('[ai-commit] Disabled (AI_GENERATE_COMMIT_MESSAGES != true)');
    config = null;
    return;
  }

  const baseUrl = process.env.AI_BASE_URL;
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL;
  const prompt = process.env.AI_PROMPT || DEFAULT_PROMPT;

  if (!baseUrl) {
    log.warn('[ai-commit] Enabled but AI_BASE_URL is not set — will fall back to simple messages');
    config = null;
    return;
  }

  if (!model) {
    log.warn('[ai-commit] Enabled but AI_MODEL is not set — will fall back to simple messages');
    config = null;
    return;
  }

  // API key is optional for local providers (Ollama, etc.)
  if (!apiKey) {
    log.info('[ai-commit] No API key set — assuming local provider (Ollama, Open WebUI, etc.)');
  }

  const url = baseUrl.replace(/\/+$/, '') + '/chat/completions';

  config = { url, apiKey, model, prompt };
  log.info(`[ai-commit] Enabled — model: ${config.model}, endpoint: ${config.url}`);
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
        max_tokens: 512,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`AI API ${response.status}: ${body}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];
    const cleaned = extractCommitMessage(choice);

    if (!cleaned) {
      throw new Error(`Empty response from ${config.url}`);
    }
    log.info(`[ai-commit] Generated: ${cleaned}`);
    return cleaned;
  } catch (error) {
    log.warn(`[ai-commit] Failed to generate message: ${error.message}`);
    aiCommitFailures.inc();
    return fallbackMessage;
  }
}
