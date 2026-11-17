import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInAnonymously, signInWithPopup } from 'firebase/auth';
import { getDatabase, ref, get, onValue, set } from 'firebase/database';
import { getFunctions, httpsCallable } from 'firebase/functions';

// Firebase web configuration identifies this project; it is not an authorization secret.
// Access is restricted by database.rules.json and Firebase Authentication.
const firebaseConfig = {
  apiKey: "AIzaSyB7jmuf55lceOkFKA-GchPlzV1N8VuvNMk",
  authDomain: "scannect.firebaseapp.com",
  projectId: "scannect",
  databaseURL: "https://scannect-default-rtdb.asia-southeast1.firebasedatabase.app",
  storageBucket: "scannect.firebasestorage.app",
  messagingSenderId: "20463229237",
  appId: "1:20463229237:web:f1c2b1679b85c88e9f947c"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const auth = getAuth(app);
const functions = getFunctions(app, 'asia-southeast1');
const startMission = httpsCallable(functions, 'startMission');
const submitMission = httpsCallable(functions, 'submitMission');

export { auth, GoogleAuthProvider, onAuthStateChanged, signInAnonymously, signInWithPopup };
export { database, ref, get, onValue, set, startMission, submitMission };
