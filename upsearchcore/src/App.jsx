import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import { Container } from 'react-bootstrap'
import Notepad from './Components/Notepad/notepad/Notepad'
import './App.css'

function App() {
  const [theme, setTheme] = useState(() => {
    const savedTheme = localStorage.getItem('theme')
    return savedTheme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
  })

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  const toggleTheme = () => {
    setTheme(prevTheme => prevTheme === 'light' ? 'dark' : 'light')
  }

  useEffect(() => {
    // Funzione per prevenire il comportamento predefinito del browser
    const preventDefault = (e) => {
      e.preventDefault();
      e.stopPropagation();
      return false;
    };
    
    // Aggiungi event listener globali
    document.addEventListener('dragover', preventDefault);
    document.addEventListener('drop', preventDefault);
    
    // Cleanup
    return () => {
      document.removeEventListener('dragover', preventDefault);
      document.removeEventListener('drop', preventDefault);
    };
  }, []);

  return (
    <Router>
      <div className="app" data-theme={theme}>
        <Container fluid className="p-0 h-100">
          <Routes>
            <Route path="/*" element={<Notepad theme={theme} toggleTheme={toggleTheme} />} />
          </Routes>
        </Container>
      </div>
    </Router>
  )
}

export default App
