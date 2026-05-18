import { initializeApp } from 'firebase/app';
import { getDatabase, ref, push, onChildAdded, onValue, set, serverTimestamp } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyB7jmuf55lceOkFKA-GchPlzV1N8VuvNMk", 
  authDomain: "scannect.firebaseapp.com",
  projectId: "scannect",
  // ★ シンガポールサーバーのURLを明示的に指定して通信を開通させます
  databaseURL: "https://scannect-default-rtdb.asia-southeast1.firebasedatabase.app",
  storageBucket: "scannect.firebasestorage.app",
  messagingSenderId: "20463229237",
  appId: "1:20463229237:web:f1c2b1679b85c88e9f947c"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

export { database, ref, push, onChildAdded, onValue, set, serverTimestamp };