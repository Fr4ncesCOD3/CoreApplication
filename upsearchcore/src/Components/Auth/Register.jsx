import React, { useState, useEffect } from 'react';
import { Form, Button, Card, Container, Row, Col } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import { authService, verifyOtp, resendOtp } from '../../utils/api';
import { toast, showNotification } from '../../utils/notification';
import './AuthCard.css';

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

  useEffect(() => {
    // Controlla se l'utente è già autenticato
    const token = localStorage.getItem('token');
    if (token) {
      navigate('/notepad');
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
    
    setLoading(true);
    
    try {
      const toastId = toast.info('Connessione al server in corso...', {
        autoClose: false
      });
      
      const response = await authService.register({
        username,
        email,
        password
      });
      
      toast.dismiss(toastId);
      
      if (response.data) {
        toast.success(response.data.message || 'Registrazione completata. Controlla la tua email per il codice OTP');
        setShowOtpForm(true);
        
        // Salva l'email per la verifica OTP anche se è fallita la registrazione ma l'utente esiste
        if (response.data.possibleSuccess) {
          console.log('Registrazione potenzialmente completata nonostante errore di comunicazione');
        }
      }
    } catch (error) {
      const errorMessage = error.message || 'Errore durante la registrazione';
      
      // Gestisci errori specifici
      if (errorMessage.includes('username')) {
        setUsernameError(errorMessage);
      } else if (errorMessage.includes('email')) {
        setEmailError(errorMessage);
      } else if (errorMessage.includes('password')) {
        setPasswordError(errorMessage);
      } else if (errorMessage.includes('server') || 
                 errorMessage.includes('500') || 
                 errorMessage.includes('completata comunque')) {
        // Potrebbe essere un errore del TimeoutFilter che non ha influenzato la registrazione
        setShowOtpForm(true);
        toast.warning('Prova a verificare il tuo OTP. Se non funziona, riprova la registrazione.');
      }
      
      // Gestione speciale per l'errore 500 del TimeoutFilter
      if (error.response && error.response.status === 500) {
        // Controlla se l'utente è stato creato
        setTimeout(async () => {
          try {
            const exists = await authService.checkUserExists(username, email);
            if (exists) {
              toast.info('Username o email già registrati. Puoi procedere con la verifica OTP o il login.');
              setShowOtpForm(true);
            }
          } catch (checkError) {
            console.error('Errore nel controllo utente:', checkError);
          }
        }, 1000);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setVerifying(true);
    
    try {
      console.log('Verifica OTP per username:', username, 'con codice:', otp);
      
      // Assicurati di inviare sia username che email
      const response = await verifyOtp({
        username: username,
        email: email,  // Aggiungi email per sicurezza
        otp: otp
      });
      
      console.log('Risposta verifica OTP:', response);
      
      if (response && response.token) {
        // Salva il token e le informazioni dell'utente
        localStorage.setItem('token', response.token);
        localStorage.setItem('user', JSON.stringify(response.user));
        
        setVerified(true);
        showNotification({
          type: 'success',
          message: 'Registrazione completata con successo!'
        });
        
        // Reindirizza l'utente alla pagina Notepad
        navigate('/note');
      }
    } catch (error) {
      console.error('Errore durante la verifica OTP:', error);
      showNotification({
        type: 'error',
        message: 'Codice OTP non valido. Riprova.'
      });
    } finally {
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
      <Container>
        <Row className="justify-content-center">
          <Col md={6}>
            <Card className="auth-card">
              <Card.Body className="text-center">
                <div className="my-4">
                  <div className="spinner-border text-primary mb-3" role="status">
                    <span className="visually-hidden">Caricamento...</span>
                  </div>
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
    <Container>
      <Row className="justify-content-center">
        <Col md={6}>
          <Card className="auth-card">
            <Card.Body>
              <Card.Title className="text-center mb-4">
                {showOtpForm ? 'Verifica il codice OTP' : 'Registrazione'}
              </Card.Title>
              
              {!showOtpForm ? (
                <Form onSubmit={handleRegister}>
                  <Form.Group className="mb-3">
                    <Form.Label>Username</Form.Label>
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

                  <Form.Group className="mb-3">
                    <Form.Label>Email</Form.Label>
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

                  <Form.Group className="mb-3">
                    <Form.Label>Password</Form.Label>
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

                  <Form.Group className="mb-4">
                    <Form.Label>Conferma Password</Form.Label>
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

                  <Button 
                    variant="primary" 
                    type="submit" 
                    className="w-100 py-2" 
                    disabled={loading}
                  >
                    {loading ? 'Registrazione in corso...' : 'Registrati'}
                  </Button>
                  
                  <div className="text-center mt-3">
                    Hai già un account? <Link to="/login">Accedi</Link>
                  </div>
                </Form>
              ) : (
                <Form onSubmit={handleVerifyOtp}>
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
                      onClick={handleResendOtp} 
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

export default Register;
