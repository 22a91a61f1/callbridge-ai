import { initializeApp, getApps, getApp, type FirebaseApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, type Auth } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

export const isFirebaseConfigured = Boolean(
  firebaseConfig &&
    firebaseConfig.apiKey &&
    firebaseConfig.projectId &&
    firebaseConfig.projectId !== 'remixed-project-id'
);

let firebaseApp: FirebaseApp | null = null;
let firebaseAuth: Auth | null = null;
let googleAuthProvider: GoogleAuthProvider | null = null;

if (isFirebaseConfigured) {
  firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
  firebaseAuth = getAuth(firebaseApp);
  googleAuthProvider = new GoogleAuthProvider();
  googleAuthProvider.setCustomParameters({ prompt: 'select_account' });
}

export const app = firebaseApp;
export const auth = firebaseAuth;
export const googleProvider = googleAuthProvider;
export const firebaseProjectId = firebaseConfig?.projectId || '';
