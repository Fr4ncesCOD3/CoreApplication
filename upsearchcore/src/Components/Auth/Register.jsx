import React, { useState, useEffect } from 'react';
import { Form, Button, Card, Container, Row, Col } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import { register, verifyOtp, resendOtp, getCsrfToken } from '../../utils/api';
import { toast, showNotification } from '../../utils/notification';
import './AuthCard.css';
import axios from 'axios';
// Importiamo icone
import { BsShieldLock, BsEnvelope, BsPerson, BsKey, BsArrowRightCircle, BsCheck2Circle, BsClock } from 'react-icons/bs';

const Register = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [showOtpForm, setShowOtpForm] = useState(false);
  const [usernameError, setUsernameError] = useState(null);
  const [emailError, setEmailError] = useState(null);
  const [passwordError, setPasswordError] = useState(null);
  const [confirmPasswordError, setConfirmPasswordError] = useState(null);
  const [otpError, setOtpError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [error, setError] = useState('');
  const [resending, setResending] = useState(false);
  const [verified, setVerified] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);

  useEffect(() => {
    // Controlla se l'utente è già autenticato
    const token = localStorage.getItem('token');
    if (token) {
      navigate('/note/');
    }
  }, [navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (name === 'username') {
      setUsername(value);
      setUsernameError(null);
    } else if (name === 'email') {
      setEmail(value);
      setEmailError(null);
    } else if (name === 'password') {
      setPassword(value);
      setPasswordError(null);
    } else if (name === 'confirmPassword') {
      setConfirmPassword(value);
      setConfirmPasswordError(null);
    } else if (name === 'otp') {
      setOtp(value);
      setOtpError(null);
    }
  };

  const validateForm = () => {
    let isValid = true;
    
    if (!username.trim()) {
      setUsernameError('Il nome utente è obbligatorio');
      isValid = false;
    } else if (username.length < 3) {
      setUsernameError('Il nome utente deve contenere almeno 3 caratteri');
      isValid = false;
    } else {
      setUsernameError(null);
    }
    
    if (!email.trim()) {
      setEmailError('L\'email è obbligatoria');
      isValid = false;
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      setEmailError('Formato email non valido');
      isValid = false;
    } else {
      setEmailError(null);
    }
    
    if (!password.trim()) {
      setPasswordError('La password è obbligatoria');
      isValid = false;
    } else if (password.length < 6) {
      setPasswordError('La password deve contenere almeno 6 caratteri');
      isValid = false;
    } else {
      setPasswordError(null);
    }
    
    if (password !== confirmPassword) {
      setConfirmPasswordError('Le password non coincidono');
      isValid = false;
    } else {
      setConfirmPasswordError(null);
    }
    
    return isValid;
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setIsSubmitting(true);
    
    try {
      // Log diagnostici
      console.log('Tentativo di registrazione con:', { 
        username, 
        email,
        password: '***' // Non loggare la password reale
      });
      
      // Rimuovi intestazioni non necessarie per evitare problemi CORS
      const response = await axios.post('/auth/register', 
        { username, email, password },
        { 
          headers: {
            'Content-Type': 'application/json'
            // Senza X-XSRF-TOKEN o altri header problematici
          }
        }
      );
      
      console.log('Risposta registrazione completa:', response);
      
      if (response && response.data) {
        setShowOtpForm(true);
        
        showNotification({
          type: 'success',
          message: 'Registrazione iniziata! Controlla la tua email per il codice OTP.'
        });
        
        if (response.data.testOtp) {
          showNotification({
            type: 'info',
            message: `Codice OTP di test: ${response.data.testOtp}`,
            autoClose: false
          });
        }
      }
    } catch (error) {
      // Log dettagliato dell'errore
      console.error('Errore durante la registrazione:', error);
      console.error('Dettagli errore:', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        headers: error.response?.headers
      });
      
      if (error.response) {
        const { status, data } = error.response;
        
        if (status === 400) {
          // Gestisci errori di validazione
          if (data.errors) {
            data.errors.forEach(err => {
              if (err.field === 'username') setUsernameError(err.message);
              if (err.field === 'email') setEmailError(err.message);
              if (err.field === 'password') setPasswordError(err.message);
            });
          } else {
            setError(data.message || 'Errore nella registrazione');
          }
        } else if (status === 409) {
          if (data.message && data.message.includes('email')) {
            setEmailError('Email già in uso');
          } else if (data.message && data.message.includes('username')) {
            setUsernameError('Username già in uso');
          } else {
            setError(data.message || 'Utente già esistente');
          }
        } else if (status === 403) {
          setError('Errore di autorizzazione. Ricarica la pagina e riprova.');
        } else if (status === 500) {
          setError('Errore del server. Per favore riprova più tardi.');
        } else {
          setError(data.message || 'Errore del server. Riprova più tardi.');
        }
      } else {
        setError('Impossibile contattare il server. Verifica la tua connessione.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setIsVerifyingOtp(true);
    setVerifying(true);
    
    try {
      const response = await axios.post('/auth/verify-otp', {
        email,
        otp
      });
      
      if (response.data && response.data.token) {
        localStorage.setItem('token', response.data.token);
        
        // Salva i dati utente
        if (response.data.user) {
          localStorage.setItem('user', JSON.stringify(response.data.user));
        } else {
          const userData = {
            id: Math.random().toString(36).substring(2, 15),
            username: username,
            email: email,
            roles: ['ROLE_USER']
          };
          localStorage.setItem('user', JSON.stringify(userData));
        }
        
        // Ottieni il token CSRF e ATTENDI che sia completato
        try {
          const csrfResponse = await axios.get('/csrf', {
            headers: {
              'Authorization': `Bearer ${response.data.token}`
            }
          });
          
          if (csrfResponse.data && csrfResponse.data.token) {
            localStorage.setItem('csrfToken', csrfResponse.data.token);
            console.log('Token CSRF salvato:', csrfResponse.data.token);
            
            // Solo dopo aver salvato il token CSRF, imposta il flag di successo
            setRegistrationSuccess(true);
            
            showNotification({
              type: 'success',
              message: 'Registrazione completata con successo!'
            });
            
            // Reindirizza dopo un breve ritardo per assicurarsi che tutto sia caricato
            setTimeout(() => {
              navigate('/note/');
            }, 1500);
          }
        } catch (csrfError) {
          console.error('Impossibile ottenere token CSRF:', csrfError);
          toast.warning('Problemi con l\'autenticazione. Potresti dover effettuare nuovamente il login.');
          navigate('/login');
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
    } finally {
      setIsVerifyingOtp(false);
      setVerifying(false);
    }
  };

  const handleResendOtp = async () => {
    try {
      setResending(true);
      
      console.log('Richiesta di reinvio OTP per:', username, email);
      
      // Assicurati di inviare sia username che email
      const response = await resendOtp({
        username: username,
        email: email
      });
      
      console.log('Risposta reinvio OTP:', response);
      
      showNotification({
        type: 'success',
        message: "OTP inviato nuovamente con successo! Controlla la tua email."
      });
      
      // Se siamo in ambiente di sviluppo e c'è un OTP di test, mostralo
      if (response && response.testOtp) {
        showNotification({
          type: 'info',
          message: `Codice OTP di test: ${response.testOtp}`,
          autoClose: false
        });
      }
    } catch (error) {
      console.error("Errore durante il reinvio dell'OTP:", error);
      showNotification({
        type: 'error',
        message: "Errore durante il reinvio dell'OTP. Riprova più tardi."
      });
    } finally {
      setResending(false);
    }
  };

  // Se la registrazione è avvenuta con successo, mostra un messaggio di reindirizzamento
  if (registrationSuccess) {
    return (
      <Container className="auth-container">
        <Row className="justify-content-center">
          <Col md={6} lg={5}>
            <Card className="auth-card">
              <Card.Body className="text-center success-message">
                <div className="my-4">
                  <BsCheck2Circle className="success-icon" />
                  <h4>Registrazione completata con successo</h4>
                  <p>Stai per essere reindirizzato all'area personale...</p>
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
                {showOtpForm ? (
                  <>
                    <BsShieldLock className="mb-2" style={{ fontSize: "2rem", color: "var(--primary-color, #6c5ce7)" }} />
                    <div>Verifica il codice OTP</div>
                  </>
                ) : (
                  <>
                    <BsPerson className="mb-2" style={{ fontSize: "2rem", color: "var(--primary-color, #6c5ce7)" }} />
                    <div>Registrazione</div>
                  </>
                )}
              </Card.Title>
              
              {!showOtpForm ? (
                <Form onSubmit={handleRegister}>
                  <Row>
                    <Col xs={12}>
                      <Form.Group className="mb-3">
                        <Form.Label>
                          <BsPerson className="me-2" />
                          Username
                        </Form.Label>
                        <Form.Control
                          type="text"
                          name="username"
                          value={username}
                          onChange={handleChange}
                          required
                          placeholder="Scegli uno username"
                          isInvalid={!!usernameError}
                        />
                        {usernameError && <Form.Control.Feedback type="invalid">{usernameError}</Form.Control.Feedback>}
                      </Form.Group>
                    </Col>

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
                          autoComplete="username"
                          isInvalid={!!emailError}
                        />
                        {emailError && <Form.Control.Feedback type="invalid">{emailError}</Form.Control.Feedback>}
                      </Form.Group>
                    </Col>

                    <Col xs={12}>
                      <Form.Group className="mb-3">
                        <Form.Label>
                          <BsKey className="me-2" />
                          Password
                        </Form.Label>
                        <Form.Control
                          type="password"
                          name="password"
                          value={password}
                          onChange={handleChange}
                          required
                          placeholder="Crea una password"
                          autoComplete="new-password"
                          isInvalid={!!passwordError}
                        />
                        {passwordError && <Form.Control.Feedback type="invalid">{passwordError}</Form.Control.Feedback>}
                      </Form.Group>
                    </Col>

                    <Col xs={12}>
                      <Form.Group className="mb-4">
                        <Form.Label>
                          <BsShieldLock className="me-2" />
                          Conferma Password
                        </Form.Label>
                        <Form.Control
                          type="password"
                          name="confirmPassword"
                          value={confirmPassword}
                          onChange={handleChange}
                          required
                          placeholder="Conferma la tua password"
                          autoComplete="new-password"
                          isInvalid={!!confirmPasswordError}
                        />
                        {confirmPasswordError && <Form.Control.Feedback type="invalid">{confirmPasswordError}</Form.Control.Feedback>}
                      </Form.Group>
                    </Col>

                    {error && (
                      <Col xs={12}>
                        <div className="alert alert-danger mb-3" role="alert">
                          {error}
                        </div>
                      </Col>
                    )}

                    <Col xs={12} className="d-grid">
                      <Button 
                        variant="primary" 
                        type="submit" 
                        className="py-2" 
                        disabled={loading || isSubmitting}
                      >
                        {isSubmitting ? (
                          <>
                            <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                            Registrazione in corso...
                          </>
                        ) : (
                          <>
                            <BsArrowRightCircle className="me-2" />
                            Registrati
                          </>
                        )}
                      </Button>
                    </Col>
                  </Row>
                  
                  <div className="auth-links">
                    Hai già un account? <Link to="/login">Accedi</Link>
                  </div>
                </Form>
              ) : (
                <Form onSubmit={handleVerifyOtp} className="otp-section">
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

export default Register;
