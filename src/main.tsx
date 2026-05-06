import React, {StrictMode, useState, useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from './hooks/useAuth';
import { GroupProvider } from './contexts/GroupContext';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("React Error Boundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', color: '#e11d48', fontFamily: 'system-ui, sans-serif', textAlign: 'center', backgroundColor: '#fff1f2', minHeight: '100-screen' }}>
          <h1 style={{ fontSize: '24px', fontWeight: '900', marginBottom: '16px' }}>Oops! Application Error</h1>
          <p style={{ color: '#9f1239', marginBottom: '24px' }}>Something went wrong while rendering the application.</p>
          <div style={{ textAlign: 'left', backgroundColor: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #fda4af', maxWidth: '800px', margin: '0 auto', overflow: 'auto' }}>
            <pre style={{ fontSize: '12px', color: '#be123c', whiteSpace: 'pre-wrap' }}>{this.state.error?.message || 'Unknown error'}</pre>
            <pre style={{ fontSize: '10px', color: '#9f1239', marginTop: '12px', opacity: 0.7 }}>{this.state.error?.stack}</pre>
          </div>
          <button 
            onClick={() => window.location.reload()}
            style={{ marginTop: '24px', padding: '12px 24px', backgroundColor: '#e11d48', color: 'white', borderRadius: '8px', border: 'none', fontWeight: 'bold', cursor: 'pointer' }}
          >
            Reload Application
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <GroupProvider>
          <App />
        </GroupProvider>
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>,
);

/*
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      console.log('SW registered: ', registration);
    }).catch((registrationError) => {
      console.log('SW registration failed: ', registrationError);
    });
  });
}
*/
