import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

const root = createRoot(document.getElementById('root')!)

// Note: no StrictMode — its dev double-mount restarts the Three.js animation
// mixers and fights the imperative animation state machine in CreatureModel.
if (import.meta.env.DEV && new URLSearchParams(location.search).has('studio')) {
  // dev tool: renders public/portraits/*.webp (see src/dev/PortraitStudio.tsx)
  import('./dev/PortraitStudio').then(({ PortraitStudio }) => root.render(<PortraitStudio />))
} else {
  root.render(<App />)
}
