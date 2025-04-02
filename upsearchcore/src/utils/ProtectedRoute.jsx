import { Navigate } from 'react-router-dom';
import { isUserAuthenticated } from './auth';

const ProtectedRoute = ({ children }) => {
  if (!isUserAuthenticated()) {
    return <Navigate to="/login" replace />;
  }
  
  return children;
};

export default ProtectedRoute; 