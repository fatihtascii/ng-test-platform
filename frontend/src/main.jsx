import './fonts.css'
import './index.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { installAuthFetch } from './auth'

installAuthFetch()


createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)
