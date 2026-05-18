// src/firebase.js
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, push, onChildAdded, serverTimestamp } from 'firebase/database';

// ▼▼ ここをコピーしたご自身の firebaseConfig に書き換えてください ▼▼
const firebaseConfig = {
  apiKey: "AIzaSyB7jmuf55lceOkFKA-GchPlzV1N8VuvNMk", // 例
  authDomain: "scannect.firebaseapp.com",
  projectId: "scannect",
  storageBucket: "scannect.firebasestorage.app",
  messagingSenderId: "20463229237",
  appId: "1:20463229237:web:f1c2b1679b85c88e9f947c"
};
// ▲▲ ここまで ▲▲

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

export { database, ref, push, onChildAdded, serverTimestamp };