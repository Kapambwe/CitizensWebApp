window.companyAppOffline = (() => {
    const databaseName = "companyapp-customer-offline";
    const databaseVersion = 2;
    const userScopedStores = ["responseCache", "entityCache", "outbox", "conflicts", "attachments"];
    let databasePromise;

    function openDatabase() {
        if (databasePromise) return databasePromise;

        databasePromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(databaseName, databaseVersion);
            request.onupgradeneeded = event => {
                const db = event.target.result;
                const transaction = event.target.transaction;
                createStore(db, "responseCache");
                createStore(db, "entityCache");
                createStore(db, "outbox");
                createStore(db, "conflicts");
                createStore(db, "attachments");
                createStore(db, "metadata");
                upgradeIndexes(db, transaction);
            };
            request.onsuccess = event => resolve(event.target.result);
            request.onerror = () => reject(request.error || new Error("Unable to open IndexedDB."));
        });

        return databasePromise;
    }

    function createStore(db, name) {
        if (db.objectStoreNames.contains(name)) return;
        const store = db.createObjectStore(name, { keyPath: "key" });
        if (userScopedStores.includes(name)) {
            store.createIndex("userScope", "value.userScope", { unique: false });
        }
    }

    function upgradeIndexes(db, transaction) {
        for (const name of userScopedStores) {
            if (!db.objectStoreNames.contains(name)) continue;
            const store = transaction.objectStore(name);
            if (!store.indexNames.contains("userScope")) {
                store.createIndex("userScope", "value.userScope", { unique: false });
            }
        }
        const cache = transaction.objectStore("responseCache");
        if (!cache.indexNames.contains("expiresAt")) {
            cache.createIndex("expiresAt", "value.ExpiresAtUtc", { unique: false });
        }
        const outbox = transaction.objectStore("outbox");
        if (!outbox.indexNames.contains("state")) {
            outbox.createIndex("state", "value.State", { unique: false });
        }
        if (!outbox.indexNames.contains("nextAttemptAt")) {
            outbox.createIndex("nextAttemptAt", "value.NextAttemptAtUtc", { unique: false });
        }
    }

    async function put(storeName, key, value) {
        const db = await openDatabase();
        return transaction(db, storeName, "readwrite", store => store.put({ key, value }));
    }

    async function get(storeName, key) {
        const db = await openDatabase();
        const item = await request(db.transaction(storeName, "readonly").objectStore(storeName).get(key));
        return item?.value ?? null;
    }

    async function remove(storeName, key) {
        const db = await openDatabase();
        return transaction(db, storeName, "readwrite", store => store.delete(key));
    }

    async function getAll(storeName) {
        const db = await openDatabase();
        const items = await request(db.transaction(storeName, "readonly").objectStore(storeName).getAll());
        return (items || []).map(item => item.value);
    }

    async function clearUserData(userScope) {
        const db = await openDatabase();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(userScopedStores, "readwrite");
            for (const name of userScopedStores) {
                const store = transaction.objectStore(name);
                const cursorRequest = store.openCursor();
                cursorRequest.onsuccess = event => {
                    const cursor = event.target.result;
                    if (!cursor) return;
                    if (cursor.value?.value?.userScope === userScope) cursor.delete();
                    cursor.continue();
                };
            }
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error || new Error("Unable to clear offline data."));
        });
    }

    async function estimate() {
        if (!navigator.storage?.estimate) return { usageBytes: 0, quotaBytes: null };
        const result = await navigator.storage.estimate();
        return { usageBytes: result.usage || 0, quotaBytes: result.quota || null };
    }

    function request(request) {
        return new Promise((resolve, reject) => {
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error || new Error("IndexedDB request failed."));
        });
    }

    function transaction(db, storeName, mode, operation) {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, mode);
            operation(transaction.objectStore(storeName));
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed."));
            transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted."));
        });
    }

    return { put, get, remove, getAll, clearUserData, estimate };
})();
