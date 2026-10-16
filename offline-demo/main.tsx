import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './src/App';
import { Toaster } from './src/components/Toaster';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><HashRouter><Toaster><App /></Toaster></HashRouter></React.StrictMode>,
);
