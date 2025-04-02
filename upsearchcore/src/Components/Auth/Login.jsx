import React, { useState, useEffect } from 'react';
import { Form, Button, Card, Container, Row, Col } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import { login, verifyOtp, resendOtp, getCsrfToken, setCsrfToken } from '../../utils/api';
import { showNotification } from '../../utils/notification';
import './AuthCard.css';
import { toast } from 'react-hot-toast';
import axios from 'axios';
// Importiamo icone
import { BsShieldLock, BsEnvelope, BsArrowRightCircle, BsCheck2Circle, BsClock } from 'react-icons/bs';

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
      navigate('/note/');
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
    setIsSubmitting(true);
    
    try {
      // Usa la funzione login dall'api.js invece di axios direttamente
      const response = await login({ email, password });
      
      if (response && response.token) {
        // Salva il token JWT
        localStorage.setItem('token', response.token);
        
        // Se c'è un OTP da verificare
        if (response.requireOtp) {
          setShowOtpVerification(true);
        } else {
          // Se non è richiesto OTP, salva i dati utente e reindirizza
          if (response.user) {
            localStorage.setItem('user', JSON.stringify(response.user));
          }
          
          showNotification({
            type: 'success',
            message: 'Login completato con successo!'
          });
          
          navigate('/note/');
        }
      }
    } catch (error) {
      console.error('Errore durante il login:', error);
      
      if (error.response) {
        const { status, data } = error.response;
        
        if (status === 401) {
          setServerError(data.message || 'Credenziali non valide');
        } else if (status === 403) {
          setServerError('Accesso negato. Verifica le tue credenziali.');
        } else {
          setServerError(data.message || 'Errore durante il login');
        }
      } else {
        setServerError('Impossibile contattare il server. Riprova più tardi.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOtpVerification = async (e) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setVerifying(true);
    
    try {
      // Usa la funzione verifyOtp dall'api.js invece di axios direttamente
      const response = await verifyOtp({ email, otp });
      
      if (response) {
        // Salva token JWT e dati utente
        if (response.token) {
          localStorage.setItem('token', response.token);
          
          // Salva il token CSRF se presente
          if (response.csrfToken) {
            localStorage.setItem('csrfToken', response.csrfToken);
            console.log('Token CSRF salvato dal login:', response.csrfToken);
            
            // Salva anche gli endpoint disponibili se presenti
            if (response.noteEndpoints) {
              localStorage.setItem('noteEndpoints', JSON.stringify(response.noteEndpoints));
            }
            if (response.nasaEndpoints) {
              localStorage.setItem('nasaEndpoints', JSON.stringify(response.nasaEndpoints));
            }
          }
          
          // Salva i dati utente se presenti
          if (response.user) {
            localStorage.setItem('user', JSON.stringify(response.user));
          }
          
          // Imposta il flag di login completato
          setLoginSuccess(true);
          
          // Mostra notifica di successo
          showNotification({
            type: 'success',
            message: 'Login completato con successo!'
          });
          
          // Reindirizza dopo un breve ritardo per mostrare il messaggio di successo
          setTimeout(() => {
            navigate('/note/');
          }, 1500);
        } else {
          throw new Error('Token non ricevuto dal server');
        }
      }
    } catch (error) {
      console.error('Errore durante la verifica OTP:', error);
      
      if (error.response) {
        const { status, data } = error.response;
        
        if (status === 400) {
          setOtpError(data.message || 'Codice OTP non valido');
        } else if (status === 401) {
          setOtpError('Codice OTP scaduto o non valido');
        } else {
          setOtpError('Errore durante la verifica. Riprova.');
        }
      } else {
        setOtpError('Impossibile contattare il server. Riprova più tardi.');
      }
      
      // Mostra notifica di errore
      showNotification({
        type: 'error',
        message: 'Il codice OTP non è valido o è scaduto. Riprova.'
      });
    } finally {
      setIsLoggingIn(false);
      setVerifying(false);
    }
  };

  const handleResendOtp = async () => {
    try {
      setResending(true);
      
      await resendOtp({
        username: email.trim(),
        email: email.trim()
      });
      
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
    } finally {
      setResending(false);
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
      <Container className="auth-container">
        <Row className="justify-content-center">
          <Col md={6} lg={5}>
            <Card className="auth-card">
              <Card.Body className="text-center success-message">
                <div className="my-4">
                  <BsCheck2Circle className="success-icon" />
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
    <Container className="auth-container">
      <Row className="justify-content-center">
        <Col md={6} lg={5}>
          <Card className="auth-card">
            <Card.Body>
              <Card.Title className="text-center mb-4">
                {showOtpVerification ? (
                  <>
                    <BsShieldLock className="mb-2" style={{ fontSize: "2rem", color: "var(--primary-color, #6c5ce7)" }} />
                    <div>Verifica Codice OTP</div>
                  </>
                ) : (
                  <>
                    <BsArrowRightCircle className="mb-2" style={{ fontSize: "2rem", color: "var(--primary-color, #6c5ce7)" }} />
                    <div>Accedi</div>
                  </>
                )}
              </Card.Title>
              
              {!showOtpVerification ? (
                <Form onSubmit={handleLogin}>
                  <Row>
                    <Col xs={12}>
                      <Form.Group className="mb-3">
                        <Form.Label>
                          <BsEnvelope className="me-2" />
                          Email
                        </Form.Label>
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
                    </Col>

                    <Col xs={12}>
                      <Form.Group className="mb-4">
                        <Form.Label>
                          <BsShieldLock className="me-2" />
                          Password
                        </Form.Label>
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
                    </Col>

                    {serverError && (
                      <Col xs={12}>
                        <div className="alert alert-danger mb-3" role="alert">
                          {serverError}
                        </div>
                      </Col>
                    )}

                    <Col xs={12} className="d-grid">
                      <Button 
                        variant="primary" 
                        type="submit" 
                        className="py-2" 
                        disabled={isSubmitting}
                      >
                        {isSubmitting ? (
                          <>
                            <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                            Accesso in corso...
                          </>
                        ) : (
                          <>
                            <BsArrowRightCircle className="me-2" />
                            Accedi
                          </>
                        )}
                      </Button>
                    </Col>
                  </Row>
                  
                  <div className="auth-links">
                    Non hai un account? <Link to="/register">Registrati</Link>
                  </div>
                </Form>
              ) : (
                <Form onSubmit={handleOtpVerification} className="otp-section">
                  <Row className="justify-content-center">
                    <Col xs={12} className="text-center">
                      <p>Abbiamo inviato un codice di verifica alla tua email:</p>
                      <p className="otp-email">{email}</p>
                    </Col>
                    
                    <Col xs={12} sm={10} md={8}>
                      <Form.Group className="mb-4">
                        <Form.Label className="text-center w-100">Codice OTP</Form.Label>
                        <Form.Control
                          type="text"
                          name="otp"
                          value={otp}
                          onChange={handleChange}
                          required
                          placeholder="Inserisci il codice"
                          isInvalid={!!otpError}
                          autoComplete="one-time-code"
                          className="otp-input"
                          maxLength="6"
                        />
                        {otpError && <Form.Control.Feedback type="invalid">{otpError}</Form.Control.Feedback>}
                      </Form.Group>
                    </Col>

                    <Col xs={12} className="d-grid">
                      <Button 
                        variant="primary" 
                        type="submit" 
                        className="py-2" 
                        disabled={verifying}
                      >
                        {verifying ? (
                          <>
                            <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                            Verifica in corso...
                          </>
                        ) : (
                          <>
                            <BsShieldLock className="me-2" />
                            Verifica OTP
                          </>
                        )}
                      </Button>
                    </Col>
                  </Row>
                  
                  <div className="text-center mt-4">
                    <Button 
                      variant="link" 
                      onClick={handleResendOtp} 
                      disabled={resending}
                      className="p-0"
                    >
                      {resending ? (
                        <>
                          <BsClock className="me-1" />
                          Invio in corso...
                        </>
                      ) : (
                        <>
                          <BsEnvelope className="me-1" />
                          Non hai ricevuto il codice? Invia di nuovo
                        </>
                      )}
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
