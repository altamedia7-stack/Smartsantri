import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize a secondary app for creating users without affecting the main auth state
const secondaryAppName = 'SecondaryAuthApp';

export async function createAuthUser(email: string, password: string) {
  let secondaryApp;
  if (getApps().find(app => app.name === secondaryAppName)) {
    secondaryApp = getApp(secondaryAppName);
  } else {
    secondaryApp = initializeApp(firebaseConfig, secondaryAppName);
  }

  const secondaryAuth = getAuth(secondaryApp);
  
  try {
    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const user = userCredential.user;
    
    // Sign out from the secondary app immediately to avoid session conflicts
    await signOut(secondaryAuth);
    
    return user.uid;
  } catch (error) {
    console.error('Error creating auth user:', error);
    throw error;
  }
}
