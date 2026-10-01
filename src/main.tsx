import { createRoot } from 'react-dom/client'
import '@fontsource/chakra-petch/600.css'
import '@fontsource/chakra-petch/700.css'
import '@fontsource-variable/exo-2'
import './index.css'
import App from './App.tsx'
import './settings'

const root = createRoot(document.getElementById('root')!)

// Note: no StrictMode — its dev double-mount restarts the Three.js animation
// mixers and fights the imperative animation state machine in CreatureModel.
const studio = import.meta.env.DEV ? new URLSearchParams(location.search).get('studio') : null
if (studio === 'og' || studio === 'icon') {
  // dev tool: renders public/og.jpg and the app icons (see src/dev/OgStudio.tsx)
  import('./dev/OgStudio').then(({ OgStudio }) => root.render(<OgStudio />))
} else if (studio !== null) {
  // dev tool: renders public/portraits/*.webp (see src/dev/PortraitStudio.tsx)
  import('./dev/PortraitStudio').then(({ PortraitStudio }) => root.render(<PortraitStudio />))
} else {
  root.render(<App />)
}
