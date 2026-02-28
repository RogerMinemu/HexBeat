import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import { getFirestore, collection, addDoc, setDoc, doc, getDocs, query, where, orderBy, limit, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

let app;
let auth;
let db;
let googleProvider;

// Fetch config dynamically from backend so secrets aren't exposed in source code
async function fetchFirebaseConfig() {
    try {
        const response = await fetch('/api/firebase-config');
        if (!response.ok) throw new Error('Failed to fetch firebase config from server');
        return await response.json();
    } catch (e) {
        console.error("Firebase config fetch failing:", e);
        return null;
    }
}

export class FirebaseManager {
    constructor() {
        this.currentUser = null;
        this.onUserChangedCallback = null;
        this.app = null;
        this.auth = null;
        this.db = null;
        this.googleProvider = null;
        this.initialized = false;

        this.initPromise = this.initialize();
    }

    async initialize() {
        const firebaseConfig = await fetchFirebaseConfig();
        if (!firebaseConfig) return;

        this.app = initializeApp(firebaseConfig);
        this.auth = getAuth(this.app);
        this.db = getFirestore(this.app);
        this.googleProvider = new GoogleAuthProvider();

        // Listen to auth state changes
        onAuthStateChanged(this.auth, (user) => {
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

        this.initialized = true;
    }

    onUserChanged(callback) {
        this.onUserChangedCallback = callback;
        // Trigger immediately if already resolved
        if (this.initialized) {
            callback(this.currentUser);
        }
    }

    async loginWithGoogle() {
        try {
            await this.initPromise; // Asegurar que está inicializado
            const result = await signInWithPopup(this.auth, this.googleProvider);
            return result.user;
        } catch (error) {
            console.error("Error signing in with Google:", error);
            throw error;
        }
    }

    async logout() {
        try {
            await this.initPromise;
            await signOut(this.auth);
        } catch (error) {
            console.error("Error signing out:", error);
            throw error;
        }
    }

    async getAuthToken() {
        await this.initPromise;
        if (!this.auth.currentUser) return null;
        return await this.auth.currentUser.getIdToken();
    }
}

export const firebaseManager = new FirebaseManager();
export { db, collection, addDoc, setDoc, doc, getDocs, query, where, orderBy, limit, serverTimestamp };
