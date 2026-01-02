document.addEventListener('DOMContentLoaded', () => {
    // =========================================================================
    // 1. SYSTEM INITIALIZATION & AUTH
    // =========================================================================
    const LANDING = document.getElementById('landing-page');
    const APP = document.getElementById('main-app');
    const STORAGE_KEY = 'trinh_hg_settings_v23_fixed';
    const INPUT_STATE_KEY = 'trinh_hg_input_state_v23';

    // State mặc định
    const defaultState = {
      currentMode: 'default',
      activeTab: 'settings',
      dialogueMode: 0, 
      modes: { default: { pairs: [], matchCase: false, wholeWord: false, autoCaps: false, exceptions: 'jpg, png, com, vn' } }
    };
    let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultState;
    if(!state.modes[state.currentMode]) state.currentMode = 'default';

    // Device ID
    let deviceId = localStorage.getItem('trinh_hg_dev_id');
    if(!deviceId) { 
        deviceId = 'dev_' + Date.now() + Math.random().toString(36).substr(2, 5); 
        localStorage.setItem('trinh_hg_dev_id', deviceId); 
    }

    // Check Auth
    checkAuth();

    async function checkAuth() {
        try {
            const res = await fetch('/api/heartbeat');
            if (res.ok) {
                showApp();
            } else {
                showLanding();
            }
        } catch(e) { showLanding(); }
    }

    function showApp() {
        LANDING.classList.add('hidden');
        APP.classList.remove('hidden');
        
        // Init Tool Logic
        renderModeSelect(); loadSettingsToUI(); loadTempInput();
        if(state.activeTab) switchTab(state.activeTab);
        
        // Load Key Info & Timer
        loadKeyInfo();
        
        // Render Internal Buy Widget
        renderBuyWidget(document.getElementById('internal-buy-widget'));
    }

    function showLanding() {
        LANDING.classList.remove('hidden');
        APP.classList.add('hidden');
        renderBuyWidget(document.getElementById('landing-buy-widget'));
    }

    // =========================================================================
    // 2. LOGIN (INLINE NOTIFICATION)
    // =========================================================================
    const loginForm = document.getElementById('login-form');
    if(loginForm) {
        loginForm.onsubmit = async (e) => {
            e.preventDefault();
            const btn = document.getElementById('btn-login-submit');
            const key = document.getElementById('secret-key-input').value.trim();
            const originalText = btn.innerHTML;

            // Chuyển nút sang trạng thái Loading
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ĐANG KIỂM TRA...';
            btn.classList.add('btn-loading');

            try {
                const res = await fetch('/login', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ secret_key: key, device_id: deviceId })
                });
                const data = await res.json();

                if(data.success) {
                    btn.innerHTML = '<i class="fas fa-check"></i> THÀNH CÔNG!';
                    btn.classList.replace('btn-loading', 'btn-success-state');
                    setTimeout(() => window.location.reload(), 1000);
                } else {
                    throw new Error(data.message);
                }
            } catch(err) {
                btn.innerHTML = `<i class="fas fa-times"></i> ${err.message || "Lỗi!"}`;
                btn.classList.replace('btn-loading', 'btn-error-state');
                setTimeout(() => {
                    btn.innerHTML = originalText;
                    btn.classList.remove('btn-loading', 'btn-error-state');
                }, 2000);
            }
        };
    }

    document.getElementById('logout-btn').onclick = async () => {
        await fetch('/logout');
        window.location.reload();
    };

    // =========================================================================
    // 3. KEY INFO & TIMER LOGIC (FIXED)
    // =========================================================================
    // Biến toàn cục lưu Key thật để toggle hiển thị
    let REAL_KEY = ""; 

    async function loadKeyInfo() {
        try {
            const res = await fetch('/api/key-info');
            if(!res.ok) return;
            const data = await res.json();
            
            REAL_KEY = data.key;
            
            // DOM Elements
            const elDisplay = document.getElementById('display-key');
            const elToggle = document.getElementById('toggle-key-visibility');
            const elStatus = document.getElementById('key-status-badge');
            const elExpiry = document.getElementById('expiry-date-display');
            const elDevice = document.getElementById('device-count');
            const elTimer = document.getElementById('official-timer-block');

            // Set Data
            elDisplay.textContent = "*****************";
            elStatus.textContent = data.type === 'permanent' ? 'CHÍNH THỨC' : 'DÙNG THỬ (TEMP)';
            elDevice.textContent = `${data.current_devices}/${data.max_devices}`;
            
            // Toggle Logic
            let isHidden = true;
            elToggle.onclick = () => {
                isHidden = !isHidden;
                elDisplay.textContent = isHidden ? "*****************" : REAL_KEY;
                elToggle.innerHTML = isHidden ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
            };

            // Timer Logic
            if(data.expires_at) {
                elTimer.classList.remove('hidden');
                elExpiry.textContent = new Date(data.expires_at).toLocaleDateString('vi-VN');
                
                const start = data.activated_at;
                const end = data.expires_at;
                
                const updateTimer = () => {
                    const now = Date.now();
                    const left = end - now;
                    const used = now - start;
                    const total = end - start;

                    if(left <= 0) {
                        document.getElementById('time-left').textContent = "HẾT HẠN";
                        return;
                    }

                    // Format function
                    const fmt = (ms) => {
                        const d = Math.floor(ms/86400000);
                        const h = Math.floor((ms%86400000)/3600000);
                        const m = Math.floor((ms%3600000)/60000);
                        return `${d}d ${h}h ${m}m`;
                    };

                    document.getElementById('time-used').textContent = fmt(used);
                    document.getElementById('time-left').textContent = fmt(left);
                    
                    const pct = Math.min(100, (used/total)*100);
                    document.getElementById('time-progress').style.width = pct + '%';
                };
                updateTimer();
                setInterval(updateTimer, 1000);
            }
        } catch(e) { console.error("Key info error", e); }
    }

    // =========================================================================
    // 4. BUY KEY WIDGET (DÙNG CHUNG)
    // =========================================================================
    function renderBuyWidget(container) {
        if(!container) return;
        
        container.innerHTML = `
            <div class="buy-widget">
                <div class="buy-row">
                    <label>Đối tượng:</label>
                    <div class="btn-group" id="buy-type">
                        <button class="btn-opt active" data-type="canhan">Cá Nhân (2 Thiết bị)</button>
                        <button class="btn-opt" data-type="doinhom">Đội Nhóm (15 Thiết bị)</button>
                    </div>
                </div>
                <div class="buy-row">
                    <label>Thời hạn:</label>
                    <div class="btn-group" id="buy-time">
                        <button class="btn-opt" data-d="7">7 Ngày</button>
                        <button class="btn-opt active" data-d="30">30 Ngày</button>
                        <button class="btn-opt" data-d="custom">Tùy chỉnh</button>
                    </div>
                </div>
                <div class="buy-row hidden" id="custom-days-box">
                    <input type="number" class="form-control" id="inp-custom-days" value="1" min="1" placeholder="Số ngày muốn mua">
                </div>
                <div class="price-display">
                    <span>Tổng thanh toán:</span>
                    <strong id="price-total">0 VNĐ</strong>
                </div>
                <button class="btn-pay" id="btn-pay-action">THANH TOÁN NGAY</button>
                
                <div id="qr-result" class="qr-area hidden">
                    <img id="qr-img" class="qr-img" src="">
                    <p style="font-size:12px; color:red; margin:10px 0;">Vui lòng chuyển khoản đúng số tiền bên dưới!</p>
                    <div class="bank-info">
                        <div class="bank-row"><span>Ngân hàng:</span> <b>MB Bank</b></div>
                        <div class="bank-row"><span>Số TK:</span> <b>0917678211</b></div>
                        <div class="bank-row"><span>Nội dung:</span> <b id="code-display" style="color:#d97706">HG...</b></div>
                        <div class="bank-row"><span>Số tiền:</span> <b id="amount-display" style="color:#059669">...</b></div>
                    </div>
                    <div id="status-text" style="margin-top:10px; font-weight:bold; color:#d97706;">Đang chờ giao dịch...</div>
                    <button class="btn-secondary full-width" style="margin-top:10px;" id="btn-repick">Chọn lại gói</button>
                </div>
            </div>
        `;

        // Widget Logic
        let bs = { type: 'canhan', days: 30 };
        const priceTotal = container.querySelector('#price-total');
        const customBox = container.querySelector('#custom-days-box');
        const inpCustom = container.querySelector('#inp-custom-days');

        const updatePrice = () => {
            let d = bs.days === 'custom' ? (parseInt(inpCustom.value)||1) : bs.days;
            let rate = 0;
            
            // BẢNG GIÁ THEO YÊU CẦU
            if(bs.type === 'canhan') {
                if(d < 7) rate = 2200;
                else if(d < 30) rate = 2100;
                else rate = 1333; // 40k/30d
            } else {
                if(d < 7) rate = 4300;
                else if(d < 30) rate = 4100;
                else rate = 2666; // 80k/30d
            }

            let total = Math.round(d * rate / 1000) * 1000;
            // Fix mốc chuẩn
            if(bs.type==='canhan' && d===30) total=40000;
            if(bs.type==='doinhom' && d===30) total=80000;

            bs.price = total;
            priceTotal.textContent = total.toLocaleString('vi-VN') + " VNĐ";
        };

        // Events
        container.querySelectorAll('#buy-type .btn-opt').forEach(b => b.onclick = (e) => {
            container.querySelectorAll('#buy-type .btn-opt').forEach(x => x.classList.remove('active'));
            e.target.classList.add('active');
            bs.type = e.target.dataset.type;
            updatePrice();
        });
        container.querySelectorAll('#buy-time .btn-opt').forEach(b => b.onclick = (e) => {
            container.querySelectorAll('#buy-time .btn-opt').forEach(x => x.classList.remove('active'));
            e.target.classList.add('active');
            bs.days = e.target.dataset.d === 'custom' ? 'custom' : parseInt(e.target.dataset.d);
            customBox.classList.toggle('hidden', bs.days !== 'custom');
            updatePrice();
        });
        inpCustom.oninput = updatePrice;

        // CLICK THANH TOÁN
        let pollInterval;
        container.querySelector('#btn-pay-action').onclick = () => {
            updatePrice();
            const transCode = "HG" + Math.floor(100000 + Math.random() * 900000);
            const qrUrl = `https://img.vietqr.io/image/MB-0917678211-compact2.png?amount=${bs.price}&addInfo=${transCode}&accountName=TRINH%20THI%20XUAN%20HUONG`;
            
            container.querySelector('#qr-img').src = qrUrl;
            container.querySelector('#code-display').textContent = transCode;
            container.querySelector('#amount-display').textContent = bs.price.toLocaleString('vi-VN') + " VNĐ";
            
            container.querySelector('#qr-result').classList.remove('hidden');
            container.querySelector('#btn-pay-action').classList.add('hidden');

            const statusText = container.querySelector('#status-text');
            clearInterval(pollInterval);
            pollInterval = setInterval(async () => {
                try {
                    const res = await fetch(`/api/check-payment?code=${transCode}`);
                    const d = await res.json();
                    if(d.status === 'success') {
                        clearInterval(pollInterval);
                        statusText.textContent = "Thanh toán thành công! Đang đăng nhập...";
                        statusText.style.color = "green";
                        await fetch('/login', { method: 'POST', body: JSON.stringify({secret_key: d.key, device_id: deviceId}) });
                        window.location.reload();
                    }
                } catch(e) {}
            }, 3000);
        };

        container.querySelector('#btn-repick').onclick = () => {
             clearInterval(pollInterval);
             container.querySelector('#qr-result').classList.add('hidden');
             container.querySelector('#btn-pay-action').classList.remove('hidden');
        };

        updatePrice();
    }

    // =========================================================================
    // 5. TEXT PROCESSING LOGIC (REPLACE & SPLIT)
    // =========================================================================
    const els = {
      tabButtons: document.querySelectorAll('.tab-button'),
      sidebarBtns: document.querySelectorAll('.sidebar-btn'),
      settingPanels: document.querySelectorAll('.setting-panel'),
      modeSelect: document.getElementById('mode-select'),
      list: document.getElementById('punctuation-list'),
      matchCaseBtn: document.getElementById('match-case'),
      wholeWordBtn: document.getElementById('whole-word'),
      autoCapsBtn: document.getElementById('auto-caps'), 
      renameBtn: document.getElementById('rename-mode'),
      deleteBtn: document.getElementById('delete-mode'),
      emptyState: document.getElementById('empty-state'),
      capsExceptionInput: document.getElementById('caps-exception'),
      saveExceptionBtn: document.getElementById('save-exception-btn'),
      formatCards: document.querySelectorAll('.format-card'),
      inputText: document.getElementById('input-text'),
      outputText: document.getElementById('output-text'),
      replaceBtn: document.getElementById('replace-button'),
      splitInput: document.getElementById('split-input-text'),
      splitWrapper: document.getElementById('split-outputs-wrapper'),
      splitRegexInput: document.getElementById('split-regex-input'),
      splitTypeRadios: document.getElementsByName('split-type'),
      splitControlCount: document.getElementById('split-type-count'),
      splitControlRegex: document.getElementById('split-type-regex'),
      splitActionBtn: document.getElementById('split-action-btn'),
      clearSplitRegexBtn: document.getElementById('clear-split-regex'),
      inputCount: document.getElementById('input-word-count'),
      outputCount: document.getElementById('output-word-count'),
      replaceCountBadge: document.getElementById('count-replace'),
      capsCountBadge: document.getElementById('count-caps'),
      splitInputCount: document.getElementById('split-input-word-count')
    };

    // CORE FUNCTIONS
    function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    function normalizeInput(text) {
        if (!text) return '';
        let normalized = text.normalize('NFC');
        normalized = normalized.replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB\u275D\u275E\u301D-\u301F\uFF02\u02DD]/g, '"');
        normalized = normalized.replace(/[\u2018\u2019\u201A\u201B\u2039\u203A\u275B\u275C\u276E\u276F\uA78C\uFF07]/g, "'");
        normalized = normalized.replace(/\u00A0/g, ' ');
        normalized = normalized.replace(/\u2026/g, '...');
        return normalized;
    }
    function escapeHTML(str) { return str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }
    function escapeRegExp(string) { return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    function preserveCase(o, r) {
        if (o === o.toUpperCase() && o !== o.toLowerCase()) return r.toUpperCase();
        if (o[0] === o[0].toUpperCase()) return r.charAt(0).toUpperCase() + r.slice(1).toLowerCase();
        return r;
    }
    function countWords(str) { return str.trim() ? str.trim().split(/\s+/).length : 0; }

    function formatDialogue(text, mode) {
        if (mode == 0) return text; 
        const regex = /(^|[\n])([^:\n]+):\s*(?:\n\s*)?([“"'])([\s\S]*?)([”"'])/gm;
        return text.replace(regex, (match, p1, p2, p3, p4, p5) => {
            const context = p2.trim();
            let content = p4.trim();
            if (mode == 1) return `${p1}${context}: "${content}"`;
            else if (mode == 2) return `${p1}${context}:\n\n"${content}"`;
            else if (mode == 3) return `${p1}${context}:\n\n- ${content}`;
            return match;
        });
    }

    // --- LOGIC UI: RENDER SETTINGS ---
    function renderModeSelect() {
      els.modeSelect.innerHTML = '';
      Object.keys(state.modes).sort().forEach(m => {
        const opt = document.createElement('option'); opt.value = m; opt.textContent = m;
        els.modeSelect.appendChild(opt);
      });
      els.modeSelect.value = state.currentMode;
      updateModeUI();
    }
    function updateModeUI() {
      const mode = state.modes[state.currentMode];
      if(mode) {
          const upd = (btn, act, txt) => { btn.textContent = `${txt}: ${act ? 'BẬT' : 'Tắt'}`; btn.classList.toggle('active', act); };
          upd(els.matchCaseBtn, mode.matchCase, 'Match Case');
          upd(els.wholeWordBtn, mode.wholeWord, 'Whole Word');
          upd(els.autoCapsBtn, mode.autoCaps, 'Auto Caps');
          els.capsExceptionInput.value = mode.exceptions || '';
      }
      els.formatCards.forEach(card => {
          card.classList.toggle('active', parseInt(card.dataset.format) === state.dialogueMode);
      });
    }
    function loadSettingsToUI() {
      els.list.innerHTML = '';
      const mode = state.modes[state.currentMode];
      if (mode && mode.pairs) mode.pairs.forEach(p => addPairToUI(p.find, p.replace, true));
      updateModeUI(); checkEmptyState();
    }
    function checkEmptyState() { els.emptyState.classList.toggle('hidden', els.list.children.length > 0); }
    function addPairToUI(find = '', replace = '', append = false) {
      const item = document.createElement('div'); item.className = 'punctuation-item';
      item.innerHTML = `<input type="text" class="find" placeholder="Tìm" value="${find.replace(/"/g, '&quot;')}"><input type="text" class="replace" placeholder="Thay thế" value="${replace.replace(/"/g, '&quot;')}"><button class="remove" tabindex="-1">×</button>`;
      item.querySelector('.remove').onclick = () => { item.remove(); checkEmptyState(); saveCurrentPairsToState(true); };
      item.querySelectorAll('input').forEach(inp => inp.addEventListener('input', () => setTimeout(() => saveCurrentPairsToState(true), 500)));
      if (append) els.list.appendChild(item); else els.list.insertBefore(item, els.list.firstChild);
      checkEmptyState();
    }
    function saveCurrentPairsToState(silent = false) {
      const items = Array.from(els.list.children);
      const newPairs = items.map(item => ({ find: item.querySelector('.find').value, replace: item.querySelector('.replace').value })).filter(p => p.find !== '');
      state.modes[state.currentMode].pairs = newPairs;
      saveState(); 
    }
    function loadTempInput() {
      const saved = JSON.parse(localStorage.getItem(INPUT_STATE_KEY));
      if(saved) { els.inputText.value = saved.inputText || ''; els.splitInput.value = saved.splitInput || ''; }
      updateCounters();
    }
    function saveTempInput() { localStorage.setItem(INPUT_STATE_KEY, JSON.stringify({ inputText: els.inputText.value, splitInput: els.splitInput.value })); }

    // --- ACTION: REPLACE ---
    els.replaceBtn.onclick = () => {
        const rawText = els.inputText.value;
        const btn = els.replaceBtn;
        const orgText = btn.innerText;

        if (!rawText) {
            btn.innerText = "CHƯA CÓ NỘI DUNG!";
            btn.classList.add('btn-error-state');
            setTimeout(() => { btn.innerText = orgText; btn.classList.remove('btn-error-state'); }, 1500);
            return;
        }

        btn.innerText = "ĐANG XỬ LÝ...";
        btn.classList.add('btn-loading');

        setTimeout(() => {
            try {
                let processedText = normalizeInput(rawText);
                const mode = state.modes[state.currentMode];
                let countReplace = 0; let countCaps = 0;

                const MARK_REP_START='\uE000'; const MARK_REP_END='\uE001'; const MARK_CAP_START='\uE002'; const MARK_CAP_END='\uE003'; const MARK_BOTH_START='\uE004'; const MARK_BOTH_END='\uE005';

                // 1. Replace
                if (mode.pairs && mode.pairs.length > 0) {
                    const rules = mode.pairs
                        .filter(p => p.find && p.find.trim())
                        .map(p => ({ find: normalizeInput(p.find), replace: normalizeInput(p.replace || '') }))
                        .sort((a,b) => b.find.length - a.find.length);

                    rules.forEach(rule => {
                        const pattern = escapeRegExp(rule.find);
                        const flags = mode.matchCase ? 'g' : 'gi';
                        const regex = mode.wholeWord ? new RegExp(`(?<![\\p{L}\\p{N}_])${pattern}(?![\\p{L}\\p{N}_])`, flags + 'u') : new RegExp(pattern, flags);
                        processedText = processedText.replace(regex, (match) => {
                            countReplace++; 
                            let replacement = rule.replace;
                            if (!mode.matchCase) replacement = preserveCase(match, replacement);
                            return `${MARK_REP_START}${replacement}${MARK_REP_END}`;
                        });
                    });
                }

                // 2. Auto Caps
                if (mode.autoCaps) {
                    const exceptionList = (mode.exceptions || "").split(',').map(s => s.trim().toLowerCase()).filter(s => s);
                    const autoCapsRegex = /(^|[.?!]\s+)(?:(\uE000)(.*?)(\uE001)|([^\s\uE000\uE001]+))/gmu;
                    processedText = processedText.replace(autoCapsRegex, (match, prefix, mStart, mContent, mEnd, rawWord) => {
                        let targetWord = mContent || rawWord;
                        if (!targetWord) return match;
                        if (exceptionList.includes(targetWord.toLowerCase())) return match;
                        let cappedWord = targetWord.charAt(0).toUpperCase() + targetWord.slice(1);
                        if (mStart) { countCaps++; return `${prefix}${MARK_BOTH_START}${cappedWord}${MARK_BOTH_END}`; } 
                        else { 
                            if (rawWord.charAt(0) === rawWord.charAt(0).toUpperCase()) return match; 
                            countCaps++; return `${prefix}${MARK_CAP_START}${cappedWord}${MARK_CAP_END}`;
                        }
                    });
                }

                // 3. Format
                processedText = formatDialogue(processedText, state.dialogueMode);
                processedText = processedText.split(/\r?\n/).map(line => line.trim()).filter(line => line !== '').join('\n\n');

                // Render HTML
                let finalHTML = ''; let buffer = '';
                for (let i = 0; i < processedText.length; i++) {
                    const c = processedText[i];
                    if (c === MARK_REP_START) { finalHTML += escapeHTML(buffer) + '<mark class="hl-yellow">'; buffer = ''; }
                    else if (c === MARK_REP_END || c === MARK_CAP_END || c === MARK_BOTH_END) { finalHTML += escapeHTML(buffer) + '</mark>'; buffer = ''; }
                    else if (c === MARK_CAP_START) { finalHTML += escapeHTML(buffer) + '<mark class="hl-blue">'; buffer = ''; }
                    else if (c === MARK_BOTH_START) { finalHTML += escapeHTML(buffer) + '<mark class="hl-orange">'; buffer = ''; }
                    else { buffer += c; }
                }
                finalHTML += escapeHTML(buffer);

                els.outputText.innerHTML = finalHTML;
                els.replaceCountBadge.textContent = `Replace: ${countReplace}`;
                els.capsCountBadge.textContent = `Auto-Caps: ${countCaps}`;
                updateCounters();
                els.inputText.value = ''; 
                saveTempInput();

                btn.innerText = "HOÀN TẤT!";
                btn.classList.replace('btn-loading', 'btn-success-state');
            } catch (e) { console.error(e); }
            
            setTimeout(() => { btn.innerText = orgText; btn.classList.remove('btn-success-state'); }, 1000);
        }, 200);
    };

    // --- ACTION: SPLIT ---
    let currentSplitMode = 2;
    function renderSplitPlaceholders(count) {
        els.splitWrapper.innerHTML = ''; 
        for (let i = 1; i <= count; i++) {
             const div = document.createElement('div'); div.className = 'split-box';
             div.innerHTML = `<div class="split-header"><span>Phần ${i}</span><span class="badge">0 W</span></div><textarea id="out-split-${i-1}" class="custom-scrollbar" readonly></textarea><div class="split-footer"><button class="btn btn-success full-width copy-split-btn" data-target="out-split-${i-1}">Sao chép</button></div>`;
            els.splitWrapper.appendChild(div);
        }
        els.splitWrapper.querySelectorAll('.copy-split-btn').forEach(b => b.onclick = (e) => {
            const el = document.getElementById(e.target.dataset.target);
            if(el && el.value) { navigator.clipboard.writeText(el.value); e.target.innerText = "Đã chép!"; setTimeout(()=>e.target.innerText="Sao chép",1000); }
        });
    }
    
    els.splitActionBtn.onclick = () => {
        const text = els.splitInput.value;
        if(!text.trim()) return;
        const splitType = document.querySelector('input[name="split-type"]:checked').value;
        
        if (splitType === 'regex') {
            const regexStr = els.splitRegexInput.value;
            try {
                const regex = new RegExp(regexStr, 'gmi');
                const matches = [...text.matchAll(regex)];
                let parts = [];
                for (let i = 0; i < matches.length; i++) {
                    const start = matches[i].index;
                    const end = (i < matches.length - 1) ? matches[i+1].index : text.length;
                    parts.push({ content: text.substring(start, end).trim() });
                }
                renderSplitPlaceholders(parts.length);
                parts.forEach((p,i) => { document.getElementById(`out-split-${i}`).value = p.content; });
            } catch (e) {}
        } else {
            // Count Split
            const lines = normalizeInput(text).split('\n');
            let contentBody = normalizeInput(text);
            if (/^(Chương|Chapter|Hồi)\s+\d+/.test(lines[0].trim())) { contentBody = lines.slice(1).join('\n'); }
            const paragraphs = contentBody.split('\n').filter(p => p.trim());
            const targetWords = Math.ceil(countWords(contentBody) / currentSplitMode);
            let currentPart = [], currentCount = 0, rawParts = [];
            for (let p of paragraphs) {
                const wCount = countWords(p);
                if (currentCount + wCount > targetWords && rawParts.length < currentSplitMode - 1) { rawParts.push(currentPart.join('\n\n')); currentPart = [p]; currentCount = wCount; } 
                else { currentPart.push(p); currentCount += wCount; }
            }
            if (currentPart.length) rawParts.push(currentPart.join('\n\n'));
            renderSplitPlaceholders(currentSplitMode);
            for(let i = 0; i < currentSplitMode; i++) { document.getElementById(`out-split-${i}`).value = rawParts[i] || ''; }
        }
    };

    // EVENTS INIT
    els.modeSelect.onchange = (e) => { state.currentMode = e.target.value; saveState(); loadSettingsToUI(); };
    els.saveExceptionBtn.onclick = () => { state.modes[state.currentMode].exceptions = els.capsExceptionInput.value; saveState(); };
    document.getElementById('add-mode').onclick = () => { const n = prompt('Tên Mode:'); if(n) { state.modes[n] = JSON.parse(JSON.stringify(defaultState.modes.default)); state.currentMode = n; saveState(); renderModeSelect(); }};
    document.getElementById('copy-mode').onclick = () => { const n = prompt('Tên Mode Copy:'); if(n) { state.modes[n] = JSON.parse(JSON.stringify(state.modes[state.currentMode])); state.currentMode = n; saveState(); renderModeSelect(); }};
    document.getElementById('rename-mode').onclick = () => { const n = prompt('Tên mới:', state.currentMode); if(n) { state.modes[n] = state.modes[state.currentMode]; delete state.modes[state.currentMode]; state.currentMode = n; saveState(); renderModeSelect(); }};
    document.getElementById('delete-mode').onclick = () => { if(confirm('Xóa?')) { delete state.modes[state.currentMode]; state.currentMode = Object.keys(state.modes)[0]||'default'; saveState(); renderModeSelect(); }};
    document.getElementById('add-pair').onclick = () => addPairToUI();
    document.getElementById('save-settings').onclick = () => saveCurrentPairsToState();
    document.getElementById('copy-button').onclick = () => { navigator.clipboard.writeText(els.outputText.innerText); };
    
    // Toggle Logic
    const toggleHandler = (prop) => { const m = state.modes[state.currentMode]; m[prop] = !m[prop]; saveState(); updateModeUI(); };
    els.matchCaseBtn.onclick = () => toggleHandler('matchCase');
    els.wholeWordBtn.onclick = () => toggleHandler('wholeWord');
    els.autoCapsBtn.onclick = () => toggleHandler('autoCaps');

    // Sidebar & Tab Switchers
    function switchTab(id) { 
        els.tabButtons.forEach(b => b.classList.toggle('active', b.dataset.tab === id));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === id));
        state.activeTab = id; saveState();
    }
    function switchSidebar(id) {
        els.sidebarBtns.forEach(b => b.classList.toggle('active', b.dataset.target === id));
        els.settingPanels.forEach(p => p.classList.toggle('active', p.id === id));
    }
    els.tabButtons.forEach(btn => btn.onclick = () => switchTab(btn.dataset.tab));
    els.sidebarBtns.forEach(btn => btn.onclick = () => switchSidebar(btn.dataset.target));
    els.formatCards.forEach(card => card.onclick = () => { state.dialogueMode = parseInt(card.dataset.format); saveState(); updateModeUI(); });
    els.splitTypeRadios.forEach(radio => radio.addEventListener('change', (e) => { 
        els.splitControlCount.classList.toggle('hidden', e.target.value !== 'count');
        els.splitControlRegex.classList.toggle('hidden', e.target.value !== 'regex');
    }));
    document.querySelectorAll('.split-mode-btn').forEach(btn => btn.onclick = () => { 
        document.querySelectorAll('.split-mode-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); 
        currentSplitMode = parseInt(btn.dataset.split); 
    });
    
    [els.inputText, els.splitInput].forEach(el => el.addEventListener('input', debounceSave));
});
