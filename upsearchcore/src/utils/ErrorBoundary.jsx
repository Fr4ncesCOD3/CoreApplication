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
        <div className="error-container">
          <h2>Qualcosa è andato storto</h2>
          <p>Si è verificato un errore nell'applicazione. Prova a ricaricare la pagina.</p>
          <button 
            className="btn btn-primary" 
            onClick={() => window.location.reload()}
          >
            Ricarica Pagina
          </button>
          {this.props.children}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;