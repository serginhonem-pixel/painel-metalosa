import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: 'AIzaSyCD0MUk6azoj-cp1v5TP5Q0QP80SKNq-ds',
  authDomain: 'inventario-bobina2.firebaseapp.com',
  projectId: 'inventario-bobina2',
  storageBucket: 'inventario-bobina2.firebasestorage.app',
  messagingSenderId: '628276135464',
  appId: '1:628276135464:web:e33c84479c8fccb0c7171d',
  measurementId: 'G-TZS89ZE0TS',
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

export { app, db, auth, firebaseConfig };
