import type { JobClass } from '@dn/server'

const ORDER: Record<JobClass, number> = { interactive: 0, fresh: 1, backfill: 2 }

/**
 * In-process concurrency cap for inference calls, served in priority order.
 * pg-boss priorities decide which job runs next; this decides who gets the GPU next,
 * with separate limits for embeddings and generation.
 */
export class PriorityLimiter {
  private active = 0
  private waiting: { cls: JobClass; seq: number; resolve: () => void }[] = []
  private seq = 0

  constructor(readonly limit: number) {}

  async run<T>(cls: JobClass, fn: () => Promise<T>): Promise<T> {
    if (this.active < this.limit) {
      this.active++
    } else {
      // The releasing caller hands its slot over directly, so `active` never overshoots.
      await new Promise<void>((resolve) => {
        this.waiting.push({ cls, seq: this.seq++, resolve })
        this.waiting.sort((a, b) => ORDER[a.cls] - ORDER[b.cls] || a.seq - b.seq)
      })
    }
    try {
      return await fn()
    } finally {
      const next = this.waiting.shift()
      if (next) next.resolve()
      else this.active--
    }
  }
}

export interface Gpu {
  embeddings: PriorityLimiter
  generation: PriorityLimiter
}
