/**
 * Firebase Configuration
 * 
 * IMPORTANT: Replace the placeholders below with your actual Firebase project details.
 * You can find these in the Firebase Console > Project Settings > General > Your apps.
 */

const firebaseConfig = {
    apiKey: "AIzaSyBFle0slQ8dwPsYtlNR7_csII4W2AWF4aM",
    authDomain: "teamreze-c468b.firebaseapp.com",
    projectId: "teamreze-c468b",
    storageBucket: "teamreze-c468b.firebasestorage.app",
    messagingSenderId: "531196794424",
    appId: "1:531196794424:web:1d6d4d049a00cdb88178cd"
};

// Initialize Firebase
if (typeof firebase !== 'undefined') {
    firebase.initializeApp(firebaseConfig);
    console.log("Firebase initialized");
} else {
    console.error("Firebase SDK not loaded");
}
