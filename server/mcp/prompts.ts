// MCP prompts (PLAN.md section 10.5): ready-made instructions a Claude client offers as templates
// or slash commands. They describe the workflow; the tools do the work.

import type { McpServer } from '@modelcontextprotocol/server'
import { z } from 'zod'

const user = (text: string) => ({
  messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }],
})

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    'plan_day',
    {
      title: 'Plan my day',
      description:
        'Build a time-blocked plan for a day from the inbox, overdue work and free time.',
      argsSchema: z.object({
        date: z.string().optional().describe('YYYY-MM-DD; default tomorrow'),
        focus: z.string().optional().describe('What matters most that day'),
      }),
    },
    ({ date, focus }) =>
      user(
        [
          `Plan ${date ? `my day on ${date}` : 'tomorrow'} in my Structured planner.${focus ? ` Focus: ${focus}.` : ''}`,
          '',
          '1. Call get_context (today, time zone, day hours, defaults). Then get_schedule for the day, list_inbox, list_overdue and find_free_slots.',
          '2. Propose a realistic time-blocked plan inside my day hours: keep existing tasks, put deep work early, add short breaks between long blocks, do not overbook, and pull from the inbox and overdue items where they fit. Give each block a fitting icon and color.',
          '3. Show the plan as a table (time, task, duration) and ask me to confirm or adjust. Do not write anything yet.',
          '4. After I confirm: call create_tasks with dry_run: true, mention any warnings, then call create_tasks for real (and move_tasks for overdue items you rescheduled).',
          '5. Finish with a one-line summary and the batch_id(s), and say that undo_batch can revert them.',
        ].join('\n'),
      ),
  )

  server.registerPrompt(
    'replan_overdue',
    {
      title: 'Replan overdue tasks',
      description: 'Reschedule unfinished past tasks into free time.',
    },
    () =>
      user(
        [
          'Help me replan my overdue tasks in my Structured planner.',
          '',
          '1. Call get_context and list_overdue.',
          '2. For each overdue task, suggest one option: a free slot today or in the next days (use find_free_slots), the inbox (date null), done, or delete. Show the suggestions as a table and ask me to confirm.',
          '3. After I confirm, apply them: move_tasks for reschedules and inbox moves, set_completion for done, delete_tasks for deletions.',
          '4. Summarize the result with the batch_id(s) and say that undo_batch can revert them.',
        ].join('\n'),
      ),
  )
}
