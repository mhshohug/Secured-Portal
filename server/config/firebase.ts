import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import dotenv from 'dotenv';

dotenv.config();

let isFirebaseAdminInitialized = false;

if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    initializeApp({
      credential: cert(serviceAccount)
    });
    isFirebaseAdminInitialized = true;
    console.log("Firebase Admin SDK initialized successfully with Service Account.");
  } catch (err) {
    console.warn("Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:", err);
  }
}

if (!isFirebaseAdminInitialized) {
  try {
    initializeApp();
    isFirebaseAdminInitialized = true;
    console.log("Firebase Admin SDK initialized with environment default credentials.");
  } catch (err) {
    console.warn("Firebase Admin SDK could not load default credentials.");
  }
}

export { getAuth, isFirebaseAdminInitialized };
