export class Semaphore {
  constructor(limit = 1) { this.limit = Math.max(1, Number(limit) || 1); this.active = 0; this.queue = []; }
  async acquire(signal) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (this.active < this.limit) { this.active += 1; return this.release.bind(this); }
    return new Promise((resolve, reject) => {
      const item = { resolve, reject, signal };
      const onAbort = () => { this.queue = this.queue.filter((queued) => queued !== item); reject(new DOMException('Aborted', 'AbortError')); };
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
      this.queue.push(item);
    });
  }
  release() {
    this.active = Math.max(0, this.active - 1);
    const next = this.queue.shift();
    if (!next) return;
    if (next.signal?.aborted) { next.reject(new DOMException('Aborted', 'AbortError')); this.release(); return; }
    this.active += 1; next.resolve(this.release.bind(this));
  }
}
