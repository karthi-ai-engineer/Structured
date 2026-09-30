import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from '@/App'
import { RootErrorBoundary } from '@/components/RootErrorBoundary'
import { applyTheme, readCachedTheme } from '@/platform/theme'
import '@/styles/index.css'

// The theme cached on this device applies before the first paint; ThemeSync takes over once
// the synced setting loads.
applyTheme(readCachedTheme())

const container = document.getElementById('root')
if (!container) {
  throw new Error('Root element #root is missing from index.html')
}

createRoot(container).render(
  <StrictMode>
    <RootErrorBoundary>
      <App />
    </RootErrorBoundary>
  </StrictMode>,
)
