import React from 'react';
import { createRoot } from 'react-dom/client';
import Mobile from './Mobile'; // Your actual UI component

const container = document.getElementById('root');

if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <Mobile />
    </React.StrictMode>
  );
}