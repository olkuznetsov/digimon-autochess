import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// Note: no StrictMode — its dev double-mount restarts the Three.js animation
// mixers and fights the imperative animation state machine in CreatureModel.
createRoot(document.getElementById('root')!).render(<App />)
