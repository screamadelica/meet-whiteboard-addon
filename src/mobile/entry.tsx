import '../index.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import Mobile from './Mobile'; // Your actual UI component

// Always unregister service workers on mobile page — we never want caching here
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(reg => {
      console.log('Unregistering SW:', reg.scope);
      reg.unregister();
    });
  });
}

const container = document.getElementById('root');

if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <Mobile />
    </React.StrictMode>
  );
}