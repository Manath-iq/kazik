import { createRoot } from 'react-dom/client';
import '@fontsource/press-start-2p/latin-400.css';
import '@fontsource/press-start-2p/cyrillic-400.css';
import './styles/tokens.css';
import './styles/app.css';
import './styles/support.css';
import './styles/effects.css';
import './styles/currency.css';
import './styles/game-ui.css';
import './styles/live-casino.css';
import { App } from './app/App';
// Phaser lifecycle is owned by RunView; avoid a dev-only StrictMode double game mount.
const root=createRoot(document.getElementById('root')!);
if(import.meta.env.DEV&&location.pathname==='/__game-review'){
 void import('./game/GameReview').then(({GameReview})=>root.render(<GameReview/>));
}else root.render(<App/>);
