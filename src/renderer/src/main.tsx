import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { createWebLab } from './webLab';
import './styles.css';

window.lab = createWebLab();

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
