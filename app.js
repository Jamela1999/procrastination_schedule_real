import MyMap from './components/MyMap.js?v=4';
import YearlyPlan from './components/YearlyPlan.js?v=4';
import MonthlyPlan from './components/MonthlyPlan.js?v=4';
import DailyReport from './components/DailyReport.js?v=4';
import Storage from './components/Storage.js';

const tabs = [
    { id: 'daily', label: 'Daily Report', icon: 'calendar-check', component: DailyReport },
    { id: 'monthly', label: 'Monthly Plan', icon: 'calendar', component: MonthlyPlan },
    { id: 'yearly', label: 'Yearly Plan', icon: 'calendar-range', component: YearlyPlan },
    { id: 'mymap', label: 'My Map', icon: 'map', component: MyMap },
];

let currentTabId = 'daily';

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

    // Create container for tabs if not exists (in header)
    // Actually index.html has a specific spot for them.
    // Let's re-target the selection to match index.html structure properly.
    // In index.html: <nav ... id="nav-tabs">

    // We need to find the nav element in the header.
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

    // Initial Render
    renderTabs();
    renderContent();
});
