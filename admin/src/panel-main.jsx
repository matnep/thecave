import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/anton/400.css';
import './index.css';
import App from './Panel.jsx';

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>);
