import React, { Component } from 'react';
import { toast } from './notification';

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({
      error: error,
      errorInfo: errorInfo
    });
    
    console.error("Errore catturato da ErrorBoundary:", error, errorInfo);
    toast.error('Si è verificato un errore. Prova a ricaricare la pagina.');
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-container">
          <h2>Si è verificato un errore</h2>
          <details>
            <summary>Dettagli dell'errore (per sviluppatori)</summary>
            <pre>{this.state.error && this.state.error.toString()}</pre>
            <p>Componenti coinvolti:</p>
            <pre>{this.state.componentStack}</pre>
          </details>
          <button 
            className="btn btn-primary mt-3"
            onClick={() => {
              localStorage.setItem('lastError', JSON.stringify({
                message: this.state.error && this.state.error.toString(),
                componentStack: this.state.componentStack,
                timestamp: new Date().toISOString()
              }));
              window.location.reload();
            }}
          >
            Ricarica applicazione
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;