const APP_VERSION = 'v1.3.0 (UI Polish)';
const MODEL_NAME = 'gemini-3-pro-image-preview';
const TEXT_MODEL_NAME = 'gemini-2.5-flash-lite-preview-09-2025';
// API Key is now strictly dynamic from user usage

// UI Elements
const promptInput = document.getElementById('promptInput');
const analyzePromptBtn = document.getElementById('analyzePromptBtn');
const smartTagContainer = document.getElementById('smartTagContainer');
const generateBtn = document.getElementById('generateBtn');
const imageGrid = document.getElementById('imageGrid');
const resultsContainer = document.getElementById('resultsContainer');
const placeholderState = document.getElementById('placeholderState');
const countBtns = document.querySelectorAll('.count-btn');
const resolutionSelect = document.getElementById('resolutionSelect');
const historyList = document.getElementById('historyList');
const historySearchInput = document.getElementById('historySearchInput');
const savedPromptsList = document.getElementById('savedPromptsList');
const savedPromptsCount = document.getElementById('savedPromptsCount');
const translateToggleBtn = document.getElementById('translateToggleBtn');
const downloadGroup = document.getElementById('downloadGroup');
const downloadAllBtn = document.getElementById('downloadAllBtn');

// Settings Elements
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const closeSettingsBtn = document.getElementById('closeSettingsBtn');
const newApiKeyInput = document.getElementById('newApiKeyInput');
const newApiKeyAlias = document.getElementById('newApiKeyAlias');
const addApiKeyBtn = document.getElementById('addApiKeyBtn');
const apiKeyList = document.getElementById('apiKeyList');

const uiModeStandard = document.getElementById('uiModeStandard');
const uiModeStudio = document.getElementById('uiModeStudio');

// UI Toggles
const sidebar = document.querySelector('.sidebar');
const sidebarToggleBtn = document.getElementById('sidebarToggleBtn');
const logoHomeBtn = document.getElementById('logoHomeBtn');

// Studio UI Elements
const studioNav = document.getElementById('studioNav');
const navHome = document.getElementById('navHome');
const navPlayground = document.getElementById('navPlayground');
const studioHomeView = document.getElementById('studioHomeView');
const inputWrapper = document.querySelector('.input-area-wrapper');



// Version Display
const versionDisplay = document.createElement('div');
versionDisplay.className = 'version-display';
versionDisplay.textContent = APP_VERSION;
versionDisplay.style.cssText = `
    position: fixed;
    bottom: 10px;
    right: 10px;
    font-size: 0.7rem;
    color: var(--text-secondary);
    opacity: 0.5;
    pointer-events: none;
    z-index: 9999;
`;
document.body.appendChild(versionDisplay);

// Login/Logout Logic for Settings Modal
if (document.getElementById('settingsLoginBtn')) {
    document.getElementById('settingsLoginBtn').addEventListener('click', () => {
        authManager.loginWithGoogle();
    });
}
if (document.getElementById('settingsLogoutBtn')) {
    document.getElementById('settingsLogoutBtn').addEventListener('click', () => {
        if (confirm('로그아웃 하시겠습니까?')) {
            authManager.logout();
        }
    });
}

// Lightbox Logic
const lightbox = document.createElement('div');
lightbox.className = 'lightbox';
lightbox.innerHTML = '<img src="" alt="Full view">';
document.body.appendChild(lightbox);

const lightboxImg = lightbox.querySelector('img');

lightbox.addEventListener('click', () => {
    lightbox.classList.remove('active');
    setTimeout(() => lightbox.style.display = 'none', 300); // Wait for fade out
});

function openLightbox(url) {
    lightboxImg.src = url;
    lightbox.style.display = 'flex';
    requestAnimationFrame(() => lightbox.classList.add('active'));
}

// Preview Popup for History and Saved Prompts Hover
const previewPopup = document.createElement('div');
previewPopup.className = 'preview-popup';
previewPopup.style.cssText = `
    position: fixed;
    display: none;
    background: rgba(24, 27, 33, 0.98);
    border: 1px solid var(--border-color);
    border-radius: 10px;
    padding: 10px;
    z-index: 10000;
    box-shadow: 0 12px 40px rgba(0,0,0,0.6);
    max-width: 350px;
    pointer-events: none;
`;
document.body.appendChild(previewPopup);

// State
let currentApiKey = localStorage.getItem('activeApiKey') || ''; // No default key
let uiMode = localStorage.getItem('uiMode') || 'standard'; // 'standard' or 'studio'

// Migration: Convert saved keys to objects if they are strings
let rawSavedKeys = JSON.parse(localStorage.getItem('savedApiKeys') || '[]');
let savedApiKeys = rawSavedKeys.map(k => {
    if (typeof k === 'string') return { key: k, alias: '' };
    return k;
});
localStorage.setItem('savedApiKeys', JSON.stringify(savedApiKeys)); // Save back migrated structure
let currentImageCount = 8; // Default to 8
let currentGeneratedImages = []; // Stores currently displayed image objects {url, prompt}
let isGenerating = false; // Prevent double execution
let cachedHistory = []; // Cache for history filtering
let savedPrompts = JSON.parse(localStorage.getItem('savedPrompts') || '[]');
let autoTranslateEnabled = localStorage.getItem('autoTranslate') !== 'false'; // Default ON

// Load History on Init
loadHistory();
initSettings();
initUIInteractions();
initSmartPrompt();
initHistorySearch();
loadSavedPrompts();

// --- Auth & Cloud Sync Listeners ---
if (typeof authManager !== 'undefined') {
    authManager.onUserChange(async (user) => {
        if (user) {
            console.log("User logged in:", user.email);

            // 1. Sync History (Download & Upload Migration)
            const added = await nanoDB.syncWithCloud(user);
            if (added > 0) loadHistory();

            // Trigger background migration of local data to cloud
            nanoDB.migrateLocalToCloud(user).then(() => console.log("Background migration finished"));

            // 2. Sync Config (Keys, Prompts, Usage)
            const remoteConfig = await nanoDB.getUserConfig(user);
            if (remoteConfig) {
                // Cloud has config, overwrite local
                if (remoteConfig.apiKeys) {
                    savedApiKeys = remoteConfig.apiKeys;
                    localStorage.setItem('savedApiKeys', JSON.stringify(savedApiKeys));
                    updateKeyListUI();
                }
                if (remoteConfig.savedPrompts) {
                    savedPrompts = remoteConfig.savedPrompts;
                    localStorage.setItem('savedPrompts', JSON.stringify(savedPrompts));
                    loadSavedPrompts();
                }
                if (remoteConfig.usageData) {
                    localStorage.setItem('apiUsageData', JSON.stringify(remoteConfig.usageData));
                    updateUsageUI();
                }
            } else {
                // Cloud is empty, upload local config
                console.log("Cloud config empty, uploading local config...");
                syncConfigToCloud();
            }
        }
    });
}

function syncConfigToCloud() {
    const user = authManager.getCurrentUser();
    if (user) {
        nanoDB.saveUserConfig(user, {
            apiKeys: savedApiKeys,
            savedPrompts: savedPrompts,
            usageData: JSON.parse(localStorage.getItem('apiUsageData') || '{}')
        });
    }
}

// --- Sidebar & UI Interactions ---
function initUIInteractions() {
    // Sidebar Toggle
    sidebarToggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        const icon = sidebarToggleBtn.querySelector('span');
        if (sidebar.classList.contains('collapsed')) {
            icon.textContent = 'menu';
        } else {
            icon.textContent = 'menu_open';
        }
    });

    // Logo Home Reset
    if (logoHomeBtn) {
        logoHomeBtn.addEventListener('click', () => {
            if (isGenerating) return; // Prevent reset during generation

            if (uiMode === 'studio') {
                switchStudioTab('home');
            } else {
                window.location.reload();
            }
        });
    }

    // Translation Toggle
    if (translateToggleBtn) {
        // Sync UI with saved state
        if (!autoTranslateEnabled) {
            translateToggleBtn.classList.remove('active');
            translateToggleBtn.querySelector('.toggle-label').textContent = 'OFF';
        }

        translateToggleBtn.addEventListener('click', () => {
            autoTranslateEnabled = !autoTranslateEnabled;
            localStorage.setItem('autoTranslate', autoTranslateEnabled);

            if (autoTranslateEnabled) {
                translateToggleBtn.classList.add('active');
                translateToggleBtn.querySelector('.toggle-label').textContent = 'ON';
            } else {
                translateToggleBtn.classList.remove('active');
                translateToggleBtn.querySelector('.toggle-label').textContent = 'OFF';
            }
        });
    }
}

// --- Settings & API Key Manager Functions ---
function initSettings() {
    // Event Listeners
    settingsBtn.addEventListener('click', () => {
        updateKeyListUI();
        updateUsageUI(); // Update stats
        settingsModal.style.display = 'flex';
        settingsModal.style.opacity = '1';
    });

    closeSettingsBtn.addEventListener('click', () => {
        settingsModal.style.display = 'none';
        settingsModal.style.opacity = '0';
    });

    // Close on overlay click
    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) closeSettingsBtn.click();
    });

    addApiKeyBtn.addEventListener('click', () => {
        const key = newApiKeyInput.value.trim();
        const alias = newApiKeyAlias.value.trim();

        if (key.startsWith('AIza') && key.length > 30) {
            addApiKey(key, alias);
            newApiKeyInput.value = '';
            newApiKeyAlias.value = '';
        } else {
            alert('Invalid API Key format (must start with AIza...)');
        }
    });

    // UI Mode Switching
    uiModeStandard.addEventListener('click', () => setUIMode('standard'));
    uiModeStudio.addEventListener('click', () => setUIMode('studio'));

    // Data Management
    const exportBtn = document.getElementById('exportDataBtn');
    const importBtn = document.getElementById('importDataBtn');
    const importInput = document.getElementById('importFileInput');

    if (exportBtn) {
        exportBtn.addEventListener('click', async () => {
            try {
                const json = await nanoDB.exportData();
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `nanobanana_backup_${Date.now()}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            } catch (e) {
                alert('Export failed: ' + e.message);
            }
        });
    }

    if (importBtn && importInput) {
        importBtn.addEventListener('click', () => importInput.click());
        importInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = async (event) => {
                try {
                    const result = await nanoDB.importData(event.target.result);
                    if (result.success) {
                        alert(`Import successful! Loaded ${result.count} history items.`);
                        loadHistory(); // Reload UI
                        loadSavedPrompts();
                    } else {
                        alert('Import failed: ' + result.error);
                    }
                } catch (err) {
                    alert('Invalid file format');
                }
                importInput.value = ''; // Reset
            };
            reader.readAsText(file);
        });
    }

    // Ref Image UI Elements
    const refImageInput = document.getElementById('refImageInput');
    const uploadTriggerBtn = document.getElementById('uploadTriggerBtn');
    const refImagePreviewContainer = document.getElementById('refImagePreviewContainer');
    const refImagePreview = document.getElementById('refImagePreview');
    const removeRefImageBtn = document.getElementById('removeRefImageBtn');

    // Helper: Process File
    const processImageFile = (file) => {
        if (!file) return;

        const validTypes = ['image/jpeg', 'image/png', 'image/webp'];
        if (!validTypes.includes(file.type)) {
            alert('지원되지 않는 파일 형식입니다. (JPEG, PNG, WEBP만 가능)');
            return;
        }
        if (file.size > 4 * 1024 * 1024) {
            alert('파일 크기는 4MB를 초과할 수 없습니다.');
            return;
        }

        const reader = new FileReader();
        reader.onload = (re) => {
            const base64Data = re.target.result.split(',')[1];
            currentReferenceImage = {
                mimeType: file.type,
                data: base64Data
            };
            refImagePreview.src = re.target.result;
            refImagePreviewContainer.style.display = 'inline-block';
            refImageInput.value = ''; // Reset input
        };
        reader.readAsDataURL(file);
    };

    // Ref Image Listeners
    if (uploadTriggerBtn && refImageInput) {
        uploadTriggerBtn.addEventListener('click', () => refImageInput.click());

        refImageInput.addEventListener('change', (e) => {
            processImageFile(e.target.files[0]);
        });
    }

    if (removeRefImageBtn) {
        removeRefImageBtn.addEventListener('click', () => {
            currentReferenceImage = null;
            refImagePreview.src = '';
            refImagePreviewContainer.style.display = 'none';
            if (refImageInput) refImageInput.value = '';
        });
    }

    // Drag & Drop Logic
    const promptBox = document.getElementById('promptBox');
    if (promptBox) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            promptBox.addEventListener(eventName, preventDefaults, false);
        });

        function preventDefaults(e) {
            e.preventDefault();
            e.stopPropagation();
        }

        promptBox.addEventListener('dragenter', () => promptBox.classList.add('drag-over'));
        promptBox.addEventListener('dragover', () => promptBox.classList.add('drag-over'));

        promptBox.addEventListener('dragleave', (e) => {
            // Only remove if leaving the box entirely, not entering a child
            if (!promptBox.contains(e.relatedTarget)) {
                promptBox.classList.remove('drag-over');
            }
        });

        promptBox.addEventListener('drop', (e) => {
            promptBox.classList.remove('drag-over');
            const dt = e.dataTransfer;
            const files = dt.files;
            if (files.length > 0) {
                processImageFile(files[0]);
            }
        });
    }

    // Force Sync
    const forceSyncBtn = document.getElementById('forceSyncBtn');
    if (forceSyncBtn) {
        forceSyncBtn.addEventListener('click', async () => {
            const user = authManager.getCurrentUser();
            if (!user) {
                alert('로그인이 필요합니다.');
                return;
            }

            if (!confirm('로컬 데이터를 클라우드와 동기화하시겠습니까? (시간이 소요될 수 있습니다)')) return;

            const originalText = forceSyncBtn.innerHTML;
            forceSyncBtn.disabled = true;
            forceSyncBtn.innerHTML = '<div class="spinner" style="width:16px;height:16px;"></div> Syncing...';

            try {
                // 1. Download missing
                const added = await nanoDB.syncWithCloud(user);

                // 2. Upload local missing
                await nanoDB.migrateLocalToCloud(user, (processed, total) => {
                    forceSyncBtn.innerHTML = `<div class="spinner" style="width:16px;height:16px;"></div> ${processed}/${total}`;
                });

                syncConfigToCloud();

                alert(`동기화 완료!\n클라우드에서 받은 항목: ${added}개\n로컬 데이터 업로드 완료.`);
                loadHistory();
            } catch (e) {
                console.error(e);
                alert('동기화 중 오류 발생: ' + e.message);
            } finally {
                forceSyncBtn.disabled = false;
                forceSyncBtn.innerHTML = originalText;
            }
        });
    }
}

// --- UI Mode Logic ---
function setUIMode(mode) {
    uiMode = mode;
    localStorage.setItem('uiMode', mode);

    // Update Buttons in Settings
    if (mode === 'studio') {
        uiModeStandard.classList.remove('active');
        uiModeStudio.classList.add('active');

        // Show Studio Nav
        studioNav.style.display = 'block';
        // Hide "Recent History" label in studio mode? Maybe keep it inside playground
    } else {
        uiModeStandard.classList.add('active');
        uiModeStudio.classList.remove('active');

        // Hide Studio Nav
        studioNav.style.display = 'none';

        // Reset View to Standard
        studioHomeView.style.display = 'none';
        resultsContainer.style.display = 'flex';
        inputWrapper.style.display = 'block';
    }

    // Initial Tab for Studio
    if (mode === 'studio') {
        switchStudioTab('home');
    }
}

function switchStudioTab(tab) {
    if (uiMode !== 'studio') return;

    if (tab === 'home') {
        navHome.classList.add('active');
        navPlayground.classList.remove('active');

        navHome.style.color = 'var(--text-primary)';
        navPlayground.style.color = 'var(--text-secondary)';

        studioHomeView.style.display = 'block';
        resultsContainer.style.display = 'none';
        inputWrapper.style.display = 'none';

        // In Home, maybe hide history list or keep it?
        // historyList.style.display = 'none'; 
    } else {
        navHome.classList.remove('active');
        navPlayground.classList.add('active');

        navHome.style.color = 'var(--text-secondary)';
        navPlayground.style.color = 'var(--text-primary)';

        studioHomeView.style.display = 'none';
        resultsContainer.style.display = 'flex';
        inputWrapper.style.display = 'block';
    }
}

// Nav Listeners
navHome.addEventListener('click', () => switchStudioTab('home'));
navPlayground.addEventListener('click', () => switchStudioTab('playground'));

function addApiKey(key, alias) {
    if (savedApiKeys.some(item => item.key === key)) {
        alert('This API Key is already saved.');
        return;
    }

    savedApiKeys.push({ key, alias });
    localStorage.setItem('savedApiKeys', JSON.stringify(savedApiKeys));

    // Auto switch to new key
    switchApiKey(key);
    updateKeyListUI();
    syncConfigToCloud();
}


function removeApiKey(key) {
    savedApiKeys = savedApiKeys.filter(item => item.key !== key);
    localStorage.setItem('savedApiKeys', JSON.stringify(savedApiKeys));

    if (currentApiKey === key) {
        switchApiKey(''); // Clear active key
    } else {
        updateKeyListUI();
    }
    syncConfigToCloud();
}

function switchApiKey(key) {
    currentApiKey = key;
    localStorage.setItem('activeApiKey', key);
    updateKeyListUI();
    updateUsageUI(); // Update stats immediately

    // Visual feedback
    const badge = document.querySelector('.model-badge'); // Note: Badge might be gone in new UI replaced by Logo, but keeping logic safe
    if (badge) {
        badge.style.borderColor = '#a8c7fa';
        setTimeout(() => badge.style.borderColor = 'rgba(255, 255, 255, 0.1)', 500);
    }
}

function updateKeyListUI() {
    apiKeyList.innerHTML = '';

    // Helper to render item
    const renderItem = (keyItem, isDefault = false) => {
        const key = isDefault ? keyItem : keyItem.key;
        const alias = isDefault ? 'System Default' : (keyItem.alias || '');

        const item = document.createElement('div');
        const isActive = key === currentApiKey;
        item.className = `api-key-item ${isActive ? 'active' : ''}`;

        const masked = key.substring(0, 8) + '...' + key.substring(key.length - 4);
        const displayLabel = alias ? alias : masked;
        const subLabel = alias ? masked : (isDefault ? 'Built-in Key' : 'No Alias');

        let html = `
            <div class="api-key-info">
                <span class="api-key-label" style="font-weight:600; font-size: 0.95rem;">${displayLabel}</span>
                <span class="api-key-status" style="font-size: 0.75rem; opacity: 0.7;">${subLabel} • ${isActive ? 'Active' : 'Saved'}</span>
            </div>
        `;

        if (!isDefault) {
            html += `<button class="delete-key-btn"><span class="material-symbols-rounded">delete</span></button>`;
        }

        item.innerHTML = html;

        // Click to switch
        item.addEventListener('click', (e) => {
            if (e.target.closest('.delete-key-btn')) return;
            switchApiKey(key);
        });

        // Delete action
        if (!isDefault) {
            item.querySelector('.delete-key-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm('Delete this API Key?')) removeApiKey(key);
            });
        }

        apiKeyList.appendChild(item);
    };

    // 1. Render Saved Keys
    savedApiKeys.forEach(item => renderItem(item));

    if (savedApiKeys.length === 0) {
        apiKeyList.innerHTML = '<div style="color:var(--text-secondary);font-size:0.8rem;text-align:center;">No API Keys saved</div>';
    }
}

// --- API Usage Tracker Logic (PT Based & Per Key) ---
function getPTDateString() {
    return new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles' });
}

function getUsageData() {
    return JSON.parse(localStorage.getItem('apiUsageData') || '{}');
}

function saveUsageData(data) {
    localStorage.setItem('apiUsageData', JSON.stringify(data));
    syncConfigToCloud(); // Sync whenever usage changes (optional: debounce this if too frequent)
}

function trackApiUsage() {
    if (!currentApiKey) return;

    const now = Date.now();
    const data = getUsageData();

    // Init key if missing
    if (!data[currentApiKey]) {
        data[currentApiKey] = { timestamps: [], daily: { date: getPTDateString(), count: 0 } };
    }

    // 1. Update RPM Timestamps
    let timestamps = data[currentApiKey].timestamps || [];
    timestamps = timestamps.filter(t => now - t < 60000); // Keep last 60s
    timestamps.push(now);
    data[currentApiKey].timestamps = timestamps;

    // 2. Update Daily Count (PT Based)
    let daily = data[currentApiKey].daily || { date: getPTDateString(), count: 0 };
    const todayPT = getPTDateString();

    if (daily.date !== todayPT) {
        daily = { date: todayPT, count: 1 };
    } else {
        daily.count += 1;
    }
    data[currentApiKey].daily = daily;

    saveUsageData(data); // Save & Sync
    updateUsageUI();
}

function updateUsageUI() {
    const rpmDisplay = document.getElementById('rpmDisplay');
    const dailyCountDisplay = document.getElementById('dailyCountDisplay');
    const badge = document.getElementById('usageBadge'); // If we add one

    if (!rpmDisplay || !dailyCountDisplay) return;

    if (!currentApiKey) {
        rpmDisplay.textContent = '0';
        dailyCountDisplay.textContent = '0';
        return;
    }

    const data = getUsageData();
    const keyData = data[currentApiKey];

    if (!keyData) {
        rpmDisplay.textContent = '0';
        dailyCountDisplay.textContent = '0';
        return;
    }

    // RPM Calc
    const now = Date.now();
    const timestamps = keyData.timestamps || [];
    const activeRpm = timestamps.filter(t => now - t < 60000).length;

    // Daily Calc
    const daily = keyData.daily || { date: "", count: 0 };
    const todayPT = getPTDateString();
    const activeDaily = daily.date === todayPT ? daily.count : 0;

    rpmDisplay.textContent = activeRpm;
    dailyCountDisplay.textContent = activeDaily;
}



// Event Listeners
countBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        countBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentImageCount = parseInt(btn.dataset.count);
    });
});

imageGrid.addEventListener('click', (e) => {
    const card = e.target.closest('.result-card');
    if (card) {
        // Ignore clicks on action buttons (though they have stopPropagation, double safety)
        if (e.target.closest('.action-btn')) return;

        const img = card.querySelector('img');
        if (img && img.src) {
            openLightbox(img.src);
        }
    }
});



generateBtn.addEventListener('click', handleGeneration);
downloadAllBtn.addEventListener('click', downloadAllImages);

// Auto-resize textarea & Enter key handling
promptInput.addEventListener('input', function () {
    this.style.height = 'auto';
    this.style.height = (this.scrollHeight) + 'px';
});

promptInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault(); // Prevent newline
        handleGeneration(); // Trigger generation
    }
});

// History Logic (IndexedDB)
async function loadHistory() {
    try {
        const history = await nanoDB.getHistory(); // Use IndexedDB
        historyList.innerHTML = '';

        if (!history || history.length === 0) {
            historyList.innerHTML = '<div style="color:var(--text-secondary);font-size:0.8rem;text-align:center;padding:20px;">No history yet</div>';
            return;
        }

        // Create Preview Popup if not exists (Ensure references exist)
        // Use global previewPopup from line 83

        history.forEach(item => {
            const isSaved = savedPrompts.some(p => p.text === item.prompt);

            const el = document.createElement('div');
            el.className = 'history-item';
            el.innerHTML = `
                <div class="history-item-header">
                    <div class="history-text" title="클릭하여 복사">${item.prompt}</div>
                    <button class="favorite-btn ${isSaved ? 'active' : ''}" title="${isSaved ? '저장됨' : '저장하기'}">
                        <span class="material-symbols-rounded" style="font-size:16px;">${isSaved ? 'star' : 'star_outline'}</span>
                    </button>
                </div>
                <!-- Translated Prompt Indicator -->
                ${item.translatedPrompt ? `
                <div class="history-translation" title="${item.translatedPrompt}" style="font-size:0.75rem; color:var(--accent); margin-bottom:4px; display:flex; gap:4px; align-items:center;">
                    <span class="material-symbols-rounded" style="font-size:12px;">translate</span>
                    <span style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${item.translatedPrompt}</span>
                </div>
                ` : ''}
                <div class="history-meta">
                    <span>${new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <span>${item.images.length} images</span>
                </div>
            `;

            // Favorite button logic
            const favBtn = el.querySelector('.favorite-btn');
            favBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (savedPrompts.some(p => p.text === item.prompt)) {
                    return;
                }
                savePromptToLibrary(item.prompt);
                favBtn.classList.add('active');
                favBtn.querySelector('span').textContent = 'star';
                favBtn.title = '저장됨';
            });

            // Hover Preview Logic (Multi-image Grid)
            if (item.images && item.images.length > 0) {
                el.addEventListener('mouseenter', (e) => {
                    const imagesHtml = item.images.slice(0, 8).map(img =>
                        `<div style="aspect-ratio:1/1; overflow:hidden; border-radius:4px; background:#181b21;">
                            <img src="${img}" style="width:100%; height:100%; object-fit:cover; display:block;">
                         </div>`
                    ).join('');

                    // Include prompt text in hover
                    const promptHtml = `<div style="font-size:0.8rem; color:var(--text-primary); margin-bottom:8px; padding:8px; background:rgba(0,0,0,0.3); border-radius:6px; white-space:pre-wrap; word-break:break-word; max-width:300px; line-height:1.4;">${item.prompt}</div>`;

                    previewPopup.innerHTML = `${promptHtml}<div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(60px, 1fr)); gap:6px; min-width: 140px;">${imagesHtml}</div>`;
                    previewPopup.style.display = 'block';
                });

                el.addEventListener('mousemove', (e) => {
                    const x = e.clientX + 15;
                    const y = e.clientY + 15;

                    // Boundary check
                    const rect = previewPopup.getBoundingClientRect();
                    let finalY = y;
                    if (y + rect.height > window.innerHeight) {
                        finalY = e.clientY - rect.height - 10;
                    }

                    previewPopup.style.left = `${x}px`;
                    previewPopup.style.top = `${finalY}px`;
                });

                el.addEventListener('mouseleave', () => {
                    previewPopup.style.display = 'none';
                });
            }

            // Copy Prompt Logic
            const textEl = el.querySelector('.history-text');
            textEl.addEventListener('click', async (e) => {
                e.stopPropagation();
                try {
                    await navigator.clipboard.writeText(item.prompt);
                    // (Tooltip logic omitted for brevity, reusing existing if present or keep simple)
                } catch (err) { }
            });

            el.addEventListener('click', () => restoreHistoryItem(item));
            historyList.appendChild(el);
        });
    } catch (e) {
        console.error("Failed to load history from DB", e);
        historyList.innerHTML = '<div class="no-results">DB Error</div>';
    }
}

// --- History Search ---
function initHistorySearch() {
    if (!historySearchInput) return;

    let debounceTimer;
    historySearchInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            filterHistory(historySearchInput.value.trim());
        }, 200);
    });
}

function filterHistory(keyword) {
    const items = historyList.querySelectorAll('.history-item');
    let visibleCount = 0;

    items.forEach(item => {
        const text = item.querySelector('.history-text')?.textContent || '';
        if (!keyword || text.toLowerCase().includes(keyword.toLowerCase())) {
            item.style.display = '';
            visibleCount++;
        } else {
            item.style.display = 'none';
        }
    });

    // Show no results message
    let noResults = historyList.querySelector('.no-results');
    if (visibleCount === 0 && keyword) {
        if (!noResults) {
            noResults = document.createElement('div');
            noResults.className = 'no-results';
            noResults.textContent = '검색 결과 없음';
            historyList.appendChild(noResults);
        }
    } else if (noResults) {
        noResults.remove();
    }
}

// --- Saved Prompts (Feature 5) ---
function loadSavedPrompts() {
    if (!savedPromptsList) return;

    savedPromptsList.innerHTML = '';
    savedPromptsCount.textContent = savedPrompts.length;

    if (savedPrompts.length === 0) {
        savedPromptsList.innerHTML = '<div class="no-results">저장된 프롬프트 없음</div>';
        return;
    }

    savedPrompts.forEach((prompt, index) => {
        const el = document.createElement('div');
        el.className = 'saved-prompt-item';
        el.innerHTML = `
            <span class="saved-prompt-text" title="${prompt.text}">${prompt.label || prompt.text.substring(0, 50) + (prompt.text.length > 50 ? '...' : '')}</span>
            <div class="saved-prompt-actions">
                <button class="edit-btn" title="별명 수정"><span class="material-symbols-rounded" style="font-size:18px;">edit</span></button>
                <button class="use-btn" title="사용"><span class="material-symbols-rounded" style="font-size:18px;">add_circle</span></button>
                <button class="delete-btn" title="삭제"><span class="material-symbols-rounded" style="font-size:18px;">delete</span></button>
            </div>
        `;

        // Add hover tooltip for full prompt text
        el.addEventListener('mouseenter', (e) => {
            const tooltipHtml = `<div style="font-size:0.8rem; color:var(--text-primary); padding:10px; white-space:pre-wrap; word-break:break-word; max-width:300px; line-height:1.4;">${prompt.text}</div>`;
            previewPopup.innerHTML = tooltipHtml;
            previewPopup.style.display = 'block';
        });

        el.addEventListener('mousemove', (e) => {
            const x = e.clientX + 15;
            const y = e.clientY + 15;
            const rect = previewPopup.getBoundingClientRect();
            let finalY = y;
            if (y + rect.height > window.innerHeight) {
                finalY = e.clientY - rect.height - 10;
            }
            previewPopup.style.left = `${x}px`;
            previewPopup.style.top = `${finalY}px`;
        });

        el.addEventListener('mouseleave', () => {
            previewPopup.style.display = 'none';
        });

        // Use prompt
        el.querySelector('.use-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            promptInput.value = prompt.text;
            promptInput.style.height = 'auto';
            promptInput.style.height = promptInput.scrollHeight + 'px';
            promptInput.focus();
        });

        // Edit alias
        el.querySelector('.edit-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            const newAlias = window.prompt('별명을 입력하세요 (비워두면 원본 프롬프트 표시):', prompt.label || '');
            if (newAlias !== null) {
                savedPrompts[index].label = newAlias.trim();
                localStorage.setItem('savedPrompts', JSON.stringify(savedPrompts));
                loadSavedPrompts();
                syncConfigToCloud();
            }
        });

        // Delete prompt
        el.querySelector('.delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            deleteSavedPrompt(index);
        });

        // Click whole item to use
        el.addEventListener('click', () => {
            promptInput.value = prompt.text;
            promptInput.style.height = 'auto';
            promptInput.style.height = promptInput.scrollHeight + 'px';
            promptInput.focus();
        });

        savedPromptsList.appendChild(el);
    });
}

function savePromptToLibrary(text, label = '') {
    if (!text) return;

    // Check for duplicates
    if (savedPrompts.some(p => p.text === text)) {
        return; // Already saved
    }

    savedPrompts.unshift({ id: Date.now(), text, label });
    localStorage.setItem('savedPrompts', JSON.stringify(savedPrompts));
    loadSavedPrompts();
    syncConfigToCloud();
}

function deleteSavedPrompt(index) {
    savedPrompts.splice(index, 1);
    localStorage.setItem('savedPrompts', JSON.stringify(savedPrompts));
    loadSavedPrompts();
    syncConfigToCloud();
}

async function saveToHistory(prompt, images, translatedPrompt = null) {
    if (!prompt) return;

    const newItem = {
        id: Date.now(),
        prompt: prompt,
        translatedPrompt: translatedPrompt,
        images: images, // Base64 strings are fine for IndexedDB
        timestamp: new Date().toISOString()
    };
    try {
        await nanoDB.saveHistoryItem(newItem);
        loadHistory(); // Reload to show new item
    } catch (e) {
        console.error("Failed to save to DB", e);
        // alert("저장 실패");
    }
}

function restoreHistoryItem(item) {
    imageGrid.innerHTML = '';
    placeholderState.style.display = 'none';
    currentGeneratedImages = [];

    item.images.forEach(imgUrl => {
        // imgUrl is now a relative path from server (e.g. /data/images/...)
        const card = createResultCard(imgUrl, item.prompt);
        imageGrid.appendChild(card);
        currentGeneratedImages.push({ url: imgUrl, prompt: item.prompt });
    });

    updateDownloadButton();
}

// Download Logic
function downloadImage(url, filename, e) {
    if (e) e.stopPropagation(); // Stop bubbling to prevent lightbox
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function downloadAllImages() {
    alert("웹 버전에서는 'Settings > Data Management > Export' 기능을 사용하여 전체 데이터를 백업/다운로드하세요.");
    if (settingsBtn) settingsBtn.click();
}

function createResultCard(imageUrl, prompt) {
    const card = document.createElement('div');
    card.className = 'result-card';

    // Image
    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = prompt;

    // Actions Container
    const actions = document.createElement('div');
    actions.className = 'card-actions';

    // Variation Button
    const variationBtn = document.createElement('button');
    variationBtn.className = 'action-btn';
    variationBtn.innerHTML = '<span class="material-symbols-rounded" style="font-size:20px;">shuffle</span>';
    variationBtn.title = "변형 생성";
    variationBtn.onclick = (e) => {
        e.stopPropagation();
        generateVariation(prompt);
    };

    // Download Button
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'action-btn';
    downloadBtn.innerHTML = '<span class="material-symbols-rounded" style="font-size:20px;">download</span>';
    downloadBtn.title = "Download";
    downloadBtn.onclick = (e) => downloadImage(imageUrl, `nanobanana_${Date.now()}.png`, e);

    actions.appendChild(variationBtn);
    actions.appendChild(downloadBtn);

    card.appendChild(img);
    card.appendChild(actions);

    // Lightbox trigger handled by delegation on imageGrid
    // card.onclick = () => openLightbox(imageUrl);

    return card;
}

// --- Variation Generation (Feature 4) ---
async function generateVariation(originalPrompt) {
    // Add a new card with loading skeleton
    const card = document.createElement('div');
    card.className = 'result-card';
    card.style.aspectRatio = '1/1';
    card.innerHTML = '<div class="loading-skeleton"></div>';
    imageGrid.insertBefore(card, imageGrid.firstChild);

    // Modify prompt for variation
    const variationPrompt = `Create a slightly different artistic variation of: ${originalPrompt}`;

    try {
        const result = await generateSingleImageWithVariation(variationPrompt);

        if (result && result.success) {
            const newCard = createResultCard(result.url, originalPrompt);
            imageGrid.replaceChild(newCard, card);
            currentGeneratedImages.unshift({ url: result.url, prompt: originalPrompt });
        } else {
            const errorMsg = result ? result.error : 'Unknown Error';
            card.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-secondary);text-align:center;padding:10px;font-size:0.8rem;">${errorMsg}</div>`;
            card.style.cursor = 'default';
        }
    } catch (e) {
        console.error('Variation failed', e);
        card.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-secondary);">변형 실패</div>';
    }
}

async function generateSingleImageWithVariation(prompt) {
    trackApiUsage();
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${currentApiKey}`;

    // Construct Payload
    const parts = [{ text: prompt }];

    // Add Reference Image if exists
    if (currentReferenceImage && currentReferenceImage.data) {
        parts.push({
            inline_data: {
                mime_type: currentReferenceImage.mimeType,
                data: currentReferenceImage.data
            }
        });
    }

    const requestBody = {
        contents: [{
            parts: parts
        }],
        generationConfig: {
            temperature: 0.9,
        }
    };

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts) {
            const part = data.candidates[0].content.parts.find(p => p.inline_data || p.inlineData);
            if (part) {
                const inlineData = part.inline_data || part.inlineData;
                return { success: true, url: `data:${inlineData.mime_type};base64,${inlineData.data}` };
            }
        }

        let isBlocked = false;
        if (data.promptFeedback && data.promptFeedback.blockReason) isBlocked = true;
        if (data.candidates && data.candidates[0].finishReason && data.candidates[0].finishReason !== 'STOP') isBlocked = true;

        const msg = isBlocked ? 'Safety Filter' : (data.error ? data.error.message : 'API Error');
        return { success: false, error: msg };

    } catch (e) {
        console.error('Variation request failed', e);
        return { success: false, error: e.message };
    }
}

// --- Optimize Prompt Logic (Feature: Magic) ---
const optimizeBtn = document.getElementById('btn-optimize');
if (optimizeBtn) {
    optimizeBtn.addEventListener('click', async () => {
        const prompt = promptInput.value.trim();
        if (!prompt) return;

        const originalContent = optimizeBtn.innerHTML;
        optimizeBtn.innerHTML = '<div class="spinner" style="width:14px;height:14px;"></div>';

        try {
            const optimized = await optimizePromptForPro(prompt);

            promptInput.style.transition = 'color 0.2s';
            promptInput.style.color = 'transparent';

            setTimeout(() => {
                promptInput.value = optimized;
                promptInput.style.height = 'auto';
                promptInput.style.height = promptInput.scrollHeight + 'px';
                promptInput.style.color = 'var(--text-primary)';

                promptInput.classList.add('flash-success');
                setTimeout(() => promptInput.classList.remove('flash-success'), 500);
            }, 200);

        } catch (e) {
            console.error("Optimization failed", e);
            alert("최적화 실패");
        } finally {
            optimizeBtn.innerHTML = originalContent;
        }
    });
}

// --- Smart Prompt Logic (Analysis) ---
const analyzeBtn = document.getElementById('btn-analyze');
if (analyzeBtn) {
    analyzeBtn.addEventListener('click', async () => {
        const prompt = promptInput.value.trim();
        if (!prompt) return;

        smartTagContainer.style.display = 'flex';
        smartTagContainer.innerHTML = `
            <div class="smart-tag-loading">
                <div class="spinner"></div>
                <span>Analyzing prompt...</span>
            </div>
        `;

        try {
            const result = await analyzePromptEntities(prompt);
            renderSmartTags(result);
        } catch (e) {
            console.error("Analysis failed", e);
            smartTagContainer.innerHTML = `<span style="color:#ff6b6b; font-size:0.8rem;">Analysis failed</span>`;
            setTimeout(() => {
                smartTagContainer.style.display = 'none';
            }, 3000);
        }
    });
}

// Legacy placeholder
function initSmartPrompt() { }

async function optimizePromptForPro(prompt) {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL_NAME}:generateContent?key=${currentApiKey}`;

    const systemInstruction = `
    You are an expert prompt engineer specializing in "Nano Banana Pro" (Gemini 3 Pro Image model).
    Rewrite the user's prompt to be optimized for this model.
    
    Principles for Nano Banana Pro:
    1. **Natural Language**: Use full, descriptive sentences. Avoid "tag soup".
    2. **Descriptive**: Explicitly describe Subject, Action, Location, Lighting, Camera Angle, and Style.
    3. **Quality Boosters**: Include terms like "4k resolution", "highly detailed", "cinematic lighting" naturally in the sentence.
    4. **No Hallucinations**: Do not add elements not requested, but enhance the description of existing elements.
    
    User Prompt: "${prompt}"
    
    STRICT OUTPUT RULES:
    1. Output ONLY the optimized prompt text.
    2. Do NOT include any introductory text like "Here is the prompt" or "Optimized prompt:".
    3. Do NOT wrap the output in quotation marks ("").
    4. The output must be in **Korean**.
    5. Just valid plain text.
    `;

    const requestBody = {
        contents: [{
            parts: [{ text: systemInstruction }]
        }],
        generationConfig: {
            temperature: 0.7, // Creativity allowed
        }
    };

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });

    const data = await response.json();

    if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts) {
        return data.candidates[0].content.parts[0].text.trim();
    }

    throw new Error('No content in response');
}

async function analyzePromptEntities(prompt) {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL_NAME}:generateContent?key=${currentApiKey}`;

    const systemInstruction = `
    You are a prompt analysis assistant. 
    Analyze the given image generation prompt and extract:
    1. "Title": The name of the movie, anime, game, or series (e.g., "Chainsaw Man", "Cyberpunk 2077").
    2. "Characters": List of character names (e.g., "Makima", "Denji").
    
    Return ONLY a valid JSON object. Do not include markdown code block syntax.
    Format:
    {
      "title": ["Title1"],
      "characters": ["Char1", "Char2"]
    }
    If none found, return empty arrays.
    `;

    const requestBody = {
        contents: [{
            parts: [{ text: systemInstruction + "\n\nPrompt:\n" + prompt }]
        }],
        generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json"
        }
    };

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });

    const data = await response.json();

    if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts) {
        const text = data.candidates[0].content.parts[0].text;
        try {
            return JSON.parse(text);
        } catch (e) {
            console.error("JSON Parse Error", text);
            return { title: [], characters: [] };
        }
    }
    throw new Error('No content in response');
}

// --- Auto Translation (Feature 2) ---
function containsKorean(text) {
    const koreanRegex = /[\uAC00-\uD7A3]/;
    return koreanRegex.test(text);
}

async function translateToEnglish(koreanText) {
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${TEXT_MODEL_NAME}:generateContent?key=${currentApiKey}`;

    const systemInstruction = `You are a translation assistant. Translate the following Korean image generation prompt to English. 
Keep artistic terms and proper nouns (character names, series titles) as-is or romanized.
Return ONLY the translated English text, nothing else.`;

    const requestBody = {
        contents: [{
            parts: [{ text: systemInstruction + "\n\nKorean prompt:\n" + koreanText }]
        }],
        generationConfig: {
            temperature: 0.1
        }
    };

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody)
    });

    const data = await response.json();

    if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts) {
        return data.candidates[0].content.parts[0].text.trim();
    }

    throw new Error('Translation failed');
}

function showTranslationToast(translatedText) {
    // Remove existing toast if any
    const existing = document.querySelector('.translation-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'translation-toast';
    toast.innerHTML = `
        <span class="material-symbols-rounded" style="font-size:18px; color: #a8c7fa;">translate</span>
        <span style="color:#a8c7fa; font-weight:600; margin-right:4px;">EN:</span>
        <span style="flex:1; color:#e3e3e3;">${translatedText}</span>
    `;

    // Apply inline styles for guaranteed rendering
    Object.assign(toast.style, {
        position: 'fixed',
        bottom: '180px',
        left: '50%',
        transform: 'translateX(-50%) scale(0.9)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '14px 22px',
        background: 'rgba(24, 27, 33, 0.98)',
        border: '1px solid rgba(168, 199, 250, 0.4)',
        borderRadius: '16px',
        boxShadow: '0 12px 48px rgba(0, 0, 0, 0.6)',
        fontSize: '0.9rem',
        zIndex: '10001',
        maxWidth: '700px',
        opacity: '0',
        transition: 'all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'
    });

    document.body.appendChild(toast);

    // Animate in
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) scale(1)';
    });

    // Auto-remove logic with hover persistence
    let removeTimer;

    const scheduleRemoval = () => {
        removeTimer = setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(-50%) scale(0.9)';
            setTimeout(() => { if (toast.parentNode) toast.remove(); }, 400);
        }, 6000);
    };

    scheduleRemoval();

    // Hover listeners to prevent disappearance
    toast.addEventListener('mouseenter', () => {
        clearTimeout(removeTimer);
    });

    toast.addEventListener('mouseleave', () => {
        scheduleRemoval();
    });
}

function renderSmartTags(entities) {
    smartTagContainer.innerHTML = '';

    if ((!entities.title || entities.title.length === 0) && (!entities.characters || entities.characters.length === 0)) {
        smartTagContainer.innerHTML = `<span style="color:var(--text-secondary); font-size:0.8rem;">탐지된 키워드가 없습니다.</span>`;
        setTimeout(() => smartTagContainer.style.display = 'none', 2000);
        return;
    }

    const createTag = (text, type) => {
        const tag = document.createElement('div');
        tag.className = `smart-tag ${type}`;
        tag.innerHTML = `<span>${text}</span>`;
        tag.title = 'Click to edit all occurrences';

        tag.addEventListener('click', () => {
            enterEditMode(tag, text, type);
        });

        return tag;
    };

    // Render Titles
    if (entities.title) {
        entities.title.forEach(t => smartTagContainer.appendChild(createTag(t, 'title')));
    }

    // Render Characters
    if (entities.characters) {
        entities.characters.forEach(c => smartTagContainer.appendChild(createTag(c, 'character')));
    }
}

function enterEditMode(tagEl, originalText, type) {
    if (tagEl.classList.contains('editing')) return;

    // 1. Lock current width to prevent jump
    const startWidth = tagEl.getBoundingClientRect().width;
    tagEl.style.width = `${startWidth}px`;

    // 2. Prepare Input
    const input = document.createElement('input');
    input.type = 'text';
    input.value = originalText;
    input.className = 'smart-tag-input';

    // 3. Swap Content
    tagEl.classList.add('editing');
    tagEl.innerHTML = '';
    tagEl.appendChild(input);

    // 4. Calculate Target Width (approximate)
    // Create a temporary span to measure text width
    const measureSpan = document.createElement('span');
    measureSpan.style.font = getComputedStyle(input).font;
    measureSpan.style.visibility = 'hidden';
    measureSpan.style.position = 'absolute';
    measureSpan.textContent = originalText;
    document.body.appendChild(measureSpan);

    const textWidth = measureSpan.getBoundingClientRect().width;
    document.body.removeChild(measureSpan);

    const padding = 30; // 12px padding * 2 + extra buffer
    const targetWidth = Math.max(startWidth, textWidth + padding);

    // 5. Animate to target width
    // Force reflow
    tagEl.offsetHeight;
    tagEl.style.width = `${targetWidth}px`;

    input.focus();
    input.select();

    // Dynamic resizing while typing
    input.addEventListener('input', () => {
        measureSpan.textContent = input.value || ' '; // Ensure some width
        document.body.appendChild(measureSpan);
        const currentTextWidth = measureSpan.getBoundingClientRect().width;
        document.body.removeChild(measureSpan);

        const newTargetWidth = Math.max(60, currentTextWidth + padding);
        tagEl.style.width = `${newTargetWidth}px`;
    });

    const finishEdit = () => {
        const newText = input.value.trim();

        // Disable editing state visually first
        tagEl.classList.remove('editing');

        if (newText && newText !== originalText) {
            updatePromptEntity(originalText, newText);
            // Update Text
            tagEl.innerHTML = `<span>${newText}</span>`;

            // Re-setup listener (clone to remove old listeners)
            const newTag = tagEl.cloneNode(true);
            newTag.style.width = ''; // Reset to auto width
            newTag.addEventListener('click', () => enterEditMode(newTag, newText, type));
            tagEl.parentNode.replaceChild(newTag, tagEl);
        } else {
            // Cancel / No Change
            tagEl.innerHTML = `<span>${originalText}</span>`;
            tagEl.style.width = ''; // Reset to auto
        }
    };

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            finishEdit();
        } else if (e.key === 'Escape') {
            tagEl.classList.remove('editing');
            tagEl.innerHTML = `<span>${originalText}</span>`;
            tagEl.style.width = '';
        }
    });

    input.addEventListener('blur', finishEdit);
}

// --- Josa Correction Utilities ---
function isHangul(char) {
    if (!char) return false;
    const c = char.charCodeAt(0);
    return 0xAC00 <= c && c <= 0xD7A3;
}

function hasBatchim(char) {
    if (!isHangul(char)) return false;
    return (char.charCodeAt(0) - 0xAC00) % 28 > 0;
}

function updatePromptEntity(oldText, newText) {
    let currentString = promptInput.value;

    // Analyze New Text's End for Josa correction
    const lastCharNew = newText.charAt(newText.length - 1);
    const newHasBatchim = hasBatchim(lastCharNew);
    const isRiel = isHangul(lastCharNew) && ((lastCharNew.charCodeAt(0) - 0xAC00) % 28 === 8);

    // Particle Pairs: [ConsonantEnd, VowelEnd]
    const particlePairs = [
        ['은', '는'],
        ['이', '가'],
        ['을', '를'],
        ['과', '와'],
        ['이랑', '랑'],
        ['으로', '로']
    ];
    const allParticles = particlePairs.flat().sort((a, b) => b.length - a.length);
    const particleGroup = `(${allParticles.join('|')})`;

    // --- Smart Name Variant Detection ---
    // If oldText is a multi-word name like "쿠제 마사치카", also find "쿠제" (first word)
    // And if someone is editing "쿠제", should also update "쿠제 마사치카"

    const oldParts = oldText.trim().split(/\s+/);
    const newParts = newText.trim().split(/\s+/);

    // Build list of related name variants to search for
    let namesToReplace = [oldText];

    // If old name is multi-word, add first word as variant
    if (oldParts.length > 1) {
        namesToReplace.push(oldParts[0]); // First name (e.g., "쿠제")
        namesToReplace.push(oldParts[oldParts.length - 1]); // Last name (e.g., "마사치카")
    }

    // Also search for any existing multi-word names starting with oldText
    // Regex to find "oldText + space + more words"
    const fullNamePattern = new RegExp(`${oldText.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}\\s+\\S+`, 'g');
    const fullNameMatches = currentString.match(fullNamePattern);
    if (fullNameMatches) {
        namesToReplace.push(...fullNameMatches.map(m => m.trim()));
    }

    // Deduplicate and sort by length (longest first to avoid partial matches)
    namesToReplace = [...new Set(namesToReplace)].sort((a, b) => b.length - a.length);

    // Helper function to get replacement text with correct form
    const getReplacement = (originalVariant, capturedParticle) => {
        // Determine what form of newText to use
        let replacementBase = newText;

        // If original was just "쿠제" and newText is "다른캐릭터", use newText directly
        // If original was "쿠제 마사치카", use full newText
        // If user edited short form to new short form, apply to all

        if (!capturedParticle) return replacementBase;

        // Apply Josa correction
        const pair = particlePairs.find(p => p.includes(capturedParticle));
        if (!pair) return replacementBase + capturedParticle;

        // Special case: (으)로
        if (pair.includes('으로') || pair.includes('로')) {
            return replacementBase + ((newHasBatchim && !isRiel) ? '으로' : '로');
        }

        // Standard case
        return replacementBase + (newHasBatchim ? pair[0] : pair[1]);
    };

    // Perform replacements for all variants
    let updatedPrompt = currentString;

    for (const variant of namesToReplace) {
        const escapedVariant = variant.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
        const regex = new RegExp(`${escapedVariant}(${particleGroup})?`, 'g');

        updatedPrompt = updatedPrompt.replace(regex, (match, p1) => {
            return getReplacement(variant, p1);
        });
    }

    promptInput.value = updatedPrompt;

    // Visual Feedback (Flash)
    promptInput.style.transition = 'background 0.2s';
    promptInput.style.background = 'rgba(168, 199, 250, 0.1)';
    setTimeout(() => promptInput.style.background = '', 300);
}

// Prompt and Settings Processor
function processPromptAndSettings(promptText, quality) {
    // 1. Detect Ratio for UI Preview (CSS)
    const ratioRegex = /ratio=(\d+):(\d+)/i;
    const match = promptText.match(ratioRegex);

    let cssAspectRatio = '1/1'; // Default square

    if (match) {
        cssAspectRatio = `${match[1]}/${match[2]}`;
    }

    // 2. Enhance Prompt based on Quality
    let qualityCurrent = '';
    switch (quality) {
        case '2k':
            qualityCurrent = ', high resolution, 2k, highly detailed';
            break;
        case '4k':
            qualityCurrent = ', ultra high resolution, 4k, masterpiece, sharp details';
            break;
        default: // 1k or standard
            qualityCurrent = '';
    }

    const finalPrompt = promptText + qualityCurrent;

    return {
        finalPrompt: finalPrompt,
        cssAspectRatio: cssAspectRatio
    };
}

function updateDownloadButton() {
    if (currentGeneratedImages.length > 0) {
        downloadGroup.style.display = 'flex';
    } else {
        downloadGroup.style.display = 'none';
    }
}

async function handleGeneration() {
    // Validation: Check for API Key
    if (!currentApiKey) {
        alert("이미지 생성을 위해 API Key 설정이 필요합니다.\n설정(Settings) 메뉴에서 키를 등록해주세요.");
        settingsBtn.click(); // Open settings for convenience
        return;
    }

    if (isGenerating) return; // Prevent double click or Enter+Click

    const rawPrompt = promptInput.value.trim();
    if (!rawPrompt) return;

    // Safety check for image count
    let count = parseInt(currentImageCount);
    if (isNaN(count) || count < 1) count = 1;
    if (count > 8) count = 8;
    currentImageCount = count; // Ensure state is clean

    isGenerating = true;

    // Clear input immediately as requested
    promptInput.value = '';
    promptInput.style.height = 'auto'; // Reset height

    // UI Updates
    placeholderState.style.display = 'none';
    generateBtn.disabled = true;
    downloadGroup.style.display = 'none';

    // Clear previous results
    imageGrid.innerHTML = '';
    currentGeneratedImages = [];

    // --- Auto Translation (Feature 2) ---
    let promptForGeneration = rawPrompt;
    let wasTranslated = false;

    if (autoTranslateEnabled && containsKorean(rawPrompt)) {
        generateBtn.textContent = '번역 중...';
        try {
            promptForGeneration = await translateToEnglish(rawPrompt);
            wasTranslated = true;
            console.log('Translated:', promptForGeneration);

            // Show translation badge/toast
            showTranslationToast(promptForGeneration);
        } catch (e) {
            console.warn('Translation failed, using original:', e);
            // Fall back to original if translation fails
        }
    }
    generateBtn.textContent = '생성 중...';

    // Prepare settings
    const quality = resolutionSelect.value;
    const { finalPrompt, cssAspectRatio } = processPromptAndSettings(promptForGeneration, quality);

    for (let i = 0; i < currentImageCount; i++) {
        const card = document.createElement('div');
        card.className = 'result-card';
        card.style.aspectRatio = cssAspectRatio;
        card.innerHTML = '<div class="loading-skeleton"></div>';
        imageGrid.appendChild(card);
    }

    // Parallel Requests
    const slots = document.querySelectorAll('.result-card');

    // Create promises that process their own execution AND UI update immediately
    const promises = Array(currentImageCount).fill(null).map((_, index) => {
        return generateSingleImage(finalPrompt).then(result => {
            // Immediately update this specific slot
            if (result && result.success) {
                const newCard = createResultCard(result.url, rawPrompt);

                // Check if slot is still part of the DOM (e.g. user hasn't cleared)
                if (slots[index].parentNode === imageGrid) {
                    imageGrid.replaceChild(newCard, slots[index]);
                }
                return result;
            } else {
                const errorMsg = result ? result.error : 'Unknown Error';
                slots[index].innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-secondary);text-align:center;padding:10px;font-size:0.8rem;">${errorMsg}</div>`;
                slots[index].onclick = null;
                slots[index].style.cursor = 'default';
                return result;
            }
        });
    });

    try {
        // Wait for all to finish for history saving and button state
        const results = await Promise.all(promises);

        const successfulImages = results
            .filter(r => r && r.success)
            .map(r => r.url);

        if (successfulImages.length > 0) {
            saveToHistory(rawPrompt, successfulImages, wasTranslated ? promptForGeneration : null);
            successfulImages.forEach(url => currentGeneratedImages.push({ url, prompt: rawPrompt }));
            updateDownloadButton();
        }

    } catch (error) {
        console.error('Batch generation failed', error);
        alert('이미지 생성 중 오류가 발생했습니다.');
    } finally {
        generateBtn.disabled = false;
        generateBtn.innerHTML = '<span class="material-symbols-rounded">auto_awesome</span>생성';
        isGenerating = false;
    }
}

async function generateSingleImage(prompt) {
    trackApiUsage(); // Track Request
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${currentApiKey}`;

    // Construct Payload
    const parts = [{ text: prompt }];

    // Add Reference Image if exists
    if (currentReferenceImage && currentReferenceImage.data) {
        parts.push({
            inline_data: {
                mime_type: currentReferenceImage.mimeType,
                data: currentReferenceImage.data
            }
        });
    }

    const requestBody = {
        contents: [{
            parts: parts
        }],
        generationConfig: {
            temperature: 0.9,
        }
    };

    try {
        const response = await fetch(apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();

        console.log('API Response:', data);

        if (data.candidates && data.candidates[0].content && data.candidates[0].content.parts) {
            const part = data.candidates[0].content.parts.find(p => p.inline_data || p.inlineData);
            if (part) {
                const inlineData = part.inline_data || part.inlineData;
                return { success: true, url: `data:${inlineData.mime_type};base64,${inlineData.data}` };
            }
        }

        // Handle blocked response or other API failures
        let isBlocked = false;
        if (data.promptFeedback && data.promptFeedback.blockReason) isBlocked = true;
        if (data.candidates && data.candidates[0].finishReason && data.candidates[0].finishReason !== 'STOP') isBlocked = true;

        if (isBlocked || data.error) {
            console.warn(`Generation failed. Blocked: ${isBlocked}, Error:`, data.error);
            const msg = isBlocked ? 'Safety Filter Triggered' : (data.error ? data.error.message : 'API Error');
            return { success: false, error: msg };
        }

        return { success: false, error: 'No image data returned' };

    } catch (e) {
        console.error('Request failed', e);
        return { success: false, error: e.message };
    }
}
