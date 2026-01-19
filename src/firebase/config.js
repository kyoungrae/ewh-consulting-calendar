// Firebase Configuration
// You need to replace these values with your Firebase project credentials
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {

    apiKey: "AIzaSyBWCf1imCpWyiZzTa-VBKk71SQ7KVI3mCI",

    authDomain: "ewha-consulting.firebaseapp.com",

    projectId: "ewha-consulting",

    storageBucket: "ewha-consulting.firebasestorage.app",

    messagingSenderId: "37517857545",

    appId: "1:37517857545:web:4b11c9f9fddc8067bb39d8",

    measurementId: "G-0XC7524NFR"

};



// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = getFirestore(app);

export default app;
