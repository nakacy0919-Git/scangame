import { initializeApp } from 'firebase/app';
// ★ set と onValue を追加
import { getDatabase, ref, push, onChildAdded, onValue, set, serverTimestamp } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyB7jmuf55lceOkFKA-GchPlzV1N8VuvNMk", // ※ここをご自身のものに！
  authDomain: "scannect.firebaseapp.com",
  projectId: "scannect",
  storageBucket: "scannect.firebasestorage.app",
  messagingSenderId: "20463229237",
  appId: "1:20463229237:web:f1c2b1679b85c88e9f947c"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// ★ set と onValue もエクスポートする
export { database, ref, push, onChildAdded, onValue, set, serverTimestamp };