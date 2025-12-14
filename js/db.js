class NanoDB {
    constructor() {
        this.dbName = 'nanobanana_db';
        this.dbVersion = 1;
        this.db = null;
    }

    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onerror = (event) => {
                console.error("Database error: " + event.target.errorCode);
                reject("Database error");
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log("DB Initialized");
                resolve(this.db);
            };

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                // History Store: id as key
                if (!db.objectStoreNames.contains('history')) {
                    const objectStore = db.createObjectStore('history', { keyPath: 'id' });
                    objectStore.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
        });
    }

    async saveHistoryItem(item) {
        if (!this.db) await this.init();

        // 1. Save Local (always)
        const localSave = new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['history'], 'readwrite');
            const store = transaction.objectStore('history');
            const request = store.put(item); // Use put to allow overwrites (sync)

            request.onsuccess = () => resolve(item);
            request.onerror = (e) => reject(e.target.error);
        });

        // 2. Save Cloud (if logged in)
        if (typeof firebase !== 'undefined' && firebase.auth().currentUser) {
            this.saveToCloud(item, firebase.auth().currentUser).catch(err => console.error("Cloud save failed:", err));
        }

        return localSave;
    }

    async saveToCloud(item, user) {
        const db = firebase.firestore();
        const storageRef = firebase.storage().ref();
        const batch = db.batch();

        // Upload images first
        const imageUrls = await Promise.all(item.images.map(async (img, idx) => {
            if (img.startsWith('http')) return img; // Already a URL

            // Assume Base64
            const path = `users/${user.uid}/images/${item.timestamp}_${idx}.png`;
            const imgRef = storageRef.child(path);
            await imgRef.putString(img, 'data_url');
            return await imgRef.getDownloadURL();
        }));

        const cloudItem = { ...item, images: imageUrls };
        const docRef = db.collection('users').doc(user.uid).collection('history').doc(String(item.id));

        await docRef.set(cloudItem);
        console.log("Saved to cloud:", item.id);
    }

    async syncWithCloud(user) {
        if (!user) return;
        console.log("Starting Cloud Sync...");
        const db = firebase.firestore();
        const snapshot = await db.collection('users').doc(user.uid).collection('history').orderBy('timestamp', 'desc').limit(50).get();

        if (snapshot.empty) return;

        let addedCount = 0;
        for (const doc of snapshot.docs) {
            const data = doc.data();
            // Try to save to local IDB (if not exists or update)
            // We use 'put' in saveHistoryItem which overwrites, effectively syncing down.
            // But we don't want to re-upload, so we bypass saveHistoryItem's cloud logic or split them.
            // Let's use internal _saveLocal helper.
            await this._saveLocal(data);
            addedCount++;
        }
        console.log(`Synced ${addedCount} items from cloud.`);
        return addedCount;
    }

    async migrateLocalToCloud(user, onProgress) {
        if (!user) return;
        const history = await this.getHistory();
        if (!history || history.length === 0) return;

        console.log("Migrating local history to cloud...", history.length);
        const db = firebase.firestore();
        // Reverse to process oldest first? Or newest? Doesn't matter much but consistent order helps.
        // Let's process chunk by chunk.

        let processed = 0;
        const total = history.length;
        const batchSize = 5; // Smaller batch for reliability with images

        for (let i = 0; i < total; i += batchSize) {
            const chunk = history.slice(i, i + batchSize);
            await Promise.all(chunk.map(async (item) => {
                try {
                    const docRef = db.collection('users').doc(user.uid).collection('history').doc(String(item.id));
                    const doc = await docRef.get();
                    if (!doc.exists) {
                        await this.saveToCloud(item, user);
                    }
                } catch (err) {
                    console.error(`Failed to migrate item ${item.id}:`, err);
                }
            }));
            processed += chunk.length;
            if (onProgress) onProgress(processed, total);
        }
        console.log("Migration complete.");
    }

    async _saveLocal(item) {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['history'], 'readwrite');
            const store = transaction.objectStore('history');
            const request = store.put(item);
            request.onsuccess = () => resolve(item);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async getHistory() {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['history'], 'readonly');
            const store = transaction.objectStore('history');
            const index = store.index('timestamp');
            const request = index.openCursor(null, 'prev'); // Newest first

            const results = [];
            request.onsuccess = (event) => {
                const cursor = event.target.result;
                if (cursor) {
                    results.push(cursor.value);
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async deleteHistoryItem(id) {
        if (!this.db) await this.init();
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['history'], 'readwrite');
            const store = transaction.objectStore('history');
            const request = store.delete(id);

            request.onsuccess = () => resolve(true);
            request.onerror = (e) => reject(e.target.error);
        });
    }

    async exportData() {
        const history = await this.getHistory();
        const savedPrompts = JSON.parse(localStorage.getItem('savedPrompts') || '[]');

        const data = {
            version: 1,
            timestamp: Date.now(),
            history: history,
            savedPrompts: savedPrompts,
            config: {
                apiKeys: JSON.parse(localStorage.getItem('savedApiKeys') || '[]'),
                autoTranslate: localStorage.getItem('autoTranslate')
            }
        };

        return JSON.stringify(data, null, 2);
    }

    async importData(jsonString) {
        try {
            const data = JSON.parse(jsonString);

            // Import History
            if (data.history && Array.isArray(data.history)) {
                for (const item of data.history) {
                    // Check if exists to avoid overwrite or dupes? 
                    // Simple strategy: Put all, IDB handles key collision or we use put
                    // For safety, let's use put (overwrite if same ID)
                    await this.saveHistoryItem(item).catch(e => console.warn('Skipping dupe', item.id));
                }
            }

            // Import Saved Prompts
            if (data.savedPrompts) {
                localStorage.setItem('savedPrompts', JSON.stringify(data.savedPrompts));
            }

            return { success: true, count: data.history?.length || 0 };
        } catch (e) {
            console.error(e);
            return { success: false, error: e.message };
        }
    }

    // Cloud Config Sync (API Keys, Saved Prompts)
    async saveUserConfig(user, config) {
        if (!user || typeof firebase === 'undefined') return;
        try {
            const db = firebase.firestore();
            await db.collection('users').doc(user.uid).set({
                config: config,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
            console.log("Config saved to cloud");
        } catch (err) {
            console.error("Failed to save config to cloud:", err);
        }
    }

    async getUserConfig(user) {
        if (!user || typeof firebase === 'undefined') return null;
        try {
            const db = firebase.firestore();
            const doc = await db.collection('users').doc(user.uid).get();
            if (doc.exists && doc.data().config) {
                console.log("Config loaded from cloud");
                return doc.data().config;
            }
            return null;
        } catch (err) {
            console.error("Failed to get config from cloud:", err);
            return null;
        }
    }
}

// Singleton instance
const nanoDB = new NanoDB();
