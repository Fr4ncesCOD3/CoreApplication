import axios from 'axios';
const API_URL = import.meta.env.VITE_API_URL;

/**
 * Classe per gestire la crittografia degli URL
 */
export class UrlEncryption {
  /**
   * Cripta un URL utilizzando il servizio backend
   * @param {string} url - URL da criptare
   * @returns {Promise<string>} - URL criptato
   */
  static async encryptUrl(url) {
    try {
      const token = localStorage.getItem('token');
      const headers = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      // Verifica se l'endpoint è /encrypt-url o /api/encrypt-url
      const response = await axios.post(`${API_URL}/api/encrypt-url`, 
        { url }, 
        { headers }
      ).catch(async () => {
        // Se fallisce, prova con l'altro endpoint
        return axios.post(`${API_URL}/encrypt-url`, 
          { url }, 
          { headers }
        );
      });
      
      return `/e/${response.data.encryptedUrl}`;
    } catch (error) {
      console.error('Errore nella crittografia dell\'URL:', error);
      // Se la crittografia fallisce, ritorna l'URL originale
      return url;
    }
  }
  
  /**
   * Verifica se un URL è criptato
   * @param {string} url - URL da verificare
   * @returns {boolean} - true se l'URL è criptato
   */
  static isEncryptedUrl(url) {
    return url && typeof url === 'string' && url.startsWith('/e/');
  }
  
  /**
   * Estrae l'URL criptato da un percorso completo
   * @param {string} path - Percorso completo (es. /e/abc123)
   * @returns {string} - Parte criptata dell'URL
   */
  static extractEncryptedPart(path) {
    if (!path || !path.startsWith('/e/')) return '';
    return path.substring(3); // Rimuove '/e/'
  }

  /**
   * Decripta un URL localmente (fallback)
   * @param {string} encryptedUrl - URL criptato
   * @returns {string} - URL decriptato
   */
  static decryptUrlLocally(encryptedUrl) {
    try {
      return decodeURIComponent(atob(encryptedUrl));
    } catch (error) {
      console.error('Errore nella decrittografia URL locale:', error);
      return encryptedUrl;
    }
  }
}

export default UrlEncryption;
