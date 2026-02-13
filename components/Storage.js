const Storage = {
    // Save data to localStorage
    save: (key, data) => {
        try {
            const serializedData = JSON.stringify(data);
            localStorage.setItem(key, serializedData);
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

            alert('Data restored successfully! The page will now reload.');
            window.location.reload();
        } catch (error) {
            console.error('Error importing data:', error);
            alert('Failed to import data. Please check the file format.');
        }
    }
};

export default Storage;
