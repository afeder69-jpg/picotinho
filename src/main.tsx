import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Force complete refresh - v2.0
createRoot(document.getElementById("root")!).render(<App />);
