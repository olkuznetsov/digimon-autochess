import { createRoot } from 'react-dom/client'
// display: Dela Gothic One; body: M PLUS Rounded 1c — Latin and Cyrillic from fontsource,
// the Japanese the labels use subset into public/fonts by scripts/jp-fonts.mjs (fonts.css)
import '@fontsource/dela-gothic-one/latin-400.css'
import '@fontsource/dela-gothic-one/latin-ext-400.css'
import '@fontsource/dela-gothic-one/cyrillic-400.css'
import '@fontsource/m-plus-rounded-1c/latin-500.css'
import '@fontsource/m-plus-rounded-1c/latin-800.css'
import '@fontsource/m-plus-rounded-1c/latin-900.css'
import '@fontsource/m-plus-rounded-1c/latin-ext-800.css'
import '@fontsource/m-plus-rounded-1c/cyrillic-500.css'
import '@fontsource/m-plus-rounded-1c/cyrillic-800.css'
import '@fontsource/m-plus-rounded-1c/cyrillic-900.css'
import './fonts.css'
import './index.css'
import { TitleScreen } from './ui/TitleScreen'
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
  // the title screen first: signing in settles the account's data in localStorage before
  // the game (and its stores, which read it) is even loaded
  const startGame = () => import('./App').then(({ default: App }) => root.render(<App />))
  root.render(<TitleScreen onStart={startGame} />)
}
