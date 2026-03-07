import { gitExec } from './git.js';
import fs from 'fs';
import path from 'path';

// ── Metric types ──────────────────────────────────────────

class Counter {
  constructor(name, help, labelNames = []) {
    this.name = name;
    this.help = help;
    this.labelNames = labelNames;
    this.values = new Map();
  }

  inc(labelsOrValue, value) {
    if (this.labelNames.length === 0) {
      const v = typeof labelsOrValue === 'number' ? labelsOrValue : 1;
      this.values.set('', (this.values.get('') || 0) + v);
    } else {
      const labels = labelsOrValue || {};
      const key = this._key(labels);
      const v = typeof value === 'number' ? value : 1;
      this.values.set(key, (this.values.get(key) || 0) + v);
    }
  }

  _key(labels) {
    return this.labelNames.map(n => `${n}="${labels[n] || ''}"`).join(',');
  }

  collect() {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} counter`];
    if (this.values.size === 0) {
      const suffix = this.labelNames.length > 0
        ? `{${this.labelNames.map(n => `${n}=""`).join(',')}}`
        : '';
      lines.push(`${this.name}${suffix} 0`);
    } else {
      for (const [key, val] of this.values) {
        const suffix = key ? `{${key}}` : '';
        lines.push(`${this.name}${suffix} ${val}`);
      }
    }
    return lines.join('\n');
  }
}

class Gauge {
  constructor(name, help, labelNames = []) {
    this.name = name;
    this.help = help;
    this.labelNames = labelNames;
    this.values = new Map();
  }

  set(labelsOrValue, value) {
    if (this.labelNames.length === 0) {
      this.values.set('', typeof labelsOrValue === 'number' ? labelsOrValue : 0);
    } else {
      const labels = labelsOrValue || {};
      const key = this._key(labels);
      this.values.set(key, typeof value === 'number' ? value : 0);
    }
  }

  _key(labels) {
    return this.labelNames.map(n => `${n}="${labels[n] || ''}"`).join(',');
  }

  collect() {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} gauge`];
    if (this.values.size === 0) {
      const suffix = this.labelNames.length > 0
        ? `{${this.labelNames.map(n => `${n}=""`).join(',')}}`
        : '';
      lines.push(`${this.name}${suffix} 0`);
    } else {
      for (const [key, val] of this.values) {
        const suffix = key ? `{${key}}` : '';
        lines.push(`${this.name}${suffix} ${val}`);
      }
    }
    return lines.join('\n');
  }
}

class Histogram {
  constructor(name, help, buckets = []) {
    this.name = name;
    this.help = help;
    this.buckets = buckets.sort((a, b) => a - b);
    this.counts = new Array(this.buckets.length).fill(0);
    this.sum = 0;
    this.count = 0;
  }

  observe(value) {
    this.sum += value;
    this.count++;
    for (let i = 0; i < this.buckets.length; i++) {
      if (value <= this.buckets[i]) {
        this.counts[i]++;
      }
    }
  }

  collect() {
    const lines = [`# HELP ${this.name} ${this.help}`, `# TYPE ${this.name} histogram`];
    let cumulative = 0;
    for (let i = 0; i < this.buckets.length; i++) {
      cumulative += this.counts[i];
      lines.push(`${this.name}_bucket{le="${this.buckets[i]}"} ${cumulative}`);
    }
    lines.push(`${this.name}_bucket{le="+Inf"} ${this.count}`);
    lines.push(`${this.name}_sum ${this.sum}`);
    lines.push(`${this.name}_count ${this.count}`);
    return lines.join('\n');
  }
}

// ── Registry ──────────────────────────────────────────────

const registry = [];

function registerMetric(metric) {
  registry.push(metric);
  return metric;
}

// ── Defined metrics ───────────────────────────────────────

// Push metrics
export const pushTotal = registerMetric(
  new Counter('havc_cloud_sync_push_total', 'Total cloud sync pushes', ['status', 'reason'])
);
export const pushDuration = registerMetric(
  new Histogram('havc_cloud_sync_push_duration_seconds', 'Push duration in seconds', [1, 5, 15, 30, 60, 120])
);
export const lastPushTimestamp = registerMetric(
  new Gauge('havc_cloud_sync_last_push_timestamp_seconds', 'Timestamp of last push')
);

// Commit + diff metrics
export const autoCommitsTotal = registerMetric(
  new Counter('havc_auto_commits_total', 'Total auto-commits')
);
export const commitLinesAdded = registerMetric(
  new Counter('havc_commit_lines_added_total', 'Total lines added across commits')
);
export const commitLinesRemoved = registerMetric(
  new Counter('havc_commit_lines_removed_total', 'Total lines removed across commits')
);

// Watcher metrics
export const fileWatcherActive = registerMetric(
  new Gauge('havc_file_watcher_active', 'Whether file watcher is active')
);
export const fileChangeEvents = registerMetric(
  new Counter('havc_file_change_events_total', 'File change events by type', ['type'])
);

// Retention metrics
export const retentionCleanupTotal = registerMetric(
  new Counter('havc_retention_cleanup_total', 'Retention cleanups', ['status'])
);
export const retentionCleanupDuration = registerMetric(
  new Histogram('havc_retention_cleanup_duration_seconds', 'Retention cleanup duration', [1, 5, 15, 30, 60, 120])
);

// Operational metrics
export const processUptime = registerMetric(
  new Gauge('havc_process_uptime_seconds', 'Process uptime in seconds')
);
export const settingsSavesTotal = registerMetric(
  new Counter('havc_settings_saves_total', 'Total settings saves')
);
export const appInfo = registerMetric(
  new Gauge('havc_app_info', 'Application info', ['version', 'node_version'])
);

// Repo state metrics (cached)
export const gitCommitsTotal = registerMetric(
  new Gauge('havc_git_commits_total', 'Total git commits')
);
export const gitTrackedFiles = registerMetric(
  new Gauge('havc_git_tracked_files_total', 'Total tracked files')
);
export const gitRepoSize = registerMetric(
  new Gauge('havc_git_repo_size_bytes', 'Size of .git directory in bytes')
);

// ── Git query cache ───────────────────────────────────────

let gitCacheTimestamp = 0;
const GIT_CACHE_TTL = 60000; // 60 seconds

async function refreshGitCache() {
  const now = Date.now();
  if (now - gitCacheTimestamp < GIT_CACHE_TTL) return;

  const start = Date.now();
  try {
    // Commit count
    try {
      const { stdout } = await gitExec(['rev-list', '--count', 'HEAD']);
      gitCommitsTotal.set(parseInt(stdout.trim()) || 0);
    } catch {
      // No commits yet
    }

    // Tracked files count
    try {
      const { stdout } = await gitExec(['ls-files']);
      const count = stdout.trim() ? stdout.trim().split('\n').length : 0;
      gitTrackedFiles.set(count);
    } catch {
      // Ignore
    }

    // .git directory size
    try {
      const gitDir = path.join(global.CONFIG_PATH || '/config', '.git');
      const size = getDirSize(gitDir);
      gitRepoSize.set(size);
    } catch {
      // Ignore
    }

    gitCacheTimestamp = now;
    console.log(`[metrics] Git query cache refreshed (${Date.now() - start}ms)`);
  } catch {
    // Ignore cache refresh errors
  }
}

function getDirSize(dirPath) {
  let total = 0;
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += getDirSize(fullPath);
      } else {
        try {
          total += fs.statSync(fullPath).size;
        } catch {
          // Skip inaccessible files
        }
      }
    }
  } catch {
    // Ignore
  }
  return total;
}

// ── Collect all metrics ───────────────────────────────────

export async function collectMetrics() {
  // Update dynamic gauges
  processUptime.set(Math.floor(process.uptime()));
  await refreshGitCache();

  return registry.map(m => m.collect()).join('\n\n') + '\n';
}

// Initialize app info on import
appInfo.set({ version: '1.1.1', node_version: process.version }, 1);

console.log(`[metrics] Registry initialized with ${registry.length} metrics`);

/**
 * Classify a push error into a reason category.
 */
export function classifyPushError(errorMessage) {
  const msg = (errorMessage || '').toLowerCase();
  if (msg.includes('non-fast-forward') || msg.includes('fetch first') || msg.includes('rejected')) {
    return 'non_fast_forward';
  }
  if (msg.includes('authentication') || msg.includes('auth') || msg.includes('permission') || msg.includes('403') || msg.includes('401')) {
    return 'auth';
  }
  if (msg.includes('could not resolve') || msg.includes('connection') || msg.includes('network') || msg.includes('timeout') || msg.includes('unable to access')) {
    return 'network';
  }
  return 'other';
}
