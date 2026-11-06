import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { ToastProvider } from './contexts/ToastContext.jsx'
import { AuthProvider } from './contexts/AuthContext.jsx'
import { NavigationProvider } from './contexts/NavigationContext.jsx'
import { ServerProvider } from './contexts/ServerContext.jsx'
import { UserProvider } from './contexts/UserContext.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <NavigationProvider>
            <ServerProvider>
              <UserProvider>
                <App />
              </UserProvider>
            </ServerProvider>
          </NavigationProvider>
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
