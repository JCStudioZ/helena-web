// The same request ID survives retries. A transaction acknowledges an existing
// identical note without rewriting its review status or creating a duplicate.
export const contextKeys = ['game_type', 'game_name', 'mode', 'difficulty', 'puzzle_seed'];
export function normalizeFeedback(input) {
  if (!/^[a-f0-9]{32}$/.test(input.request_id || '')) throw new Error('Invalid request ID');
  const text = String(input.text || '').trim();
  if (!text || [...text].length > 2000) throw new Error('Invalid feedback length');
  const result = { text };
  for (const key of contextKeys) {
    if (typeof input[key] !== 'string' || !input[key] || input[key].length > 80) throw new Error(`Invalid ${key}`);
    result[key] = input[key];
  }
  if (!/^-?[0-9]{1,20}$/.test(result.puzzle_seed)) throw new Error('Invalid seed');
  return result;
}

export function createFeedbackSender({ getUser, db, fs, now = Date.now }) {
  return async (input, deadline = now() + 12000) => {
    const data = normalizeFeedback(input);
    const checkDeadline = () => { if (now() >= deadline) throw new Error('Feedback timed out'); };
    let timer;
    try {
      await Promise.race([
        (async () => {
          checkDeadline();
          const user = await getUser();
          checkDeadline();
          const ref = fs.doc(db, 'feedback', `${user.uid}_${input.request_id}`);
          await fs.runTransaction(db, async tx => {
            checkDeadline();
            const existing = await tx.get(ref);
            checkDeadline();
            if (existing.exists()) {
              const saved = existing.data();
              if (Object.keys(data).some(key => saved[key] !== data[key])) throw new Error('Request ID already used');
              return;
            }
            tx.set(ref, { ...data, author_uid: user.uid, status: 'new', created_at: fs.serverTimestamp() });
          });
        })(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Feedback timed out')), Math.max(1, deadline - now())); }),
      ]);
    } finally { clearTimeout(timer); }
  };
}

export function approvedQueue(rows) {
  return rows.filter(row => row.status === 'approved').map(row => ({
    id: row.id, text: row.text, ...Object.fromEntries(contextKeys.map(key => [key, row[key]])),
    status: row.status,
  }));
}
