import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getFirestore, collection, addDoc, setDoc, doc, getDocs, query, where, orderBy, limit, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

let app;
let auth;
let db;
let googleProvider;

// Fetch config dynamically from backend so secrets aren't exposed in source code
async function initializeFirebase() {
    try {
        const response = await fetch('/api/firebase-config');
        if (!response.ok) throw new Error('Failed to fetch firebase config from server');
        const firebaseConfig = await response.json();

        app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getFirestore(app);
        googleProvider = new GoogleAuthProvider();
    } catch (e) {
        console.error("Firebase init failing:", e);
    }
}
await initializeFirebase();

export class FirebaseManager {
    constructor() {
        this.currentUser = null;
        this.onUserChangedCallback = null;

        // Listen to auth state changes
        onAuthStateChanged(auth, (user) => {
            if (user) {
                this.currentUser = {
                    uid: user.uid,
                    displayName: user.displayName,
                    email: user.email,
                    photoURL: user.photoURL,
                    token: null // Will be populated on demand
                };
            } else {
                this.currentUser = null;
            }
            if (this.onUserChangedCallback) {
                this.onUserChangedCallback(this.currentUser);
            }
        });
    }

    onUserChanged(callback) {
        this.onUserChangedCallback = callback;
        // Trigger immediately if already resolved
        callback(this.currentUser);
    }

    async loginWithGoogle() {
        try {
            // Volvemos a signInWithPopup ya que redirect requiere Firebase Hosting /__/ endpoints
            const result = await signInWithPopup(auth, googleProvider);
            return result.user;
        } catch (error) {
            console.error("Error signing in with Google:", error);
            throw error;
        }
    }

    async logout() {
        try {
            await signOut(auth);
        } catch (error) {
            console.error("Error signing out:", error);
            throw error;
        }
    }

    async getAuthToken() {
        if (!auth.currentUser) return null;
        return await auth.currentUser.getIdToken();
    }
}

export const firebaseManager = new FirebaseManager();
export { db, collection, addDoc, setDoc, doc, getDocs, query, where, orderBy, limit, serverTimestamp };
