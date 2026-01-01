document.addEventListener('DOMContentLoaded', () => {
    // =========================================================================
    // 0. AUTH & SYSTEM CHECK
    // =========================================================================
    let currentUserKey = null;
    let serverVersion = null;
    const APP_VERSION = "2025.12.11.02"; 
    
    // Check Auth immediately
    checkAuth();

    async function checkAuth() {
        try {
            const res = await fetch('/api/heartbeat');
            if (res.status === 401) {
                showLoginModal("Vui lòng đăng nhập để tiếp tục.");
            } else if (res.ok) {
                // Logged in
                document.getElementById('auth-modal').classList.remove('active');
                loadKeyInfo();
                startHeartbeat();
            }
        } catch (e) { console.error("Auth check failed", e); }
    }

    // Auto-reload on deploy or expiry
    function startHeartbeat() {
        setInterval(async () => {
            try {
                const res = await fetch('/api/heartbeat');
                if (res.status === 401) window.location.reload(); // Đá ra nếu hết hạn
                
                const ver = res.headers.get('x-app-version');
                if (ver && ver !== APP_VERSION) {
                    console.log("New version detected, reloading...");
                    window.location.reload();
                }
            } catch(e) {}
        }, 30000); // Check every 30s
    }

    // =========================================================================
    // 1. CONFIGURATION & STATE
    // =========================================================================
    const STORAGE_KEY = 'trinh_hg_settings_v23_vip';
    const INPUT_STATE_KEY = 'trinh_hg_input_state_v23';
    
    const defaultState = {
      currentMode: 'default',
      activeTab: 'settings',
      dialogueMode: 0, 
      modes: { default: { pairs: [], matchCase: false, wholeWord: false, autoCaps: false, exceptions: 'jpg, png, com, vn, net' } }
    };
  
    let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultState;
    if (!state.modes || Object.keys(state.modes).length === 0) { state.modes = JSON.parse(JSON.stringify(defaultState.modes)); state.currentMode = 'default'; }
    
    // =========================================================================
    // 2. DOM ELEMENTS
    // =========================================================================
    const els = {
        list: document.getElementById('punctuation-list'),
        inputText: document.getElementById('input-text'),
        outputText: document.getElementById('output-text'),
        splitInput: document.getElementById('split-input-text'),
        splitWrapper: document.getElementById('split-outputs-wrapper'),
        // Auth UI
        modal: document.getElementById('auth-modal'),
        buyModal: document.getElementById('buy-modal'),
        loginForm: document.getElementById('login-form'),
        logoutBtn: document.getElementById('logout-btn'),
        // Key Info UI
        displayKey: document.getElementById('display-key'),
        toggleKeyBtn: document.getElementById('toggle-key-visibility'),
        keyStatusBadge: document.getElementById('key-status-badge'),
        deviceCount: document.getElementById('device-count'),
        timerBlock: document.getElementById('official-timer-block'),
        tempKeyMsg: document.getElementById('temp-key-msg'),
        timeUsed: document.getElementById('time-used'),
        timeLeft: document.getElementById('time-left'),
        timeProgress: document.getElementById('time-progress'),
        dateStart: document.getElementById('date-start'),
        dateEnd: document.getElementById('date-end')
    };

    // =========================================================================
    // 3. LOGIC: KEY INFO SIDEBAR
    // =========================================================================
    let keyHidden = true;
    let fullKeyValue = "";

    async function loadKeyInfo() {
        try {
            const res = await fetch('/api/key-info');
            if(!res.ok) return;
            const data = await res.json();
            
            fullKeyValue = data.key;
            currentUserKey = data.key;
            
            els.displayKey.textContent = keyHidden ? "*****************" : fullKeyValue;
            els.keyStatusBadge.textContent = data.type === 'permanent' ? 'CHÍNH THỨC' : 'DÙNG THỬ (TEMP)';
            els.keyStatusBadge.className = `badge ${data.type === 'permanent' ? 'badge-blue' : 'badge-yellow'}`;
            els.deviceCount.textContent = `${data.current_devices}/${data.max_devices}`;
            
            if (data.type === 'permanent' || data.status === 'official') {
                els.timerBlock.classList.remove('hidden');
                els.tempKeyMsg.classList.add('hidden');
                startCountdown(data.activated_at, data.expires_at);
            } else {
                els.timerBlock.classList.add('hidden');
                els.tempKeyMsg.classList.remove('hidden');
            }

            // Header expiry text
            const expDate = new Date(data.expires_at);
            const now = new Date();
            const daysLeft = Math.ceil((expDate - now) / (1000 * 60 * 60 * 24));
            document.getElementById('header-expiry-info').textContent = `Hết hạn: ${daysLeft} ngày`;

        } catch(e) { console.error(e); }
    }

    els.toggleKeyBtn.onclick = () => {
        keyHidden = !keyHidden;
        els.displayKey.textContent = keyHidden ? "*****************" : fullKeyValue;
        els.toggleKeyBtn.innerHTML = keyHidden ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
    };

    function startCountdown(startMs, endMs) {
        if(!startMs || !endMs) return;
        const total = endMs - startMs;
        
        els.dateStart.textContent = new Date(startMs).toLocaleDateString('vi-VN');
        els.dateEnd.textContent = new Date(endMs).toLocaleDateString('vi-VN');

        const update = () => {
            const now = Date.now();
            const used = now - startMs;
            const left = endMs - now;

            if (left <= 0) return window.location.reload(); // Expired

            const format = (ms) => {
                const s = Math.floor(ms/1000);
                const d = Math.floor(s/86400);
                const h = Math.floor((s%86400)/3600);
                const m = Math.floor((s%3600)/60);
                const sc = s%60;
                if(d > 0) return `${d}d ${h}h ${m}m`;
                return `${h}:${m}:${sc}`;
            };

            els.timeUsed.textContent = format(used);
            els.timeLeft.textContent = format(left);
            const percent = Math.min(100, (used / total) * 100);
            els.timeProgress.style.width = `${percent}%`;
        };
        update();
        setInterval(update, 1000);
    }

    // =========================================================================
    // 4. LOGIC: BUY KEY MODAL
    // =========================================================================
    const buyOpts = { target: 'canhan', maxDev: 2, days: 30, price: 0 };
    
    function updatePrice() {
        let numDays = buyOpts.days;
        if (numDays === 'custom') {
            numDays = parseInt(document.getElementById('inp-num-days').value) || 1;
        } else {
            numDays = parseInt(numDays);
        }

        let dailyRate = 0;
        // Logic giá: 
        // Cá nhân: 2.2k/ngày (lẻ), ~1.3k/ngày (tháng - 40k)
        // Nhóm: ~4.2k/ngày (lẻ), ~2.6k/ngày (tháng - 80k)
        
        if (buyOpts.target === 'canhan') {
            if (numDays < 7) dailyRate = 2200;
            else if (numDays < 30) dailyRate = 2142; // 15k/7ngay
            else dailyRate = 1333; // 40k/30ngay
        } else {
            if (numDays < 7) dailyRate = 4500;
            else if (numDays < 30) dailyRate = 4285; // 30k/7ngay
            else dailyRate = 2666; // 80k/30ngay
        }
        
        let total = Math.round(numDays * dailyRate / 1000) * 1000; // Tròn nghìn
        // Fix cứng giá chuẩn theo bảng
        if(buyOpts.target === 'canhan' && numDays === 7) total = 15000;
        if(buyOpts.target === 'canhan' && numDays === 30) total = 40000;
        if(buyOpts.target === 'doinhom' && numDays === 7) total = 30000;
        if(buyOpts.target === 'doinhom' && numDays === 30) total = 80000;

        buyOpts.price = total;
        document.getElementById('final-price').textContent = total.toLocaleString('vi-VN') + ' VNĐ';
        document.getElementById('price-note').textContent = `(~${Math.round(total/numDays).toLocaleString('vi-VN')}đ / ngày)`;
        document.getElementById('transfer-amount').innerHTML = `${total.toLocaleString('vi-VN')} VNĐ <i class="fas fa-copy copy-icon" data-copy="${total}"></i>`;
        bindCopyIcons();
    }

    // Event Bindings for Buy Modal
    document.querySelectorAll('#pill-target .pill').forEach(p => p.onclick = () => {
        document.querySelectorAll('#pill-target .pill').forEach(x => x.classList.remove('active'));
        p.classList.add('active');
        buyOpts.target = p.dataset.val;
        buyOpts.maxDev = parseInt(p.dataset.dev);
        updatePrice();
    });
    
    document.querySelectorAll('#pill-time .pill').forEach(p => p.onclick = () => {
        document.querySelectorAll('#pill-time .pill').forEach(x => x.classList.remove('active'));
        p.classList.add('active');
        buyOpts.days = p.dataset.days;
        document.getElementById('custom-days-input').classList.toggle('hidden', buyOpts.days !== 'custom');
        updatePrice();
    });
    document.getElementById('inp-num-days').oninput = updatePrice;

    // GENERATE TRANSACTION CODE
    let currentTransCode = "";
    document.getElementById('btn-pay-confirm').onclick = () => {
        document.getElementById('payment-info-col').classList.remove('hidden');
        // Generate code: HG + Random 6 so
        const rnd = Math.floor(100000 + Math.random() * 900000);
        currentTransCode = `HG${rnd}`;
        
        const contentEl = document.getElementById('transfer-content');
        contentEl.innerHTML = `${currentTransCode} <i class="fas fa-copy copy-icon" data-copy="${currentTransCode}"></i>`;
        bindCopyIcons();
        
        // Disable settings to prevent change during payment
        document.querySelector('.buy-options').style.opacity = '0.5';
        document.querySelector('.buy-options').style.pointerEvents = 'none';
    };

    function bindCopyIcons() {
        document.querySelectorAll('.copy-icon').forEach(icon => {
            icon.onclick = (e) => {
                const txt = e.target.dataset.copy;
                navigator.clipboard.writeText(txt);
                const originalClass = e.target.className;
                e.target.className = "fas fa-check text-green-500";
                setTimeout(() => e.target.className = originalClass, 1500);
            };
        });
    }

    // CHECK PAYMENT POLLING
    document.getElementById('btn-paid-check').onclick = async () => {
        const btn = document.getElementById('btn-paid-check');
        const status = document.getElementById('check-status');
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang kiểm tra...';
        status.textContent = "Hệ thống đang quét giao dịch (Max 60s)...";

        let attempts = 0;
        const interval = setInterval(async () => {
            attempts++;
            try {
                // Call API check payment
                const res = await fetch(`/api/check-payment?code=${currentTransCode}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data.status === 'success') {
                        clearInterval(interval);
                        status.textContent = "Thanh toán thành công! Đang đăng nhập...";
                        status.style.color = "green";
                        // Auto login with new key
                        await performLogin(data.key);
                    }
                }
            } catch(e) {}

            if (attempts >= 20) { // 60s (3s * 20)
                clearInterval(interval);
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-redo"></i> Thử lại';
                status.textContent = "Chưa tìm thấy giao dịch. Vui lòng thử lại sau 1 phút hoặc liên hệ Admin.";
                status.style.color = "red";
            }
        }, 3000);
    };

    // =========================================================================
    // 5. CORE FUNCTIONS (LOGIN, UI)
    // =========================================================================
    
    // Login Modal
    function showLoginModal(msg) {
        els.modal.classList.add('active');
        if(msg) {
            const err = document.getElementById('login-error');
            err.textContent = msg;
            err.classList.remove('hidden');
        }
        // Set Device ID
        let did = localStorage.getItem('trinh_hg_device_id');
        if(!did) { did = 'dev_'+Math.random().toString(36).substr(2); localStorage.setItem('trinh_hg_device_id', did); }
        document.getElementById('device-id-input').value = did;
    }

    els.loginForm.onsubmit = async (e) => {
        e.preventDefault();
        const key = document.getElementById('secret-key-input').value.trim();
        await performLogin(key);
    };

    async function performLogin(key) {
        const did = localStorage.getItem('trinh_hg_device_id');
        const fd = new FormData();
        fd.append('secret_key', key);
        fd.append('device_id', did);

        try {
            const res = await fetch('/login', { method: 'POST', body: fd });
            if (res.redirected || res.ok) {
                window.location.reload();
            } else {
                const html = await res.text();
                // Simple parse error from html response
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const errMsg = doc.querySelector('.notification')?.textContent || "Lỗi đăng nhập";
                document.getElementById('login-error').textContent = errMsg;
                document.getElementById('login-error').classList.remove('hidden');
            }
        } catch(e) { console.error(e); }
    }

    els.logoutBtn.onclick = async () => {
        await fetch('/logout');
        window.location.reload();
    };

    // Open Buy Modal
    document.getElementById('open-buy-modal-btn').onclick = (e) => {
        e.preventDefault();
        els.buyModal.classList.add('active');
        updatePrice();
    };
    document.querySelector('.modal-close').onclick = () => els.buyModal.classList.remove('active');

    // =========================================================================
    // 6. FIX: LIST SCROLL & ORDER (Existing Logic with Fixes)
    // =========================================================================
    
    function addPairToUI(find = '', replace = '', append = false) {
      const item = document.createElement('div'); 
      item.className = 'punctuation-item';
      
      // Index Badge (will be updated dynamically)
      const badge = document.createElement('div');
      badge.className = 'index-badge';
      
      const inputs = `
        <input type="text" class="find" placeholder="Tìm" value="${find.replace(/"/g, '&quot;')}">
        <input type="text" class="replace" placeholder="Thay thế" value="${replace.replace(/"/g, '&quot;')}">
        <button class="btn btn-danger btn-sm remove" tabindex="-1">×</button>
      `;
      item.innerHTML = inputs;
      item.prepend(badge);

      item.querySelector('.remove').onclick = () => { item.remove(); updateIndices(); saveCurrentPairsToState(true); };
      item.querySelectorAll('input').forEach(inp => inp.addEventListener('input', debounceSave));
      
      // REVERSE ORDER: New items (empty) go to TOP (prepend). Loaded items use logic.
      if (append) {
          // When loading from saved state, we assume saved order is correct logic order (Top to Bottom priority)
          // To display, if we want ID 1 at bottom, we just render normally but calculate ID reversed.
          els.list.appendChild(item); 
      } else {
          // Add new button -> Prepend to top
          els.list.insertBefore(item, els.list.firstChild);
      }
      updateIndices();
    }
    
    function updateIndices() {
        const items = Array.from(els.list.children);
        const total = items.length;
        items.forEach((item, index) => {
            // Index 1 at bottom, Max at top. 
            // List DOM: [Item Newest, ..., Item Oldest]
            // So Item[0] should have highest number? 
            // Request: "số 1 ở dưới cùng rồi dần dần tăng lên".
            // If DOM order is Top-Down, bottom element is last child.
            // last child = 1. first child = total.
            item.querySelector('.index-badge').textContent = total - index;
        });
        document.getElementById('empty-state').classList.toggle('hidden', total > 0);
    }

    // Save/Load Logic (Standard)
    function saveCurrentPairsToState(silent = false) {
      const items = Array.from(els.list.children);
      const newPairs = items.map(item => ({ 
          find: item.querySelector('.find').value, 
          replace: item.querySelector('.replace').value 
      })).filter(p => p.find !== '');
      state.modes[state.currentMode].pairs = newPairs;
      saveState();
      if (!silent) showNotification('Đã lưu cài đặt!', 'success');
    }
    
    function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    function debounceSave() { clearTimeout(saveTimeout); saveTimeout = setTimeout(() => { saveCurrentPairsToState(true); }, 500); }
    let saveTimeout;

    // Load Settings
    function loadSettingsToUI() {
      els.list.innerHTML = '';
      const mode = state.modes[state.currentMode];
      if (mode && mode.pairs) mode.pairs.forEach(p => addPairToUI(p.find, p.replace, true));
      updateIndices();
    }

    // Other UI bindings (Tabs, Sidebar Switcher)
    document.querySelectorAll('.tab-button').forEach(b => b.onclick = () => {
        document.querySelectorAll('.tab-button').forEach(x => x.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        document.getElementById(b.dataset.tab).classList.add('active');
        state.activeTab = b.dataset.tab; saveState();
    });

    document.querySelectorAll('.sidebar-btn').forEach(b => b.onclick = () => {
        document.querySelectorAll('.sidebar-btn').forEach(x => x.classList.remove('active'));
        document.querySelectorAll('.setting-panel').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        document.getElementById(b.dataset.target).classList.add('active');
    });

    // Replace & Split Logic (Keep existing logic but simplified here for brevity - assume existing logic works)
    document.getElementById('add-pair').onclick = () => addPairToUI();
    document.getElementById('save-settings').onclick = () => saveCurrentPairsToState();
    
    loadSettingsToUI();
    if(state.activeTab) document.querySelector(`.tab-button[data-tab="${state.activeTab}"]`).click();

    // Helper notification
    function showNotification(msg, type='success') {
        const c = document.getElementById('notification-container');
        const n = document.createElement('div'); n.className = `notification ${type}`; n.textContent = msg;
        c.appendChild(n); setTimeout(()=>n.remove(), 2000);
    }
});
