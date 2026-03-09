import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-app.js';
import { getAuth, signInWithPopup, signOut, onAuthStateChanged, GoogleAuthProvider } from 'https://www.gstatic.com/firebasejs/12.9.0/firebase-auth.js';
import firebaseConfig from './firebase-config.js';
import MyMap from './components/MyMap.js?v=5';
import YearlyPlan from './components/YearlyPlan.js?v=5';
import MonthlyPlan from './components/MonthlyPlan.js?v=5';
import DailyReport from './components/DailyReport.js?v=5';
import Storage from './components/Storage.js?v=10';

// Initialize Firebase
const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
Storage.initCloud(firebaseApp);

const tabs = [
    { id: 'daily', label: 'Daily Report', icon: 'calendar-check', component: DailyReport },
    { id: 'monthly', label: 'Monthly Plan', icon: 'calendar', component: MonthlyPlan },
    { id: 'yearly', label: 'Yearly Plan', icon: 'calendar-range', component: YearlyPlan },
    { id: 'mymap', label: 'My Map', icon: 'map', component: MyMap },
];

let currentTabId = 'daily';

// ---- Auth UI ----
function renderAuthSection() {
    const authSection = document.getElementById('auth-section');
    if (!authSection) return;

    const user = auth.currentUser;

    if (user) {
        // Signed in: show avatar + sign out
        const photoURL = user.photoURL || '';
        const displayName = user.displayName || user.email || 'User';
        authSection.innerHTML = `
            <div class="flex items-center space-x-2">
                ${photoURL
                ? `<img src="${photoURL}" alt="" class="w-7 h-7 rounded-full border border-gray-200">`
                : `<div class="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-brand-600 text-xs font-bold">${displayName.charAt(0).toUpperCase()}</div>`
            }
                <span class="text-sm text-gray-600 font-medium hidden lg:inline max-w-[100px] truncate">${displayName.split(' ')[0]}</span>
                <button id="btn-signout" title="Sign Out" class="p-1.5 rounded-md text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors duration-200">
                    <i data-lucide="log-out" class="w-4 h-4"></i>
                </button>
            </div>
        `;
        document.getElementById('btn-signout').addEventListener('click', async () => {
            await signOut(auth);
        });

        // Show sync status
        const syncStatus = document.getElementById('sync-status');
        if (syncStatus) syncStatus.classList.replace('hidden', 'flex');

    } else {
        // Signed out: show sign-in button
        authSection.innerHTML = `
            <button id="btn-signin" class="flex items-center space-x-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 hover:shadow-sm transition-all duration-200 text-sm font-medium text-gray-600">
                <svg class="w-4 h-4" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                <span>Sign in</span>
            </button>
        `;
        document.getElementById('btn-signin').addEventListener('click', async () => {
            try {
                const provider = new GoogleAuthProvider();
                await signInWithPopup(auth, provider);
            } catch (error) {
                if (error.code !== 'auth/popup-closed-by-user') {
                    console.error('Sign-in error:', error);
                    alert('Sign-in failed. Please try again.');
                }
            }
        });

        // Hide sync status
        const syncStatus = document.getElementById('sync-status');
        if (syncStatus) syncStatus.classList.replace('flex', 'hidden');
    }

    lucide.createIcons();
}

// ---- Cloud Sync Status Listener ----
window.addEventListener('cloud-sync-status', (e) => {
    const syncText = document.getElementById('sync-text');
    const syncStatus = document.getElementById('sync-status');
    if (!syncText || !syncStatus) return;

    if (e.detail === 'synced') {
        syncText.textContent = 'Synced';
        syncStatus.className = 'flex items-center text-xs text-green-500';
        setTimeout(() => {
            syncStatus.className = 'flex items-center text-xs text-gray-400';
        }, 3000);
    } else if (e.detail === 'error') {
        syncText.textContent = 'Sync error';
        syncStatus.className = 'flex items-center text-xs text-red-400';
    }
});

// ---- Auth State Observer ----
onAuthStateChanged(auth, async (user) => {
    renderAuthSection();

    if (user) {
        // User signed in — sync data from cloud
        const hadCloudData = await Storage.syncFromCloud();
        if (hadCloudData) {
            // Re-render the current tab to show synced data
            renderContent();
        }
    }
});

function renderDataActions() {
    const actionsContainer = document.getElementById('data-actions');
    if (!actionsContainer) return;

    actionsContainer.innerHTML = `
        <button id="btn-export" title="Export Data (Backup)" class="p-2 rounded-md text-gray-500 hover:text-brand-600 hover:bg-brand-50 transition-colors duration-200">
            <i data-lucide="download" class="w-5 h-5"></i>
        </button>
        <button id="btn-import" title="Import Data (Restore)" class="p-2 rounded-md text-gray-500 hover:text-brand-600 hover:bg-brand-50 transition-colors duration-200">
            <i data-lucide="upload" class="w-5 h-5"></i>
        </button>
        <input type="file" id="import-file-input" accept=".json" class="hidden">
    `;

    // Export button
    document.getElementById('btn-export').addEventListener('click', () => {
        Storage.exportAll();
    });

    // Import button → triggers hidden file input
    document.getElementById('btn-import').addEventListener('click', () => {
        document.getElementById('import-file-input').click();
    });

    // File input change → read and import
    document.getElementById('import-file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const jsonData = JSON.parse(event.target.result);
                Storage.importAll(jsonData);
            } catch (error) {
                alert('Invalid JSON file. Please select a valid backup file.');
            }
        };
        reader.readAsText(file);

        // Reset input so the same file can be selected again
        e.target.value = '';
    });

    lucide.createIcons();
}

function renderTabs() {
    const navContainer = document.getElementById('nav-tabs');
    navContainer.innerHTML = ''; // Clear existing tabs

    const nav = document.getElementById('nav-tabs');
    nav.className = "flex space-x-4";
    nav.innerHTML = '';

    tabs.forEach(tab => {
        const button = document.createElement('button');
        const isActive = tab.id === currentTabId;

        button.className = `
            ${isActive
                ? 'bg-brand-50 text-brand-700'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'}
            px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 flex items-center
        `;

        button.innerHTML = `
            <i data-lucide="${tab.icon}" class="w-4 h-4 mr-2"></i>
            ${tab.label}
        `;

        button.onclick = () => switchTab(tab.id);
        nav.appendChild(button);
    });

    // Re-initialize icons
    lucide.createIcons();
}

function renderContent() {
    const appContainer = document.getElementById('app-container');
    appContainer.innerHTML = '';

    const activeTab = tabs.find(t => t.id === currentTabId);
    if (activeTab && activeTab.component) {
        // Render the component
        const content = activeTab.component.render();
        appContainer.appendChild(content);

        // Execute any after-render logic if the component has it
        if (activeTab.component.afterRender) {
            activeTab.component.afterRender();
        }
    }
}

// Global Event Listener for re-rendering tabs
window.addEventListener('render-tab', (e) => {
    const tabLabel = e.detail;
    const tab = tabs.find(t => t.label === tabLabel);
    if (tab) {
        renderContent();
    }
});

function switchTab(tabId) {
    currentTabId = tabId;
    renderTabs();
    renderContent();
    // Default to scrolling to top when switching tabs
    window.scrollTo({ top: 0, behavior: 'instant' });
}

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    // Expose switchTab globally so components can use it
    window.switchTab = switchTab;

    // Render data action buttons (Export/Import)
    renderDataActions();

    // Render auth section
    renderAuthSection();

    // Initial Render
    renderTabs();
    renderContent();
});
