import '@fontsource-variable/inter';
import '@/styles/globals.css';
import '@/styles/helpdesk.css';
import '@/sample/i18n';

import { router } from '@/lib/router';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

createRoot(rootEl).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
