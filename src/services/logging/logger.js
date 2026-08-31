export class Logger {
  constructor(prefix = 'NovelAI') { this.prefix = prefix; }
  write(level, message, meta = {}) {
    const safeMeta = { ...meta };
    for (const key of ['apiKey', 'prompt', 'sourceText', 'chat', 'content']) if (key in safeMeta) delete safeMeta[key];
    const line = `[${new Date().toISOString()}] ${message}`;
    (console[level] || console.log)(this.prefix, line, safeMeta);
  }
  info(message, meta) { this.write('info', message, meta); }
  warn(message, meta) { this.write('warn', message, meta); }
  error(message, meta) { this.write('error', message, meta); }
}
