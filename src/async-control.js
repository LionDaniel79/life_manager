// A deadline releases the UI; it does not cancel a Firestore write.
export function withTimeout(operation, milliseconds = 8000, message = '서버 응답이 늦습니다. 인터넷 연결을 확인하고 다시 시도하세요.') {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(message), { code: 'deadline-exceeded' })), milliseconds);
  });
  return Promise.race([Promise.resolve().then(() => typeof operation === 'function' ? operation() : operation), timeout])
    .finally(() => clearTimeout(timer));
}

export function createReadCache({ timeoutMs = 8000, maxAgeMs = 15000, clock = Date.now } = {}) {
  const requests = new Map();
  return {
    read(key, operation) {
      const existing = requests.get(key);
      if (existing?.pending || existing && clock() - existing.completedAt < maxAgeMs) return existing.promise;
      const entry = { pending: true, completedAt: 0 };
      entry.promise = withTimeout(operation, timeoutMs).then((value) => {
        entry.pending = false;
        entry.completedAt = clock();
        return value;
      }, (error) => {
        if (requests.get(key) === entry) requests.delete(key);
        throw error;
      });
      requests.set(key, entry);
      return entry.promise;
    },
    invalidate(prefix = '') {
      for (const key of requests.keys()) if (key.startsWith(prefix)) requests.delete(key);
    },
  };
}
