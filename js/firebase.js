/* Shopwise – Firebase (Authentication, Firestore, Analytics)
   Gebruikt de officiële Firebase-modules via de CDN, dus zonder npm of build. */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  updateProfile,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBjNpNi0bcIsQkiLUT499QjkNDQWFoVHeo",
  authDomain: "kitacat-shopwise.firebaseapp.com",
  projectId: "kitacat-shopwise",
  storageBucket: "kitacat-shopwise.firebasestorage.app",
  messagingSenderId: "596519135583",
  appId: "1:596519135583:web:c0943eeb52c7225fab2eea",
  measurementId: "G-0BBH1W4Z7N"
};

const app = initializeApp(firebaseConfig);

/* Analytics: alleen aanzetten als de browser dit ondersteunt.
   Dynamisch geladen, zodat een adblocker de rest van de site niet kan breken. */
import("https://www.gstatic.com/firebasejs/10.14.1/firebase-analytics.js")
  .then(function (m) {
    return m.isSupported().then(function (ondersteund) {
      if (ondersteund) m.getAnalytics(app);
    });
  })
  .catch(function () { /* Analytics is optioneel */ });

const auth = getAuth(app);
auth.languageCode = "nl";
const db = getFirestore(app);

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

/* ---------- Auth-status ---------- */

const luisteraars = [];
let laatsteStatus = { bekend: false, gebruiker: null };
let registratieBezig = false;

function naarGebruiker(user) {
  if (!user) return null;
  const email = user.email || "";
  const info = user.providerData && user.providerData[0];
  return {
    uid: user.uid,
    naam: user.displayName || (email ? email.split("@")[0] : "Klant"),
    email: email,
    provider: (info && info.providerId) || "password"
  };
}

function meld(user) {
  laatsteStatus = { bekend: true, gebruiker: naarGebruiker(user) };
  luisteraars.forEach(function (cb) {
    try { cb(laatsteStatus.gebruiker); } catch (e) { console.error(e); }
  });
}

onAuthStateChanged(auth, function (user) {
  /* Tijdens registratie wachten we tot de naam is opgeslagen. */
  if (registratieBezig) return;
  meld(user);
});

/* ---------- Firestore-verwijzingen ---------- */

function profielRef(uid) { return doc(db, "users", uid); }
function mandRef(uid) { return doc(db, "users", uid, "baskets", "current"); }
function adresRef(uid) { return doc(db, "users", uid, "addresses", "default"); }

function tekst(waarde, max) {
  return String(waarde == null ? "" : waarde).slice(0, max);
}

/* ---------- Publieke API voor app.js ---------- */

window.ShopwiseCloud = {
  onAuth: function (cb) {
    luisteraars.push(cb);
    if (laatsteStatus.bekend) cb(laatsteStatus.gebruiker);
  },

  inloggen: function (email, wachtwoord) {
    return signInWithEmailAndPassword(auth, email, wachtwoord);
  },

  registreer: async function (naam, email, wachtwoord) {
    registratieBezig = true;
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, wachtwoord);
      try {
        await updateProfile(cred.user, { displayName: naam });
      } catch (e) {
        console.warn("Naam kon niet worden opgeslagen", e);
      }
    } finally {
      registratieBezig = false;
    }
    meld(auth.currentUser);
  },

  inloggenGoogle: function () {
    return signInWithPopup(auth, googleProvider);
  },

  uitloggen: function () {
    return signOut(auth);
  },

  resetWachtwoord: function (email) {
    return sendPasswordResetEmail(auth, email);
  },

  bewaarProfiel: function (uid, profiel) {
    return setDoc(profielRef(uid), {
      naam: tekst(profiel.naam, 100) || "Klant",
      email: tekst(profiel.email, 254),
      bijgewerkt: serverTimestamp()
    }, { merge: true });
  },

  /* Winkelmand: { productId: aantal } */
  laadMand: async function (uid) {
    const snap = await getDoc(mandRef(uid));
    if (!snap.exists()) return {};
    const data = snap.data() || {};
    return data.items && typeof data.items === "object" ? data.items : {};
  },

  bewaarMand: function (uid, items) {
    return setDoc(mandRef(uid), {
      items: items,
      bijgewerkt: serverTimestamp()
    });
  },

  /* Nederlands bezorgadres */
  laadAdres: async function (uid) {
    const snap = await getDoc(adresRef(uid));
    if (!snap.exists()) return null;
    const d = snap.data() || {};
    return {
      voornaam: d.voornaam || "",
      achternaam: d.achternaam || "",
      email: d.email || "",
      telefoon: d.telefoon || "",
      postcode: d.postcode || "",
      huisnummer: d.huisnummer || "",
      toevoeging: d.toevoeging || "",
      straat: d.straat || "",
      woonplaats: d.woonplaats || ""
    };
  },

  bewaarAdres: function (uid, a) {
    return setDoc(adresRef(uid), {
      voornaam: tekst(a.voornaam, 60),
      achternaam: tekst(a.achternaam, 80),
      email: tekst(a.email, 120),
      telefoon: tekst(a.telefoon, 30),
      postcode: tekst(a.postcode, 7),
      huisnummer: tekst(a.huisnummer, 5),
      toevoeging: tekst(a.toevoeging, 6),
      straat: tekst(a.straat, 80),
      woonplaats: tekst(a.woonplaats, 60),
      bijgewerkt: serverTimestamp()
    });
  },

  verwijderAdres: function (uid) {
    return deleteDoc(adresRef(uid));
  }
};
