import './instrument';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ClerkProvider } from '@clerk/clerk-react';
import { reactErrorHandler } from '@sentry/react';
import App from './App';
import './styles/orra.css';
import './styles/fonts.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

const PUBLISHABLE_KEY = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;

// When Clerk is configured, wrap the app with ClerkProvider so every route
// can use useAuth / useClerk hooks. When it is missing, the app runs in
// demo mode: AuthenticatedLayout shows a banner and does not gate the UI.
function Root() {
  return (
    <StrictMode>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </StrictMode>
  );
}

const errorHandlerOptions = {
  onUncaughtError: reactErrorHandler(),
  onCaughtError: reactErrorHandler(),
  onRecoverableError: reactErrorHandler(),
};

if (PUBLISHABLE_KEY) {
  createRoot(container, errorHandlerOptions).render(
    <StrictMode>
      <ClerkProvider publishableKey={PUBLISHABLE_KEY}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ClerkProvider>
    </StrictMode>,
  );
} else {
  createRoot(container, errorHandlerOptions).render(<Root />);
}
