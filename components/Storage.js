import { getFirestore, doc, setDoc, getDoc } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-firestore.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js';

let db = null;
let syncTimeout = null;
const SYNC_DELAY = 2000; // Wait 2 seconds after last change before syncing to cloud

const Storage = {
    // Initialize Firestore
    initCloud: (firebaseApp) => {
        db = getFirestore(firebaseApp);

        // Add beforeunload listener to ensure last-second sync
        window.addEventListener('beforeunload', () => {
            if (syncTimeout) {
                clearTimeout(syncTimeout);
                Storage._syncNow(); // Attempt one last synchronous-ish sync
            }
        });
    },

    // Save data to localStorage + schedule cloud sync
    save: (key, data) => {
        try {
            const serializedData = JSON.stringify(data);
            localStorage.setItem(key, serializedData);

            // Schedule a debounced cloud sync
            Storage._scheduleSync();
        } catch (error) {
            console.error('Error saving to localStorage:', error);
        }
    },

    // Get data from localStorage
    get: (key, defaultValue = null) => {
        try {
            const serializedData = localStorage.getItem(key);
            if (serializedData === null) {
                return defaultValue;
            }
            return JSON.parse(serializedData);
        } catch (error) {
            console.error('Error getting from localStorage:', error);
            return defaultValue;
        }
    },

    // Export all localStorage data as a JSON file download
    exportAll: () => {
        try {
            const allData = {};
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                try {
                    allData[key] = JSON.parse(localStorage.getItem(key));
                } catch {
                    allData[key] = localStorage.getItem(key);
                }
            }

            const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const dateStr = new Date().toISOString().split('T')[0];
            a.href = url;
            a.download = `pdca_backup_${dateStr}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error exporting data:', error);
            alert('Failed to export data. Please try again.');
        }
    },

    // Import data from a JSON object into localStorage
    importAll: (jsonData) => {
        try {
            const keys = Object.keys(jsonData);
            if (keys.length === 0) {
                alert('The backup file is empty.');
                return;
            }

            if (!confirm(`This will restore ${keys.length} data entries. Your current data will be overwritten. Continue?`)) {
                return;
            }

            localStorage.clear();
            keys.forEach(key => {
                localStorage.setItem(key, JSON.stringify(jsonData[key]));
            });

            // Sync imported data to cloud
            Storage._syncNow();

            alert('Data restored successfully! The page will now reload.');
            window.location.reload();
        } catch (error) {
            console.error('Error importing data:', error);
            alert('Failed to import data. Please check the file format.');
        }
    },

    // ---- Cloud Sync Methods ----

    // Schedule a debounced sync (waits 2s after last change)
    _scheduleSync: () => {
        if (syncTimeout) clearTimeout(syncTimeout);
        syncTimeout = setTimeout(() => {
            Storage._syncNow();
        }, SYNC_DELAY);
    },

    // Immediately sync all localStorage to Firestore
    _syncNow: async () => {
        const auth = getAuth();
        if (!db || !auth.currentUser) return;

        try {
            const allData = {};
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                try {
                    allData[key] = JSON.parse(localStorage.getItem(key));
                } catch {
                    allData[key] = localStorage.getItem(key);
                }
            }

            const userDoc = doc(db, 'users', auth.currentUser.uid);
            await setDoc(userDoc, {
                data: allData,
                lastUpdated: new Date().toISOString(),
                email: auth.currentUser.email
            });

            // Dispatch event to update sync status in UI
            window.dispatchEvent(new CustomEvent('cloud-sync-status', { detail: 'synced' }));
            console.log('☁️ Data synced to cloud');
        } catch (error) {
            console.error('Error syncing to cloud:', error);
            window.dispatchEvent(new CustomEvent('cloud-sync-status', { detail: 'error' }));
        }
    },

    // Pull all data from Firestore into localStorage
    syncFromCloud: async (forceOverwrite = false) => {
        const auth = getAuth();
        if (!db || !auth.currentUser) return false;

        try {
            console.log('🔄 Checking cloud for updates...');
            const userDoc = doc(db, 'users', auth.currentUser.uid);
            const snapshot = await getDoc(userDoc);

            if (snapshot.exists()) {
                const cloudData = snapshot.data().data;
                const cloudKeys = Object.keys(cloudData);

                if (cloudKeys.length > 0) {
                    if (forceOverwrite) {
                        localStorage.clear();
                        cloudKeys.forEach(key => {
                            localStorage.setItem(key, JSON.stringify(cloudData[key]));
                        });
                        console.log('☁️ Forced overwrite from cloud');
                        return true;
                    }

                    // Check if local has any data (besides app_settings)
                    const localKeys = [];
                    for (let i = 0; i < localStorage.length; i++) {
                        localKeys.push(localStorage.key(i));
                    }
                    const hasLocalData = localKeys.some(k => k.startsWith('daily_') || k.startsWith('monthly_') || k === 'yearly_data' || k === 'mymap_data' || k === 'schedule_4week_v3' || k === 'schedule_app_v6');

                    if (hasLocalData) {
                        // Merge: cloud data fills in missing keys
                        let importedCount = 0;
                        cloudKeys.forEach(key => {
                            if (!localStorage.getItem(key)) {
                                localStorage.setItem(key, JSON.stringify(cloudData[key]));
                                importedCount++;
                            }
                        });
                        console.log(`☁️ Synced ${importedCount} new keys from cloud`);

                        // If we have local data but cloud has something too, we might want to alert the user if they vary significantly.
                        // For now, we trust the merge or return true if anything new was found.
                        return importedCount > 0;
                    } else {
                        // No local data — restore everything from cloud
                        cloudKeys.forEach(key => {
                            localStorage.setItem(key, JSON.stringify(cloudData[key]));
                        });
                        console.log(`☁️ Restored ${cloudKeys.length} keys from cloud`);
                        return true;
                    }
                }
            } else {
                // No cloud data exists yet — push local data up
                console.log('☁️ No cloud data found, initializing from local...');
                await Storage._syncNow();
            }

            return false;
        } catch (error) {
            console.error('Error syncing from cloud:', error);
            return false;
        }
    }
};

export default Storage;
