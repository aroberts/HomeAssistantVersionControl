const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const current = LEVELS[process.env.LOG_LEVEL?.toLowerCase()] ?? LEVELS.info;

function ts() {
  return new Date().toISOString();
}

export const log = {
  error: (...args) => { if (current >= LEVELS.error) console.error(`[${ts()}]`, ...args); },
  warn:  (...args) => { if (current >= LEVELS.warn)  console.warn(`[${ts()}]`, ...args); },
  info:  (...args) => { if (current >= LEVELS.info)  console.log(`[${ts()}]`, ...args); },
  debug: (...args) => { if (current >= LEVELS.debug) console.log(`[${ts()}]`, ...args); },
};
