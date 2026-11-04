import { createRoot } from 'react-dom/client';
import '@fontsource/press-start-2p/latin-400.css';
import '@fontsource/press-start-2p/cyrillic-400.css';
import './styles/tokens.css';
import './styles/app.css';
import { App } from './app/App';
// Phaser lifecycle is owned by RunView; avoid a dev-only StrictMode double game mount.
createRoot(document.getElementById('root')!).render(<App/>);
