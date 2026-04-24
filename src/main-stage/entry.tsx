import '../index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import MainStage from './MainStage'; // Your actual UI component

const container = document.getElementById('root');

if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <MainStage />
    </React.StrictMode>
  );
}