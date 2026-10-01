import { Zap } from 'lucide-react'
import { dayEnergy, energyStatus } from '@/core/energy'
import type { Task } from '@/core/tasks'
import { cn } from '@/lib/utils'

const TONES = {
  ok: 'border-green-600/30 bg-green-600/10 text-green-700 dark:text-green-400',
  high: 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400',
  over: 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400',
} as const

const WORDS = { ok: 'within', high: 'close to', over: 'over' } as const

/** A day's energy against the limit (PLAN.md E1): green, then orange, then red. */
export function EnergyChip({
  tasks,
  limit,
  compact = false,
}: {
  tasks: readonly Task[]
  limit: number
  compact?: boolean
}) {
  const used = dayEnergy(tasks)
  const status = energyStatus(used, limit)
  return (
    <span
      role="status"
      aria-label={`Energy ${used} of ${limit}: ${WORDS[status]} your limit`}
      title="Energy used / daily limit"
      className={cn(
        'inline-flex items-center gap-1 rounded-full border font-medium tabular-nums',
        compact ? 'px-1.5 text-[11px]' : 'px-2.5 py-0.5 text-xs',
        TONES[status],
      )}
    >
      <Zap className={compact ? 'size-3' : 'size-3.5'} />
      {used}/{limit}
    </span>
  )
}
