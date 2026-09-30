// Unit tests never touch the network. Tests that need HTTP pass their own fetch to
// createClient({ global: { fetch } }).
import { vi } from 'vitest'

vi.stubGlobal('fetch', () => Promise.reject(new Error('network disabled in unit tests')))
