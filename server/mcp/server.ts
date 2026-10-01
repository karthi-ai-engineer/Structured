// Builds the MCP server (a fresh instance per request: the handler is stateless).

import { randomUUID } from 'node:crypto'
import { McpServer, createMcpHandler, type McpHttpHandler } from '@modelcontextprotocol/server'
import type { TaskStore } from '../store.ts'
import { registerPrompts } from './prompts.ts'
import { registerTools, type ToolDeps } from './tools.ts'

export const SERVER_INFO = { name: 'structured-planner', version: '0.2.0' } as const

const INSTRUCTIONS = [
  'Structured is the user’s personal day planner (a visual timeline of tasks, plus an inbox of undated tasks).',
  'Call get_context first: all dates are YYYY-MM-DD and times HH:mm (24-hour) in the user’s time zone, and durations are minutes.',
  'Before creating or changing tasks, show the user the plan and get their confirmation; use create_tasks with dry_run: true first.',
  'Every write returns a batch_id; undo_batch reverts it. Mention this after writing.',
].join(' ')

export function buildServer(deps: ToolDeps): McpServer {
  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS })
  registerTools(server, deps)
  registerPrompts(server)
  return server
}

/** The stateless HTTP handler. `store` is created lazily by the caller (per cold start). */
export function createHandler(
  getStore: () => TaskStore,
  clock: () => Date = () => new Date(),
): McpHttpHandler {
  return createMcpHandler(() => buildServer({ store: getStore(), now: clock, newId: randomUUID }))
}
