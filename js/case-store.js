/* ============================================================
   저장한 현장 보관소 — 이 브라우저 안에서만
   ------------------------------------------------------------
   사진까지 함께 보관해야 해서 localStorage 가 아니라 IndexedDB 를 쓴다.
   localStorage 는 문자열만 담기고 한도가 5MB 안팎이라, 사진 몇 장이면
   저장이 통째로 실패한다 — 그러면 사장님이 적어둔 현장이 사라진다.

   여기 담긴 것은 어디로도 전송되지 않는다. 넘기실 때는 '복사' 나
   '내려받기' 로 사장님이 직접 꺼낸다.
   ============================================================ */
(function () {
  const DB_NAME = 'manmul-cases';
  const STORE = 'cases';
  const VERSION = 1;

  function open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: 'id' }).createIndex('savedAt', 'savedAt');
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('보관소를 열지 못했습니다'));
    });
  }

  function tx(mode, run) {
    return open().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const store = t.objectStore(STORE);
      let out;
      try { out = run(store); } catch (e) { reject(e); return; }
      t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
      // 저장 공간이 다 찼을 때가 가장 흔한 실패다. 그대로 던져서 화면이 알려주게 한다.
      t.onerror = () => reject(t.error || new Error('보관소 쓰기에 실패했습니다'));
      t.onabort = () => reject(t.error || new Error('보관소 쓰기가 중단됐습니다'));
    }));
  }

  async function all() {
    const rows = await tx('readonly', (s) => s.getAll());
    // 저장한 순서대로 — 밀린 것을 넘길 때 현장 순서가 뒤섞이면 사장님이 헷갈린다
    return (rows || []).sort((a, b) => String(a.savedAt).localeCompare(String(b.savedAt)));
  }
  const put = (rec) => tx('readwrite', (s) => s.put(rec));
  const remove = (id) => tx('readwrite', (s) => s.delete(id));

  async function removeDone() {
    const rows = await all();
    const done = rows.filter((r) => r.status === 'done');
    for (const r of done) await remove(r.id);
    return done.length;
  }

  window.ManmulCaseStore = { all, put, remove, removeDone };
})();
