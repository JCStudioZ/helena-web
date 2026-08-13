// Cloud-save bridge for the web build. Loaded by the exported page via the
// preset's head_include; the game reaches it as window.HelenaCloud through
// Godot's JavaScriptBridge. With an empty config below, `configured` stays
// false and the game runs purely local — safe to ship as-is.
//
// Paste the web app config from the Firebase console here. These values are
// public client identifiers (they appear in every player's browser); access
// control lives in the Firestore security rules, not in their secrecy.
const firebaseConfig = {
  apiKey: "AIzaSyDDX2CDaliW0NJjhTK4mXysiulYEDnR7rU",
  authDomain: "helena-e5527.firebaseapp.com",
  projectId: "helena-e5527",
  storageBucket: "helena-e5527.firebasestorage.app",
  messagingSenderId: "759535110768",
  appId: "1:759535110768:web:ebdcd571b359afdb5982b5",
};

window.HelenaCloud = { configured: Object.keys(firebaseConfig).length > 0 };

if (window.HelenaCloud.configured) {
  const load = (m) => import(`https://www.gstatic.com/firebasejs/10.12.2/${m}`);
  Promise.all([
    load("firebase-app.js"),
    load("firebase-auth.js"),
    load("firebase-firestore.js"),
  ]).then(([appM, authM, fsM]) => {
    const app = appM.initializeApp(firebaseConfig);
    const auth = authM.getAuth(app);
    const db = fsM.getFirestore(app);
    const cloud = window.HelenaCloud;

    const userJson = (u) => JSON.stringify({
      uid: u.uid,
      anon: u.isAnonymous,
      label: u.email || u.displayName || "",
    });

    // Reuse the persisted session if there is one; otherwise mint a silent
    // anonymous identity. Either way the game learns who it is.
    cloud.ensureAnon = (cb) => {
      const off = authM.onAuthStateChanged(auth, (user) => {
        off();
        if (user) cb(userJson(user));
        else authM.signInAnonymously(auth)
          .then((r) => cb(userJson(r.user)))
          .catch(() => cb(JSON.stringify({ uid: "", anon: true, label: "" })));
      });
    };

    // Upgrade the anonymous identity to the player's Google account. If that
    // account was already used on another device, linking is refused — sign
    // into the existing account instead and let the game merge progress.
    cloud.linkGoogle = (cb) => {
      const provider = new authM.GoogleAuthProvider();
      authM.linkWithPopup(auth.currentUser, provider)
        .then((r) => cb(JSON.stringify({ ok: true, uid: r.user.uid, label: r.user.email || "" })))
        .catch(async (e) => {
          try {
            if (e.code === "auth/credential-already-in-use") {
              const cred = authM.GoogleAuthProvider.credentialFromError(e);
              const r = await authM.signInWithCredential(auth, cred);
              cb(JSON.stringify({ ok: true, uid: r.user.uid, label: r.user.email || "" }));
              return;
            }
            cb(JSON.stringify({ ok: false, err: e.code || String(e) }));
          } catch (e2) {
            cb(JSON.stringify({ ok: false, err: e2.code || String(e2) }));
          }
        });
    };

    cloud.pull = (cb) => {
      fsM.getDoc(fsM.doc(db, "users", auth.currentUser.uid))
        .then((snap) => cb(snap.exists() ? JSON.stringify(snap.data()) : ""))
        .catch(() => cb(""));
    };

    cloud.push = (json, cb) => {
      fsM.setDoc(fsM.doc(db, "users", auth.currentUser.uid), JSON.parse(json))
        .then(() => cb("ok"))
        .catch((e) => cb("err:" + (e.code || e)));
    };
  });
}
