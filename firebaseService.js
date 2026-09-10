/**
 * FIREBASE FIRESTORE SERVICE - STANDING FIRM PETRA
 * Project: datawelcomedinner
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDocs, 
  updateDoc, 
  onSnapshot,
  query,
  orderBy 
} from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";

// Firebase configuration (Loaded from Environment Variables for Vercel / Local)
const firebaseConfig = {
  apiKey: import.meta.env?.VITE_FIREBASE_API_KEY || "AIzaSyAOUnofSBUdhjAEkIP93he3j1LCYT30D5E",
  authDomain: import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN || "datawelcomedinner.firebaseapp.com",
  projectId: import.meta.env?.VITE_FIREBASE_PROJECT_ID || "datawelcomedinner",
  storageBucket: import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET || "datawelcomedinner.firebasestorage.app",
  messagingSenderId: import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID || "128321472574",
  appId: import.meta.env?.VITE_FIREBASE_APP_ID || "1:128321472574:web:7d2b75ba6ec69e5d8d696f",
  measurementId: import.meta.env?.VITE_FIREBASE_MEASUREMENT_ID || "G-8R30MHE1Y6"
};

// Initialize Firebase & Firestore
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const ATTENDEES_COLLECTION = "attendees";
const MANUAL_ATTENDEES_COLLECTION = "manual_attendees";

const GOOGLE_SHEETS_URL = import.meta.env?.VITE_GOOGLE_SHEETS_URL || "https://script.google.com/macros/s/AKfycbwA1d0CQEcLSIaTuGK2K5LIFaSvw11ffjR-1V2y4Btb9XfCsoVv35wlJqjNOMMVYec/exec";

/**
 * Sync asynchronous data ke Google Sheets Webhook
 */
export function syncToGoogleSheets(payload) {
  if (!GOOGLE_SHEETS_URL) return;
  try {
    fetch(GOOGLE_SHEETS_URL, {
      method: "POST",
      mode: "no-cors",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).catch(err => console.warn("Google Sheets sync warning:", err));
  } catch (e) {
    console.warn("Google Sheets error:", e);
  }
}

/**
 * Simpan data pendaftar baru ke Firestore & Google Sheets
 */
export async function saveAttendeeToFirebase(attendee) {
  try {
    // 1. Simpan ke Firestore
    const docRef = doc(db, ATTENDEES_COLLECTION, attendee.ticketId);
    await setDoc(docRef, attendee, { merge: true });
    console.log("✅ Berhasil disimpan ke Firebase Firestore:", attendee.ticketId);

    // 2. Sync otomatis ke Google Sheets
    syncToGoogleSheets(attendee);

    return { success: true };
  } catch (error) {
    console.error("❌ Gagal menyimpan ke Firebase:", error);
    // Tetap coba kirim ke Sheets jika Firebase bermasalah
    syncToGoogleSheets(attendee);
    return { success: false, error };
  }
}

/**
 * Simpan data pendaftar MANUAL Hari-H ke Firestore & Google Sheets
 */
export async function saveManualAttendeeToFirebase(attendee) {
  try {
    // 1. Simpan ke Firestore manual_attendees
    const docRef = doc(db, MANUAL_ATTENDEES_COLLECTION, attendee.ticketId);
    await setDoc(docRef, attendee, { merge: true });
    console.log("✅ Berhasil disimpan ke Firestore (manual_attendees):", attendee.ticketId);

    // 2. Sync ke Google Sheets (Data Manual)
    syncToGoogleSheets({
      ...attendee,
      isManualOTS: true,
      targetSheet: "Data Manual"
    });

    return { success: true };
  } catch (error) {
    console.error("❌ Gagal simpan manual ke Firebase:", error);
    syncToGoogleSheets({
      ...attendee,
      isManualOTS: true,
      targetSheet: "Data Manual"
    });
    return { success: false, error };
  }
}

/**
 * Ambil semua data pendaftar online dari Firestore
 */
export async function getAttendeesFromFirebase() {
  try {
    const q = query(collection(db, ATTENDEES_COLLECTION), orderBy("registeredAt", "asc"));
    const snapshot = await getDocs(q);
    const list = [];
    snapshot.forEach(docSnap => {
      list.push(docSnap.data());
    });
    return list;
  } catch (error) {
    console.warn("⚠️ Gagal mengambil dari Firebase, fallback ke LocalStorage:", error);
    const local = localStorage.getItem("solid_ground_attendees");
    return local ? JSON.parse(local) : [];
  }
}

/**
 * Ambil semua data pendaftar manual Hari-H dari Firestore
 */
export async function getManualAttendeesFromFirebase() {
  try {
    const q = query(collection(db, MANUAL_ATTENDEES_COLLECTION), orderBy("registeredAt", "asc"));
    const snapshot = await getDocs(q);
    const list = [];
    snapshot.forEach(docSnap => {
      list.push(docSnap.data());
    });
    return list;
  } catch (error) {
    console.warn("⚠️ Gagal mengambil manual dari Firebase, fallback ke LocalStorage:", error);
    const local = localStorage.getItem("solid_ground_manual_attendees");
    return local ? JSON.parse(local) : [];
  }
}

/**
 * Update status check-in peserta di Hari-H (Firestore & Google Sheets)
 */
export async function updateCheckInFirebase(ticketId, checkedIn, checkedInAt) {
  try {
    const docRef = doc(db, ATTENDEES_COLLECTION, ticketId);
    await updateDoc(docRef, {
      checkedIn: checkedIn,
      checkedInAt: checkedInAt
    });
    console.log(`✅ Status check-in ${ticketId} terupdate di Firestore:`, checkedIn);

    // Sync status check-in ke Google Sheets
    syncToGoogleSheets({
      action: "checkin",
      ticketId: ticketId,
      checkedIn: checkedIn,
      checkedInAt: checkedInAt
    });

    return { success: true };
  } catch (error) {
    console.error("❌ Gagal update status check-in ke Firebase:", error);
    return { success: false, error };
  }
}

/**
 * Real-time listener: Menangkap data pendaftar online & status scan langsung di semua HP panitia
 */
export function subscribeAttendeesFromFirebase(onUpdateCallback) {
  try {
    const q = query(collection(db, ATTENDEES_COLLECTION), orderBy("registeredAt", "asc"));
    return onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach(docSnap => {
        list.push(docSnap.data());
      });
      // Update local storage cache
      localStorage.setItem("solid_ground_attendees", JSON.stringify(list));
      if (typeof onUpdateCallback === "function") {
        onUpdateCallback(list);
      }
    }, (error) => {
      console.warn("Real-time snapshot error:", error);
    });
  } catch (err) {
    console.error("Gagal subscribe ke Firestore:", err);
    return null;
  }
}

/**
 * Real-time listener: Menangkap pendaftar manual Hari-H di collection manual_attendees
 */
export function subscribeManualAttendeesFromFirebase(onUpdateCallback) {
  try {
    const q = query(collection(db, MANUAL_ATTENDEES_COLLECTION), orderBy("registeredAt", "asc"));
    return onSnapshot(q, (snapshot) => {
      const list = [];
      snapshot.forEach(docSnap => {
        list.push(docSnap.data());
      });
      localStorage.setItem("solid_ground_manual_attendees", JSON.stringify(list));
      if (typeof onUpdateCallback === "function") {
        onUpdateCallback(list);
      }
    }, (error) => {
      console.warn("Real-time manual snapshot error:", error);
    });
  } catch (err) {
    console.error("Gagal subscribe manual ke Firestore:", err);
    return null;
  }
}
