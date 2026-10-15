import { firebaseConfig, feedbackOwner } from '../firebase_config-93c62bf8e38bec17.mjs';
import { mountReview } from './review_ui-2dd922d85d193da0.mjs';

try {
  const load = name => import(`https://www.gstatic.com/firebasejs/10.12.2/firebase-${name}.js`);
  const [appM, authM, fs] = await Promise.all(['app','auth','firestore'].map(load));
  // A separate named app prevents owner sign-in from changing the game session.
  const app = appM.initializeApp(firebaseConfig, 'helena-feedback-review');
  const auth = authM.getAuth(app), db = fs.getFirestore(app);
  const notes = fs.collection(db, 'feedback');
  const serialize = snap => ({...snap.data(), id:snap.id, created_at:snap.data().created_at?.toDate().toISOString()});
  const provider = new authM.GoogleAuthProvider(); provider.setCustomParameters({login_hint:feedbackOwner});
  mountReview({
    signIn: () => authM.signInWithPopup(auth, provider),
    signOut: () => authM.signOut(auth),
    watchAuth: cb => authM.onAuthStateChanged(auth, user => cb(user && {
      email:user.email, owner:user.emailVerified && user.email === feedbackOwner,
    })),
    store: {
      async list(cursor) {
        const q = fs.query(notes, fs.orderBy('created_at','desc'), ...(cursor ? [fs.startAfter(cursor)] : []), fs.limit(100));
        const result = await fs.getDocsFromServer(q);
        return {rows:result.docs.map(serialize), cursor:result.docs.at(-1), more:result.size === 100};
      },
      async approved() {
        const result = await fs.getDocsFromServer(fs.query(notes, fs.where('status','==','approved')));
        return result.docs.map(serialize);
      },
      async setStatus(id, previous, status) {
        await fs.runTransaction(db, async tx => {
          const ref = fs.doc(db, 'feedback', id), snap = await tx.get(ref);
          if (!snap.exists() || snap.data().status !== previous) throw new Error('Feedback changed; refresh first');
          tx.update(ref, {status, reviewed_at:fs.serverTimestamp(), reviewed_by:auth.currentUser.uid});
        });
      },
    },
  });
} catch {
  document.getElementById('status').textContent = 'Couldn’t connect. Check your connection and reload.';
  document.getElementById('status').classList.add('error');
  document.getElementById('sign-in').disabled = true;
}
