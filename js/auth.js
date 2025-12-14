/**
 * Auth Manager
 * Handles user login/logout and session state.
 */

class AuthManager {
    constructor() {
        this.user = null;
        this.onUserChangeCallbacks = [];
        this.init();
    }

    init() {
        if (typeof firebase === 'undefined') return;

        firebase.auth().onAuthStateChanged((user) => {
            this.user = user;
            this.notifyUserChange(user);
            this.updateUI(user);
        });
    }

    async loginWithGoogle() {
        if (typeof firebase === 'undefined') {
            alert('Firebase not initialized');
            return;
        }
        const provider = new firebase.auth.GoogleAuthProvider();
        try {
            await firebase.auth().signInWithPopup(provider);
            // Success matches onAuthStateChanged
        } catch (error) {
            console.error("Login failed:", error);
            alert(`Login failed: ${error.message}`);
        }
    }

    async logout() {
        try {
            await firebase.auth().signOut();
        } catch (error) {
            console.error("Logout failed:", error);
        }
    }

    onUserChange(callback) {
        this.onUserChangeCallbacks.push(callback);
    }

    notifyUserChange(user) {
        this.onUserChangeCallbacks.forEach(cb => cb(user));
    }

    updateUI(user) {
        // Settings Modal Account Section
        const accountLoggedOut = document.getElementById('accountLoggedOut');
        const accountLoggedIn = document.getElementById('accountLoggedIn');
        const settingsUserAvatar = document.getElementById('settingsUserAvatar');
        const settingsUserName = document.getElementById('settingsUserName');
        const settingsUserEmail = document.getElementById('settingsUserEmail');

        if (user) {
            if (accountLoggedOut) accountLoggedOut.style.display = 'none';
            if (accountLoggedIn) {
                accountLoggedIn.style.display = 'flex';
                if (settingsUserAvatar) settingsUserAvatar.src = user.photoURL || 'assets/default_avatar.png';
                if (settingsUserName) settingsUserName.textContent = user.displayName || 'User';
                if (settingsUserEmail) settingsUserEmail.textContent = user.email || '';
            }
        } else {
            if (accountLoggedOut) accountLoggedOut.style.display = 'flex';
            if (accountLoggedIn) accountLoggedIn.style.display = 'none';
        }
    }

    getCurrentUser() {
        return this.user;
    }
}

// Global instance
const authManager = new AuthManager();
