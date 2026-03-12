#!/usr/bin/env node

/**
 * Benchmark AI commit message generation across all installed Ollama models
 * and multiple diff inputs, outputting a matrix of results.
 *
 * Usage:
 *   node test-bench-ai-commit.js                                # all models, all diffs in ./test/diffs/
 *   node test-bench-ai-commit.js --filter 'llama|gemma'         # subset of models
 *   node test-bench-ai-commit.js --diffs ./test/diffs/01*.diff  # specific diff files
 *   OLLAMA_HOST=http://10.0.0.5:11434 node test-bench-ai-commit.js
 */

import { readFile, readdir } from 'node:fs/promises';
import { resolve, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIFFS_DIR = resolve(__dirname, 'test/diffs');
const OLLAMA_HOST = (process.env.OLLAMA_HOST || 'http://localhost:11434').replace(/\/+$/, '');
const COMPLETIONS_URL = `${OLLAMA_HOST}/v1/chat/completions`;
const MODELS_URL = `${OLLAMA_HOST}/api/tags`;

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

// ── Arg parsing ──────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let filter = null;
  const diffPaths = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--filter' && args[i + 1]) {
      filter = new RegExp(args[++i], 'i');
    } else if (args[i] === '--diffs') {
      // Collect all remaining args as diff paths
      while (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        diffPaths.push(args[++i]);
      }
    }
  }

  return { filter, diffPaths };
}

// ── Diff loading ─────────────────────────────────────────

async function loadDiffs(explicitPaths) {
  if (explicitPaths.length) {
    const diffs = [];
    for (const p of explicitPaths) {
      const full = resolve(p);
      const content = await readFile(full, 'utf-8');
      diffs.push({ name: basename(full, '.diff'), content });
    }
    return diffs;
  }

  // Load all .diff files from default directory
  const files = (await readdir(DEFAULT_DIFFS_DIR)).filter(f => f.endsWith('.diff')).sort();
  const diffs = [];
  for (const f of files) {
    const content = await readFile(resolve(DEFAULT_DIFFS_DIR, f), 'utf-8');
    diffs.push({ name: basename(f, '.diff'), content });
  }
  return diffs;
}

// ── Model listing ────────────────────────────────────────

async function getModels() {
  const res = await fetch(MODELS_URL);
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.models.map(m => m.name).sort();
}

// ── Message extraction ───────────────────────────────────

function extractMessage(choice) {
  if (!choice?.message) return null;
  const { content, reasoning } = choice.message;

  // Try content first, stripping <think> blocks
  if (content) {
    const stripped = content.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
    if (stripped) return stripped.replace(/^["']|["']$/g, '');
  }

  // content was empty — try the reasoning field (Ollama thinking models)
  if (reasoning) {
    const lines = reasoning.split('\n').map(l => l.trim()).filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (line.length <= 72 && !line.startsWith('-') && !line.startsWith('*') && !line.includes('?') && !line.toLowerCase().startsWith('so')) {
        return line.replace(/^["']|["']$/g, '');
      }
    }
  }

  return null;
}

// ── Single generation call ───────────────────────────────

async function generate(model, diff) {
  const maxDiffLen = 8000;
  const truncated = diff.length > maxDiffLen ? diff.slice(0, maxDiffLen) + '\n... (truncated)' : diff;
  const userContent = `Diff summary:\n(benchmark)\n\nFull diff:\n${truncated}`;

  const start = Date.now();
  let status, raw;
  try {
    const res = await fetch(COMPLETIONS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: DEFAULT_PROMPT },
          { role: 'user', content: userContent },
        ],
        max_tokens: 512,
        temperature: 0.3,
      }),
    });
    status = res.status;
    raw = await res.text();
  } catch (e) {
    return { ms: Date.now() - start, message: null, error: e.message };
  }
  const ms = Date.now() - start;

  if (status !== 200) {
    return { ms, message: null, error: `HTTP ${status}` };
  }

  try {
    const data = JSON.parse(raw);
    const choice = data.choices?.[0];
    const msg = extractMessage(choice);
    if (!msg) {
      const reason = choice?.finish_reason;
      return { ms, message: null, error: reason === 'length' ? 'truncated (thinking)' : 'empty' };
    }
    return { ms, message: msg, error: null };
  } catch (e) {
    return { ms, message: null, error: 'parse error' };
  }
}

// ── Main ─────────────────────────────────────────────────

async function main() {
  const { filter, diffPaths } = parseArgs();

  console.log(`Ollama: ${OLLAMA_HOST}\n`);

  let models;
  try {
    models = await getModels();
  } catch (e) {
    console.error(`Failed to connect to Ollama at ${OLLAMA_HOST}: ${e.message}`);
    process.exit(1);
  }

  if (filter) {
    models = models.filter(m => filter.test(m));
  }

  if (!models.length) {
    console.log('No models matched.');
    process.exit(0);
  }

  const diffs = await loadDiffs(diffPaths);
  if (!diffs.length) {
    console.error(`No .diff files found in ${DEFAULT_DIFFS_DIR}`);
    process.exit(1);
  }

  console.log(`Models: ${models.join(', ')}`);
  console.log(`Diffs:  ${diffs.map(d => d.name).join(', ')}`);
  console.log(`Total:  ${models.length} × ${diffs.length} = ${models.length * diffs.length} calls\n`);

  // results[model][diffName] = { ms, message, error }
  const results = {};
  let done = 0;
  const total = models.length * diffs.length;

  for (const model of models) {
    results[model] = {};
    for (const diff of diffs) {
      done++;
      process.stdout.write(`\r  [${done}/${total}] ${model} × ${diff.name} ...`);
      process.stdout.write(' '.repeat(20)); // clear previous line remnants
      results[model][diff.name] = await generate(model, diff.content);
    }
  }
  process.stdout.write('\r' + ' '.repeat(80) + '\r');

  // ── Timing matrix ──────────────────────────────────────

  const modelWidth = Math.max(16, ...models.map(m => m.length)) + 2;
  const colWidth = Math.max(12, ...diffs.map(d => d.name.length)) + 2;

  console.log('═'.repeat(modelWidth + colWidth * diffs.length + 2));
  console.log('TIMING (ms)');
  console.log('═'.repeat(modelWidth + colWidth * diffs.length + 2));

  // Header
  process.stdout.write('Model'.padEnd(modelWidth));
  for (const d of diffs) process.stdout.write(d.name.padStart(colWidth));
  process.stdout.write('  avg\n');
  console.log('─'.repeat(modelWidth + colWidth * diffs.length + 6));

  for (const model of models) {
    process.stdout.write(model.padEnd(modelWidth));
    const times = [];
    for (const d of diffs) {
      const r = results[model][d.name];
      const cell = r.error ? 'ERR' : `${r.ms}`;
      process.stdout.write(cell.padStart(colWidth));
      if (!r.error) times.push(r.ms);
    }
    const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : '-';
    process.stdout.write(`${String(avg).padStart(6)}\n`);
  }

  // ── Message matrix ─────────────────────────────────────

  console.log('\n' + '═'.repeat(100));
  console.log('MESSAGES');
  console.log('═'.repeat(100));

  const indent = ' '.repeat(modelWidth + 4);
  for (const diff of diffs) {
    console.log(`\n── ${diff.name} ${'─'.repeat(Math.max(0, 95 - diff.name.length))}`);
    for (const model of models) {
      const r = results[model][diff.name];
      const tag = `  ${model.padEnd(modelWidth)}`;
      if (r.message) {
        // Split subject / body if multi-line
        const [subject, ...bodyLines] = r.message.split('\n');
        console.log(`${tag}${subject}`);
        const body = bodyLines.join('\n').trim();
        if (body) {
          for (const line of body.split('\n')) {
            console.log(`${indent}\x1b[2m${line}\x1b[0m`);
          }
        }
      } else {
        console.log(`${tag}[${r.error}]`);
      }
    }
  }

  // ── Summary stats ──────────────────────────────────────

  console.log('\n' + '═'.repeat(100));
  console.log('SUMMARY');
  console.log('═'.repeat(100));

  for (const model of models) {
    const runs = Object.values(results[model]);
    const ok = runs.filter(r => r.message);
    const times = ok.map(r => r.ms);
    const avg = times.length ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null;
    const successRate = `${ok.length}/${runs.length}`;
    const timing = avg ? `avg ${avg}ms` : 'n/a';
    console.log(`  ${model.padEnd(modelWidth)} ${successRate.padEnd(6)} ${timing}`);
  }
}

main().catch(e => {
  console.error('Unhandled error:', e);
  process.exit(1);
});
