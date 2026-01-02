// CONFIGURATION
const API_BASE = '/api'; // Đường dẫn đến Cloudflare Worker
const STORAGE_KEY = 'trinhhg_settings_v3';
const AUTH_KEY = 'trinhhg_auth_key';

// DOM ELEMENTS
const els = {
    landing: document.getElementById('landing-page'),
    app: document.getElementById('main-app'),
    loginForm: document.getElementById('login-form'),
    keyInput: document.getElementById('secret-key-input'),
    scrollBuyBtn: document.getElementById('btn-scroll-buy'),
    landingBuyContainer: document.getElementById('landing-buy-widget'),
    internalBuyContainer: document.getElementById('internal-buy-widget'),
    pricingTarget: document.getElementById('pricing-target'),
    logoutBtn: document.getElementById('logout-btn'),
    
    // Tabs & Nav
    navItems: document.querySelectorAll('.nav-item'),
    tabPanes: document.querySelectorAll('.tab-pane'),
    
    // Sidebar
    sidebarBtns: document.querySelectorAll('.sb-btn'),
    settingPanels: document.querySelectorAll('.setting-panel'),
    
    // Key Info
    displayKey: document.getElementById('display-key'),
    toggleKey: document.getElementById('toggle-key-visibility'),
    keyStatus: document.getElementById('key-status-badge'),
    expiryDate: document.getElementById('expiry-date-display'),
    deviceCount: document.getElementById('device-count'),
    
    // Timer
    daysLeft: document.getElementById('days-left'),
    hoursLeft: document.getElementById('hours-left'),
    timeProgress: document.getElementById('time-progress'),
    
    // Tool Elements (Replace, Split...)
    inputText: document.getElementById('input-text'),
    outputText: document.getElementById('output-text'),
    replaceBtn: document.getElementById('replace-button'),
    copyBtn: document.getElementById('copy-button'),
    modeSelect: document.getElementById('mode-select'),
    puncList: document.getElementById('punctuation-list'),
    
    // Split
    splitInput: document.getElementById('split-input-text'),
    splitAction: document.getElementById('split-action-btn'),
    splitWrapper: document.getElementById('split-outputs-wrapper'),
    splitRadios: document.getElementsByName('split-type')
};

// STATE
let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {
    modes: { default: { pairs: [] } },
    currentMode: 'default',
    formatMode: 0,
    opts: { matchCase: false, wholeWord: false, autoCaps: false }
};

// --- INIT ---
document.addEventListener('DOMContentLoaded', () => {
    checkAuth();
    initEventListeners();
    renderBuyWidget(els.landingBuyContainer);
    renderBuyWidget(els.internalBuyContainer); // Render same widget inside app
    loadSettings();
});

// --- AUTH FLOW ---
async function checkAuth() {
    const key = localStorage.getItem(AUTH_KEY);
    if (!key) return showLanding();
    
    // Verify with server (Mock for now, replace with actual fetch)
    // const res = await fetch(`${API_BASE}/heartbeat`, { headers: { 'x-auth': key } });
    // if (res.ok) showApp(key); else logout();
    
    // Simulating succesful login for UI demo
    showApp(key);
}

function showLanding() {
    els.landing.classList.remove('hidden');
    els.app.classList.add('hidden');
}

function showApp(key) {
    els.landing.classList.add('hidden');
    els.app.classList.remove('hidden');
    updateKeyInfo(key);
}

function logout() {
    localStorage.removeItem(AUTH_KEY);
    location.reload();
}

async function handleLogin(e) {
    e.preventDefault();
    const key = els.keyInput.value.trim();
    if (!key) return alert('Vui lòng nhập Key!');
    
    // Call API Login here
    // const res = await fetch(`${API_BASE}/login`, { method: 'POST', body: JSON.stringify({ key }) });
    
    // Mock Success
    localStorage.setItem(AUTH_KEY, key);
    showApp(key);
}

// --- BUY WIDGET LOGIC ---
function renderBuyWidget(container) {
    if(!container) return;
    
    const html = `
        <div class="buy-widget">
            <div class="buy-row">
                <label>Loại tài khoản:</label>
                <div class="btn-group">
                    <button class="btn-opt active" data-type="personal" onclick="selectType(this, 'personal')">Cá nhân (2.2k/ngày)</button>
                    <button class="btn-opt" data-type="team" onclick="selectType(this, 'team')">Đội nhóm (4.3k/ngày)</button>
                </div>
            </div>
            <div class="buy-row">
                <label>Thời hạn:</label>
                <div class="btn-group">
                    <button class="btn-opt active" onclick="selectDays(this, 7)">7 Ngày</button>
                    <button class="btn-opt" onclick="selectDays(this, 30)">1 Tháng</button>
                    <button class="btn-opt" onclick="selectDays(this, 90)">3 Tháng</button>
                </div>
            </div>
            <div class="price-box">
                <span class="price-val" id="price-display-${container.id}">15.400 VND</span>
            </div>
            <button class="btn-pay" onclick="processPayment('${container.id}')">THANH TOÁN & NHẬN KEY</button>
            <div id="qr-area-${container.id}" class="qr-container hidden"></div>
        </div>
    `;
    container.innerHTML = html;
}

// Global scope for onclick handlers in HTML string
window.currentBuyState = { type: 'personal', days: 7, pricePerDay: 2200 };

window.selectType = function(btn, type) {
    const parent = btn.parentElement;
    parent.querySelectorAll('.btn-opt').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    window.currentBuyState.type = type;
    window.currentBuyState.pricePerDay = type === 'personal' ? 2200 : 4300;
    updatePriceDisplay();
};

window.selectDays = function(btn, days) {
    const parent = btn.parentElement;
    parent.querySelectorAll('.btn-opt').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    window.currentBuyState.days = days;
    updatePriceDisplay();
};

function updatePriceDisplay() {
    const total = window.currentBuyState.days * window.currentBuyState.pricePerDay;
    document.querySelectorAll('.price-val').forEach(el => {
        el.textContent = total.toLocaleString('vi-VN') + " VND";
    });
}

window.processPayment = function(containerId) {
    const total = window.currentBuyState.days * window.currentBuyState.pricePerDay;
    const transCode = "HG" + Math.floor(100000 + Math.random() * 900000); // Mock code
    const qrArea = document.getElementById(`qr-area-${containerId}`);
    
    // VietQR URL
    const qrUrl = `https://img.vietqr.io/image/MB-0917678211-compact.png?amount=${total}&addInfo=${transCode}`;
    
    qrArea.innerHTML = `
        <img src="${qrUrl}" class="qr-img" alt="QR Code">
        <div class="bank-details">
            <div class="detail-row"><span>Ngân hàng:</span> <b>MB BANK</b></div>
            <div class="detail-row"><span>Số TK:</span> <b>0917678211</b></div>
            <div class="detail-row"><span>Chủ TK:</span> <b>TRINH THI XUAN HUONG</b></div>
            <div class="detail-row"><span>Nội dung:</span> <span><b style="color:red; font-size:16px">${transCode}</b> <i class="fas fa-copy copy-btn" onclick="navigator.clipboard.writeText('${transCode}')"></i></span></div>
        </div>
        <p style="font-size:12px; color:#64748b; margin-top:10px"><i class="fas fa-spinner fa-spin"></i> Đang chờ thanh toán...</p>
    `;
    qrArea.classList.remove('hidden');
    
    // Start Polling (Mock)
    // setInterval(() => checkPayment(transCode), 3000);
};

// --- SETTINGS & NAVIGATION ---
function initEventListeners() {
    // Scroll to buy
    els.scrollBuyBtn.onclick = () => els.pricingTarget.scrollIntoView();
    
    // Login
    els.loginForm.onsubmit = handleLogin;
    
    // Logout
    els.logoutBtn.onclick = logout;
    
    // Tabs
    els.navItems.forEach(btn => btn.onclick = () => {
        els.navItems.forEach(b => b.classList.remove('active'));
        els.tabPanes.forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
    });
    
    // Sidebar
    els.sidebarBtns.forEach(btn => btn.onclick = () => {
        els.sidebarBtns.forEach(b => b.classList.remove('active'));
        els.settingPanels.forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.target).classList.add('active');
    });
    
    // Key Info
    els.toggleKey.onclick = () => {
        const isHidden = els.displayKey.textContent.includes('*');
        const key = localStorage.getItem(AUTH_KEY);
        els.displayKey.textContent = isHidden ? key : '****************';
        els.toggleKey.innerHTML = isHidden ? '<i class="fas fa-eye-slash"></i>' : '<i class="fas fa-eye"></i>';
    };
    
    // Format Cards
    document.querySelectorAll('.format-card').forEach(card => {
        card.onclick = () => {
            document.querySelectorAll('.format-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            state.formatMode = parseInt(card.dataset.format);
            saveSettings();
        };
    });
    
    // Text Tool Buttons
    els.replaceBtn.onclick = runReplace;
    els.copyBtn.onclick = () => {
        navigator.clipboard.writeText(els.outputText.innerText);
        alert('Đã sao chép!');
    };
    
    // Split Tool
    els.splitAction.onclick = runSplit;
}

// --- DATA & TOOLS LOGIC ---
function loadSettings() {
    // Load modes, populate list (Mock logic)
    // Update Format Card UI
    const activeCard = document.querySelector(`.format-card[data-format="${state.formatMode}"]`);
    if(activeCard) activeCard.classList.add('active');
}

function saveSettings() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function updateKeyInfo(key) {
    // Simulate API data
    els.keyStatus.textContent = "Official";
    els.keyStatus.style.background = "#dcfce7";
    els.keyStatus.style.color = "#166534";
    
    // Mock Expiry 30 days from now
    const now = new Date();
    const expiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    els.expiryDate.textContent = expiry.toLocaleDateString('vi-VN');
    
    // Timer Logic
    const diff = expiry - now;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    
    els.daysLeft.textContent = days.toString().padStart(2, '0');
    els.hoursLeft.textContent = hours.toString().padStart(2, '0');
    
    // Progress bar (Assume 30 days total)
    const totalDuration = 30 * 24 * 60 * 60 * 1000;
    const percent = (diff / totalDuration) * 100;
    els.timeProgress.style.width = `${percent}%`;
}

// --- TOOL FUNCTIONS ---
function runReplace() {
    let text = els.inputText.value;
    if(!text) return;
    
    // Mock Replace Logic
    // Apply replacements from state.modes[state.currentMode].pairs
    // Apply formatMode
    if(state.formatMode === 1) text = text.replace(/:\s*"/g, ': "'); // Example
    
    els.outputText.innerText = text; // Should render HTML for highlights
    document.getElementById('output-word-count').innerText = text.split(/\s+/).length + " words";
}

function runSplit() {
    const text = document.getElementById('split-input-text').value;
    if(!text) return;
    
    els.splitWrapper.innerHTML = '';
    const parts = text.split(/Chương \d+/); // Simple mock regex
    
    parts.forEach((p, i) => {
        if(!p.trim()) return;
        const div = document.createElement('div');
        div.className = 'split-item';
        div.innerHTML = `
            <div class="split-head">Phần ${i+1} <button class="btn-mini btn-primary" onclick="copyText(this)">Copy</button></div>
            <textarea class="split-content">${p.trim()}</textarea>
        `;
        els.splitWrapper.appendChild(div);
    });
}

window.copyText = function(btn) {
    const txt = btn.parentElement.nextElementSibling;
    navigator.clipboard.writeText(txt.value);
    btn.textContent = "Copied!";
    setTimeout(() => btn.textContent = "Copy", 1000);
};
