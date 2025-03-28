import React, { useState, useEffect } from 'react';
import { Form, Button, Card, Container, Row, Col } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import { login, verifyOtp, resendOtp } from '../../utils/api';
import { showNotification } from '../../utils/notification';
import './AuthCard.css';
import { toast } from 'react-hot-toast';

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [showOtpForm, setShowOtpForm] = useState(false);
  const [emailError, setEmailError] = useState(null);
  const [passwordError, setPasswordError] = useState(null);
  const [otpError, setOtpError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverError, setServerError] = useState(null);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [resending, setResending] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [showOtpVerification, setShowOtpVerification] = useState(false);
  const [tempUserId, setTempUserId] = useState(null);

  useEffect(() => {
    // Controlla se l'utente è già autenticato
    const token = localStorage.getItem('token');
    if (token) {
      navigate('/notepad');
    }
  }, [navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'email') {
      setEmail(value);
      setEmailError(null);
    } else if (name === 'password') {
      setPassword(value);
      setPasswordError(null);
    } else if (name === 'otp') {
      setOtp(value);
      setOtpError(null);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoggingIn(true);
    
    // Validazione lato client
    if (!email || email.trim() === '') {
      showNotification({
        type: 'error',
        message: "L'email non può essere vuota"
      });
      setIsLoggingIn(false);
      return;
    }
    
    try {
      console.log('Tentativo di login con email:', email);
      
      // Invece di inviare email come prima, manda un oggetto corretto con username
      const response = await login({
        username: email.trim(), // Usa email come username per il login
        email: email.trim(),    // Mantieni anche email per compatibilità
        password: password
      });
      
      console.log('Risposta login:', response);
      
      if (response && response.userId) {
        setTempUserId(response.userId);
        setShowOtpVerification(true);
        showNotification({
          type: 'success',
          message: 'Abbiamo inviato un codice OTP alla tua email. Inseriscilo per completare il login.'
        });
      } else if (response && response.token) {
        // Se l'autenticazione è immediata (senza OTP)
        localStorage.setItem('token', response.token);
        localStorage.setItem('user', JSON.stringify(response.user));
        
        showNotification({
          type: 'success',
          message: 'Login effettuato con successo!'
        });
        
        navigate('/note/');
      }
    } catch (error) {
      console.error('Errore durante il login:', error);
      
      showNotification({
        type: 'error',
        message: "Si è verificato un errore durante il login. Verifica le tue credenziali e riprova."
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleOtpVerification = async (e) => {
    e.preventDefault();
    setIsLoggingIn(true);
    
    try {
      // Seconda fase del login con verifica OTP
      const response = await verifyOtp(email, otp);
      
      if (response && response.token && response.user && response.user.id) {
        // Salva il token e i dati utente solo se completi
        localStorage.setItem('token', response.token);
        localStorage.setItem('user', JSON.stringify(response.user));
        
        showNotification({
          type: 'success',
          message: 'Login completato con successo!'
        });
        
        // Reindirizza l'utente alla pagina Notepad
        navigate('/note/');
      } else {
        showNotification({
          type: 'error',
          message: 'Risposta del server incompleta. Riprova.'
        });
      }
    } catch (error) {
      console.error('Errore durante la verifica OTP:', error);
      showNotification({
        type: 'error',
        message: 'Il codice OTP non è valido o è scaduto. Riprova.'
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const resendOtp = async () => {
    try {
      await login(email, password);
      showNotification({
        type: 'success',
        message: 'Abbiamo inviato un nuovo codice OTP alla tua email.'
      });
    } catch (error) {
      console.error('Errore nell\'invio di un nuovo OTP:', error);
      showNotification({
        type: 'error',
        message: 'Impossibile inviare un nuovo OTP. Riprova più tardi.'
      });
    }
  };

  const handleLoginSuccess = (userData) => {
    setIsLoggingIn(false);
    
    // Salva i dati utente nel localStorage
    localStorage.setItem('token', userData.token);
    localStorage.setItem('user', JSON.stringify(userData.user));
    
    // Mostra notifica di successo
    toast.success('Login effettuato con successo!');
    
    // Reindirizza alla pagina del notepad
    navigate('/note/');
  };

  // Se il login è avvenuto con successo, mostra un messaggio di reindirizzamento
  if (loginSuccess) {
    return (
      <Container>
        <Row className="justify-content-center">
          <Col md={6}>
            <Card className="auth-card">
              <Card.Body className="text-center">
                <div className="my-4">
                  <div className="spinner-border text-primary mb-3" role="status">
                    <span className="visually-hidden">Caricamento...</span>
                  </div>
                  <h4>Accesso effettuato con successo</h4>
                  <p>Stai per essere reindirizzato...</p>
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      </Container>
    );
  }

  return (
    <Container>
      <Row className="justify-content-center">
        <Col md={6}>
          <Card className="auth-card">
            <Card.Body>
              <Card.Title className="text-center mb-4">
                {showOtpVerification ? 'Verifica Codice OTP' : 'Accedi'}
              </Card.Title>
              
              {!showOtpVerification ? (
                <Form onSubmit={handleLogin}>
                  <Form.Group className="mb-3">
                    <Form.Label>Email</Form.Label>
                    <Form.Control
                      type="email"
                      name="email"
                      value={email}
                      onChange={handleChange}
                      required
                      placeholder="Inserisci la tua email"
                      autoComplete="email"
                      isInvalid={!!emailError}
                    />
                    {emailError && <Form.Control.Feedback type="invalid">{emailError}</Form.Control.Feedback>}
                  </Form.Group>

                  <Form.Group className="mb-4">
                    <Form.Label>Password</Form.Label>
                    <Form.Control
                      type="password"
                      name="password"
                      value={password}
                      onChange={handleChange}
                      required
                      placeholder="Inserisci la tua password"
                      autoComplete="current-password"
                      isInvalid={!!passwordError}
                    />
                    {passwordError && <Form.Control.Feedback type="invalid">{passwordError}</Form.Control.Feedback>}
                  </Form.Group>

                  {serverError && (
                    <div className="alert alert-danger mb-3" role="alert">
                      {serverError}
                    </div>
                  )}

                  <Button 
                    variant="primary" 
                    type="submit" 
                    className="w-100 py-2" 
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? 'Accesso in corso...' : 'Accedi'}
                  </Button>
                  
                  <div className="text-center mt-3">
                    Non hai un account? <Link to="/register">Registrati</Link>
                  </div>
                </Form>
              ) : (
                <Form onSubmit={handleOtpVerification}>
                  <div className="text-center mb-3">
                    <p>Abbiamo inviato un codice di verifica alla tua email:</p>
                    <p className="fw-bold">{email}</p>
                  </div>
                  
                  <Form.Group className="mb-4">
                    <Form.Label>Codice OTP</Form.Label>
                    <Form.Control
                      type="text"
                      name="otp"
                      value={otp}
                      onChange={handleChange}
                      required
                      placeholder="Inserisci il codice OTP ricevuto via email"
                      isInvalid={!!otpError}
                      autoComplete="one-time-code"
                    />
                    {otpError && <Form.Control.Feedback type="invalid">{otpError}</Form.Control.Feedback>}
                  </Form.Group>

                  <Button 
                    variant="primary" 
                    type="submit" 
                    className="w-100 py-2" 
                    disabled={verifying}
                  >
                    {verifying ? 'Verifica in corso...' : 'Verifica OTP'}
                  </Button>
                  
                  <div className="text-center mt-3">
                    <Button 
                      variant="link" 
                      onClick={resendOtp} 
                      disabled={resending}
                      className="p-0"
                    >
                      Non hai ricevuto il codice? Invia di nuovo
                    </Button>
                  </div>
                </Form>
              )}
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default Login;
