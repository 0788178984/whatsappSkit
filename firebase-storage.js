/**
 * Firebase Cloud Storage for WhatsApp Skit Maker
 * Syncs settings to Firestore for cross-device access
 */

// Firebase configuration - PASTE YOUR CONFIG HERE
const firebaseConfig = {
  apiKey: "AIzaSyAzUHX4__hWtcc3C7DlmDXs8WMnWjghs9s",
  authDomain: "whatsapp-skit-make.firebaseapp.com",
  projectId: "whatsapp-skit-make",
  storageBucket: "whatsapp-skit-make.firebasestorage.app",
  messagingSenderId: "1012864494501",
  appId: "1:1012864494501:web:19f423deae8a7c0279164c",
  measurementId: "G-6YZLPBL9LY"
};

// Initialize Firebase
let app = null;
let auth = null;
let db = null;
let analytics = null;

function initFirebase() {
  if (typeof firebase === 'undefined') {
    console.warn('Firebase SDK not loaded');
    return false;
  }
  
  if (!app) {
    app = firebase.initializeApp(firebaseConfig);
    auth = firebase.auth();
    db = firebase.firestore();
    
    // Analytics optional
    if (firebase.analytics) {
      try {
        analytics = firebase.analytics();
      } catch (e) {}
    }
  }
  return true;
}

// Authentication functions
async function signUpWithEmail(email, password) {
  if (!initFirebase()) throw new Error('Firebase not available');
  const userCredential = await auth.createUserWithEmailAndPassword(email, password);
  return userCredential.user;
}

async function signInWithEmail(email, password) {
  if (!initFirebase()) throw new Error('Firebase not available');
  const userCredential = await auth.signInWithEmailAndPassword(email, password);
  return userCredential.user;
}

async function signOut() {
  if (!auth) return;
  await auth.signOut();
}

function getCurrentUser() {
  return auth?.currentUser;
}

// Cloud sync functions
async function saveSettingsToCloud(settings) {
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  if (!db) throw new Error('Firestore not initialized');
  
  const data = {
    settings: settings,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    userId: user.uid
  };
  
  await db.collection('skitSettings').doc(user.uid).set(data);
  return true;
}

async function loadSettingsFromCloud() {
  const user = getCurrentUser();
  if (!user) throw new Error('Not authenticated');
  if (!db) throw new Error('Firestore not initialized');
  
  const doc = await db.collection('skitSettings').doc(user.uid).get();
  if (!doc.exists) return null;
  
  return doc.data().settings;
}

// Auth state observer
function onAuthStateChanged(callback) {
  if (!auth) return () => {};
  return auth.onAuthStateChanged(callback);
}

// UI helpers
function updateCloudUI(user) {
  const loginBtn = document.getElementById('cloudLoginBtn');
  const logoutBtn = document.getElementById('cloudLogoutBtn');
  const saveBtn = document.getElementById('saveToCloudBtn');
  const loadBtn = document.getElementById('loadFromCloudBtn');
  const statusEl = document.getElementById('cloudStatus');
  
  if (user) {
    if (loginBtn) loginBtn.style.display = 'none';
    if (logoutBtn) logoutBtn.style.display = '';
    if (saveBtn) saveBtn.disabled = false;
    if (loadBtn) loadBtn.disabled = false;
    if (statusEl) statusEl.textContent = `☁️ ${user.email}`;
  } else {
    if (loginBtn) loginBtn.style.display = '';
    if (logoutBtn) logoutBtn.style.display = 'none';
    if (saveBtn) saveBtn.disabled = true;
    if (loadBtn) loadBtn.disabled = true;
    if (statusEl) statusEl.textContent = '☁️ Not logged in';
  }
}

// Show login modal
function showLoginModal() {
  const modal = document.getElementById('cloudAuthModal');
  if (modal) modal.style.display = 'flex';
}

function hideLoginModal() {
  const modal = document.getElementById('cloudAuthModal');
  if (modal) modal.style.display = 'none';
}

// Export for use in other modules
window.FirebaseStorage = {
  init: initFirebase,
  signUp: signUpWithEmail,
  signIn: signInWithEmail,
  signOut: signOut,
  getCurrentUser,
  saveSettings: saveSettingsToCloud,
  loadSettings: loadSettingsFromCloud,
  onAuthStateChanged,
  updateUI: updateCloudUI,
  showLoginModal,
  hideLoginModal
};

// Auto-init on load
document.addEventListener('DOMContentLoaded', () => {
  if (initFirebase()) {
    onAuthStateChanged((user) => {
      updateCloudUI(user);
    });
  }
});
