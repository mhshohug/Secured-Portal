import { Request } from 'express';
import { getAuth, isFirebaseAdminInitialized } from '../config/firebase';
import { logger } from '../utils/logger';

export const verifyToken = async (req: Request): Promise<any> => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('No authorization token provided');
  }
  const idToken = authHeader.split('Bearer ')[1];

  // If token is a raw UID string (not a JWT with dots), accept it directly
  if (!idToken.includes('.')) {
    return {
      uid: idToken,
      email: '',
      name: 'User',
      picture: `https://api.dicebear.com/7.x/adventurer/svg?seed=${idToken}`
    };
  }

  if (isFirebaseAdminInitialized) {
    try {
      const decodedToken = await getAuth().verifyIdToken(idToken);
      return decodedToken;
    } catch (err) {
      logger.warn("Firebase Admin verifyIdToken failed, falling back to JWT decode");
    }
  }

  // Developer sandbox fallback: Base64 JWT payload decoding
  const parts = idToken.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
      return {
        uid: payload.sub,
        email: payload.email || '',
        name: payload.name || 'Anonymous',
        picture: payload.picture || `https://api.dicebear.com/7.x/adventurer/svg?seed=${payload.sub}`,
      };
    } catch (e) {
      throw new Error('Invalid JWT format');
    }
  }
  throw new Error('Authentication token is invalid');
};
