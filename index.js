document.addEventListener('DOMContentLoaded', () => {
    // =========================================================================
    // A. CONFIGURATION & STATE (GLOBAL)
    // =========================================================================
    const STORAGE_KEY = 'trinh_hg_settings_v23_fixed';
    const INPUT_STATE_KEY = 'trinh_hg_input_state_v23';
  
    // MARKERS
    const MARK_REP_START  = '\uE000'; const MARK_REP_END    = '\uE001';
    const MARK_CAP_START  = '\uE002'; const MARK_CAP_END    = '\uE003';
    const MARK_BOTH_START = '\uE004'; const MARK_BOTH_END   = '\uE005';
  
    const defaultState = {
      currentMode: 'default',
      activeTab: 'settings',
      dialogueMode: 0, 
      modes: { default: { pairs: [], matchCase: false, wholeWord: false, autoCaps: false, exceptions: 'jpg, png, com, vn, net' } }
    };
  
    let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultState;
    if (!state.modes || Object.keys(state.modes).length === 0) { state.modes = JSON.parse(JSON.stringify(defaultState.modes)); state.currentMode = 'default'; }
    if (!state.modes[state.currentMode]) state.currentMode = Object.keys(state.modes)[0] || 'default';
  
    let currentSplitMode = 2;
    let saveTimeout;

    // =========================================================================
    // B. AUTH & SYSTEM CHECK
    // =========================================================================
    const LANDING = document.getElementById('landing-page');
    const APP = document.getElementById('main-app');
    
    // Set Device ID if not exists
    let deviceId = localStorage.getItem('trinh_hg_device_id');
    if(!deviceId) { 
        deviceId = 'dev_' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('trinh_hg_device_id', deviceId);
    }

    // Init Check
    checkAuth();

    async function checkAuth() {
        try {
            const res = await fetch('/api/heartbeat');
            if (res.ok) {
                showApp();
                loadKeyInfo();
            } else {
                showLanding();
            }
        } catch(e) { showLanding(); }
    }

    function showApp() {
        LANDING.classList.add('hidden');
        APP.classList.remove('hidden');
        startHeartbeat();
        // Init logic for tool
        renderModeSelect(); loadSettingsToUI(); loadTempInput();
    }
    function showLanding() {
        LANDING.classList.remove('hidden');
        APP.classList.add('hidden');
        
        // Clone Buy Logic to Internal if needed
        const internalBuy = document.getElementById('internal-buy-placeholder');
        const buyBox = document.querySelector('.buy-box');
        if(internalBuy && buyBox) internalBuy.innerHTML = buyBox.innerHTML;
        bindBuyEvents(); 
    }

    function startHeartbeat() {
        setInterval(async () => {
            const res = await fetch('/api/heartbeat');
            if (res.status === 401) window.location.reload();
        }, 30000);
    }

    // =========================================================================
    // C. LOGIN & PAYMENT LOGIC
    // =========================================================================
    const loginForm = document.getElementById('login-form');
    const loginNotif = document.getElementById('login-notification');

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const key = document.getElementById('secret-key-input').value.trim();
        const btn = loginForm.querySelector('button');
        
        btn.textContent = "Đang kiểm tra...";
        btn.disabled = true;
        loginNotif.className = 'notification hidden';

        try {
            const res = await fetch('/login', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ secret_key: key, device_id: deviceId })
            });
            const data = await res.json();

            if (data.success) {
                loginNotif.textContent = "Kích hoạt thành công! Đang vào...";
                loginNotif.className = 'notification success';
                loginNotif.classList.remove('hidden');
                setTimeout(() => window.location.reload(), 1000);
            } else {
                loginNotif.textContent = data.message || "Lỗi không xác định";
                loginNotif.className = 'notification error';
                loginNotif.classList.remove('hidden');
                btn.textContent = "KÍCH HOẠT NGAY";
                btn.disabled = false;
            }
        } catch (e) {
            loginNotif.textContent = "Lỗi kết nối server";
            loginNotif.className = 'notification error';
            btn.disabled = false;
        }
    });

    document.getElementById('logout-btn').onclick = async () => {
        await fetch('/logout');
        window.location.reload();
    };

    function bindBuyEvents() {
        // Selector logic runs for both Landing and Internal
        const containers = [document.querySelector('.buy-box'), document.getElementById('internal-buy-placeholder')];
        
        containers.forEach(parent => {
            if(!parent) return;
            // Prevent binding twice
            if(parent.dataset.bound) return;
            parent.dataset.bound = "true";

            let opts = { type: 'canhan', dev: 2, days: 30, price: 40000 };
            
            const updateUI = () => {
                let dailyRate = 0;
                let finalDays = opts.days === 'custom' ? parseInt(parent.querySelector('#inp-custom-days').value) || 1 : parseInt(opts.days);
                
                if(opts.type === 'canhan') {
                    if(finalDays < 7) dailyRate = 2200;
                    else if(finalDays < 30) dailyRate = 2142; 
                    else dailyRate = 1333; 
                } else {
                    if(finalDays < 7) dailyRate = 4500;
                    else if(finalDays < 30) dailyRate = 4285; 
                    else dailyRate = 2666; 
                }
                
                let total = Math.round(finalDays * dailyRate / 1000) * 1000;
                if(opts.type==='canhan' && finalDays===7) total=15000;
                if(opts.type==='canhan' && finalDays===30) total=40000;
                if(opts.type==='doinhom' && finalDays===7) total=30000;
                if(opts.type==='doinhom' && finalDays===30) total=80000;

                opts.price = total;
                parent.querySelector('#price-val').textContent = total.toLocaleString('vi-VN') + ' VNĐ';
                parent.querySelector('#custom-days-row').classList.toggle('hidden', opts.days !== 'custom');
            };

            // Bind Type
            parent.querySelectorAll('#buy-type .toggle-btn').forEach(btn => btn.onclick = (e) => {
                parent.querySelectorAll('#buy-type .toggle-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                opts.type = e.target.dataset.type;
                updateUI();
            });

            // Bind Time
            parent.querySelectorAll('#buy-time .toggle-btn').forEach(btn => btn.onclick = (e) => {
                parent.querySelectorAll('#buy-time .toggle-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                opts.days = e.target.dataset.days;
                updateUI();
            });
            parent.querySelector('#inp-custom-days').oninput = updateUI;

            // Pay Start
            let pollInterval;
            parent.querySelector('#btn-pay-start').onclick = () => {
                const transCode = `HG${Math.floor(100000 + Math.random() * 900000)}`;
                // Tạo QR VietQR MB Bank
                const qrUrl = `https://img.vietqr.io/image/MB-0917678211-compact2.png?amount=${opts.price}&addInfo=${transCode}&accountName=TRINH%20THI%20XUAN%20HUONG`;
                
                parent.querySelector('.buy-step-1').classList.add('hidden');
                parent.querySelector('.buy-step-2').classList.remove('hidden');
                
                parent.querySelector('#vietqr-img').src = qrUrl;
                parent.querySelector('#trans-content').textContent = transCode;
                
                // Copy function
                parent.querySelector('#copy-content').onclick = () => {
                     navigator.clipboard.writeText(transCode);
                     alert("Đã copy nội dung: " + transCode);
                };

                pollPayment(transCode, parent);
            };

            // Reselect
            parent.querySelector('#btn-reselect').onclick = () => {
                clearInterval(pollInterval);
                parent.querySelector('.buy-step-2').classList.add('hidden');
                parent.querySelector('.buy-step-1').classList.remove('hidden');
            };

            function pollPayment(code, container) {
                const statusEl = container.querySelector('#pay-status');
                statusEl.textContent = "Đang chờ thanh toán...";
                statusEl.style.color = "#d97706";
                
                clearInterval(pollInterval);
                pollInterval = setInterval(async () => {
                    try {
                        const res = await fetch(`/api/check-payment?code=${code}`);
                        const d = await res.json();
                        if(d.status === 'success') {
                            clearInterval(pollInterval);
                            statusEl.textContent = "Thanh toán thành công! Đang đăng nhập...";
                            statusEl.style.color = "green";
                            // Auto Login
                            await fetch('/login', {
                                method: 'POST',
                                headers: {'Content-Type': 'application/json'},
                                body: JSON.stringify({ secret_key: d.key, device_id: deviceId })
                            });
                            window.location.reload();
                        }
                    } catch(e) {}
                }, 3000);
            }
        });
    }

    async function loadKeyInfo() {
        try {
            const res = await fetch('/api/key-info');
            if(!res.ok) return;
            const data = await res.json();
            
            // Key Info UI
            const elsKey = {
                display: document.getElementById('display-key'),
                status: document.getElementById('key-status-badge'),
                expiry: document.getElementById('expiry-date-display'),
                device: document.getElementById('device-count'),
                timer: document.getElementById('official-timer-block'),
                toggle: document.getElementById('toggle-key-visibility')
            };

            if(elsKey.display) elsKey.display.textContent = "*****************";
            let isHidden = true;
            if(elsKey.toggle) elsKey.toggle.onclick = () => {
                 isHidden = !isHidden;
                 elsKey.display.textContent = isHidden ? "*****************" : data.key;
                 elsKey.toggle.innerHTML = isHidden ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
            };

            if(elsKey.status) elsKey.status.textContent = data.type === 'permanent' ? 'OFFICIAL' : 'TEMP (DÙNG THỬ)';
            if(elsKey.device) elsKey.device.textContent = `${data.current_devices}/${data.max_devices}`;
            
            if(data.expires_at) {
                if(elsKey.expiry) elsKey.expiry.textContent = new Date(data.expires_at).toLocaleDateString('vi-VN');
                if(elsKey.timer) elsKey.timer.classList.remove('hidden');
                
                // Timer Logic: Used = Now - Activated
                const updateTimer = () => {
                    const now = Date.now();
                    const used = now - data.activated_at;
                    const left = data.expires_at - now;

                    if(left <= 0) {
                        document.getElementById('time-left').textContent = "HẾT HẠN";
                        return;
                    }

                    const format = (ms) => {
                        const s = Math.floor(ms/1000);
                        const d = Math.floor(s/86400);
                        const h = Math.floor((s%86400)/3600);
                        const m = Math.floor((s%3600)/60);
                        return `${d}d ${h}h ${m}m`;
                    };

                    document.getElementById('time-used').textContent = format(used);
                    document.getElementById('time-left').textContent = format(left);
                    
                    const total = data.expires_at - data.activated_at;
                    const pct = Math.min(100, (used/total)*100);
                    document.getElementById('time-progress').style.width = pct + '%';
                };
                updateTimer();
                setInterval(updateTimer, 1000);
            }
        } catch(e) {}
    }

    // =========================================================================
    // D. DOM ELEMENTS (TEXT TOOL)
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
  
    // =========================================================================
    // E. HELPER FUNCTIONS & LOGIC
    // =========================================================================
    function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    
    function showNotification(msg, type = 'success') {
      const container = document.getElementById('notification-container');
      const note = document.createElement('div');
      note.className = `notification ${type}`;
      note.textContent = msg;
      container.appendChild(note);
      setTimeout(() => { note.style.opacity = '0'; setTimeout(() => note.remove(), 300); }, 2000); 
    }
    
    function escapeHTML(str) { return str.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[m])); }
    function escapeRegExp(string) { return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    function preserveCase(o, r) {
        if (o === o.toUpperCase() && o !== o.toLowerCase()) return r.toUpperCase();
        if (o[0] === o[0].toUpperCase()) return r.charAt(0).toUpperCase() + r.slice(1).toLowerCase();
        return r;
    }
    function countWords(str) { return str.trim() ? str.trim().split(/\s+/).length : 0; }

    function normalizeInput(text) {
        if (!text) return '';
        let normalized = text.normalize('NFC');
        normalized = normalized.replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB\u275D\u275E\u301D-\u301F\uFF02\u02DD]/g, '"');
        normalized = normalized.replace(/[\u2018\u2019\u201A\u201B\u2039\u203A\u275B\u275C\u276E\u276F\uA78C\uFF07]/g, "'");
        normalized = normalized.replace(/\u00A0/g, ' ');
        normalized = normalized.replace(/\u2026/g, '...');
        return normalized;
    }

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

    // =========================================================================
    // F. REPLACE & SPLIT PIPELINE
    // =========================================================================
    function performReplaceAll() {
        const rawText = els.inputText.value;
        if (!rawText) return showNotification("Chưa có nội dung!", "error");

        try {
            let processedText = normalizeInput(rawText);
            const mode = state.modes[state.currentMode];
            let countReplace = 0; let countCaps = 0;

            if (mode.pairs && mode.pairs.length > 0) {
                const rules = mode.pairs
                    .filter(p => p.find && p.find.trim())
                    .map(p => ({ find: normalizeInput(p.find), replace: normalizeInput(p.replace || '') }))
                    .sort((a,b) => b.find.length - a.find.length);

                rules.forEach(rule => {
                    const pattern = escapeRegExp(rule.find);
                    const flags = mode.matchCase ? 'g' : 'gi';
                    const regex = mode.wholeWord 
                        ? new RegExp(`(?<![\\p{L}\\p{N}_])${pattern}(?![\\p{L}\\p{N}_])`, flags + 'u') 
                        : new RegExp(pattern, flags);
                    
                    processedText = processedText.replace(regex, (match) => {
                        countReplace++; 
                        let replacement = rule.replace;
                        if (!mode.matchCase) replacement = preserveCase(match, replacement);
                        return `${MARK_REP_START}${replacement}${MARK_REP_END}`;
                    });
                });
            }

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

            processedText = formatDialogue(processedText, state.dialogueMode);
            processedText = processedText.split(/\r?\n/).map(line => line.trim()).filter(line => line !== '').join('\n\n');

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
            els.inputText.value = ''; saveTempInput();
            showNotification("Hoàn tất xử lý!");
        } catch (e) { console.error(e); showNotification("Lỗi: " + e.message, "error"); }
    }

    // Split Logic
    function renderSplitPlaceholders(count) {
        els.splitWrapper.innerHTML = ''; 
        for (let i = 1; i <= count; i++) {
             const div = document.createElement('div'); div.className = 'split-box';
             div.innerHTML = `
                <div class="split-header"><span>Phần ${i} (Chờ kết quả...)</span><span class="badge">0 W</span></div>
                <textarea id="out-split-${i-1}" class="custom-scrollbar" readonly placeholder="Kết quả phần ${i} sẽ hiện ở đây..."></textarea>
                <div class="split-footer"><button class="btn btn-success full-width copy-split-btn" data-target="out-split-${i-1}" data-seq="${i}">Sao chép ${i}</button></div>
            `;
            els.splitWrapper.appendChild(div);
        }
        bindCopyEvents();
    }
    function performSplit() {
        const text = els.splitInput.value;
        if(!text.trim()) return showNotification('Chưa có nội dung!', 'error');
        const splitType = document.querySelector('input[name="split-type"]:checked').value;

        if (splitType === 'regex') {
            const regexStr = els.splitRegexInput.value;
            if (!regexStr) return showNotification("Chưa nhập Regex!", "error");
            try {
                const regex = new RegExp(regexStr, 'gmi');
                const matches = [...text.matchAll(regex)];
                if (matches.length === 0) return showNotification("Không tìm thấy chương nào!", "warning");
                let parts = [];
                for (let i = 0; i < matches.length; i++) {
                    const start = matches[i].index;
                    const end = (i < matches.length - 1) ? matches[i+1].index : text.length;
                    let chunk = text.substring(start, end).trim().split(/\r?\n/).filter(l => l.trim()).join('\n\n');
                    const title = chunk.split('\n')[0].trim();
                    parts.push({ content: chunk, title: title || `Phần ${i+1}` });
                }
                renderFilledSplitGrid(parts); showNotification(`Đã tìm thấy ${parts.length} chương!`);
            } catch (e) { return showNotification("Regex không hợp lệ!", "error"); }
        } else {
            const lines = normalizeInput(text).split('\n');
            let chapterHeader = '', contentBody = normalizeInput(text);
            if (/^(Chương|Chapter|Hồi)\s+\d+/.test(lines[0].trim())) { chapterHeader = lines[0].trim(); contentBody = lines.slice(1).join('\n'); }
            const paragraphs = contentBody.split('\n').filter(p => p.trim());
            const targetWords = Math.ceil(countWords(contentBody) / currentSplitMode);
            let currentPart = [], currentCount = 0, rawParts = [];
            for (let p of paragraphs) {
                const wCount = countWords(p);
                if (currentCount + wCount > targetWords && rawParts.length < currentSplitMode - 1) { rawParts.push(currentPart.join('\n\n')); currentPart = [p]; currentCount = wCount; } 
                else { currentPart.push(p); currentCount += wCount; }
            }
            if (currentPart.length) rawParts.push(currentPart.join('\n\n'));
            const existingBoxes = els.splitWrapper.children;
            if (existingBoxes.length !== currentSplitMode) renderSplitPlaceholders(currentSplitMode);
            for(let i = 0; i < currentSplitMode; i++) {
                let pContent = rawParts[i] || '';
                let h = `Phần ${i+1}`;
                if (chapterHeader && pContent) { h = chapterHeader.replace(/(\d+)/, (m, n) => `${n}.${i+1}`); pContent = h + '\n\n' + pContent; }
                const textArea = document.getElementById(`out-split-${i}`);
                const headerSpan = existingBoxes[i].querySelector('.split-header span:first-child');
                const badge = existingBoxes[i].querySelector('.badge');
                if (textArea) { textArea.value = pContent; if(headerSpan) headerSpan.textContent = pContent ? h : `Phần ${i+1} (Trống)`; if(badge) badge.textContent = countWords(pContent) + ' W'; }
            }
            showNotification(`Đã chia xong!`);
        }
        els.splitInput.value = ''; saveTempInput();
    }
    function renderFilledSplitGrid(parts) {
        els.splitWrapper.innerHTML = '';
        parts.forEach((part, index) => {
            const div = document.createElement('div'); div.className = 'split-box';
            div.innerHTML = `
                <div class="split-header"><span>${part.title.substring(0,27)}...</span><span class="badge">${countWords(part.content)} W</span></div>
                <textarea id="out-split-${index}" class="custom-scrollbar" readonly>${part.content}</textarea>
                <div class="split-footer"><button class="btn btn-success full-width copy-split-btn" data-target="out-split-${index}" data-seq="${index+1}">Sao chép ${index+1}</button></div>`;
            els.splitWrapper.appendChild(div);
        });
        bindCopyEvents();
    }
    function bindCopyEvents() {
        els.splitWrapper.querySelectorAll('.copy-split-btn').forEach(b => {
            b.onclick = (e) => {
                const el = document.getElementById(e.target.dataset.target);
                if(el && el.value) { 
                    navigator.clipboard.writeText(el.value); 
                    e.target.textContent = `Đã chép ${e.target.dataset.seq}!`;
                    setTimeout(()=>{ e.target.textContent = `Sao chép ${e.target.dataset.seq}`; }, 1500);
                } else showNotification("Ô trống!", "warning");
            };
        });
    }

    // =========================================================================
    // G. UI EVENT LISTENERS
    // =========================================================================
    function renderModeSelect() {
      els.modeSelect.innerHTML = '';
      Object.keys(state.modes).sort().forEach(m => {
        const opt = document.createElement('option'); opt.value = m; opt.textContent = m;
        els.modeSelect.appendChild(opt);
      });
      if(!state.modes[state.currentMode]) state.currentMode = 'default';
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
  
    function addPairToUI(find = '', replace = '', append = false) {
      const item = document.createElement('div'); item.className = 'punctuation-item';
      item.innerHTML = `<input type="text" class="find" placeholder="Tìm" value="${find.replace(/"/g, '&quot;')}"><input type="text" class="replace" placeholder="Thay thế" value="${replace.replace(/"/g, '&quot;')}"><button class="remove" tabindex="-1">×</button>`;
      item.querySelector('.remove').onclick = () => { item.remove(); checkEmptyState(); saveCurrentPairsToState(true); };
      item.querySelectorAll('input').forEach(inp => inp.addEventListener('input', debounceSave));
      if (append) els.list.appendChild(item); else els.list.insertBefore(item, els.list.firstChild);
      checkEmptyState();
    }
    
    function loadSettingsToUI() {
      els.list.innerHTML = '';
      const mode = state.modes[state.currentMode];
      if (mode && mode.pairs) mode.pairs.forEach(p => addPairToUI(p.find, p.replace, true));
      updateModeUI(); checkEmptyState();
    }
    function checkEmptyState() { els.emptyState.classList.toggle('hidden', els.list.children.length > 0); }
    function saveCurrentPairsToState(silent = false) {
      const items = Array.from(els.list.children);
      const newPairs = items.map(item => ({ find: item.querySelector('.find').value, replace: item.querySelector('.replace').value })).filter(p => p.find !== '');
      state.modes[state.currentMode].pairs = newPairs;
      saveState(); if (!silent) showNotification('Đã lưu cài đặt!', 'success');
    }
    
    // CSV Logic
    function parseCSVLine(text) {
        const result = []; let cell = ''; let inQuotes = false;
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (char === '"') { if (inQuotes && text[i+1] === '"') { cell += '"'; i++; } else { inQuotes = !inQuotes; } } 
            else if ((char === ',' || char === '\t') && !inQuotes) { result.push(cell.trim()); cell = ''; } 
            else { cell += char; }
        } result.push(cell.trim()); return result;
    }
    function importCSV(file) {
        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result; const lines = text.split(/\r?\n/);
            if (!lines[0].toLowerCase().includes('find') || !lines[0].toLowerCase().includes('replace')) return showNotification('Lỗi Header CSV!', 'error');
            let count = 0;
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i].trim(); if (!line) continue;
                const cols = parseCSVLine(line);
                if (cols.length >= 2) {
                    const find = cols[0]; const replace = cols[1]; const modeName = cols[2] || 'default';
                    if (find) {
                        if (!state.modes[modeName]) state.modes[modeName] = JSON.parse(JSON.stringify(defaultState.modes.default));
                        state.modes[modeName].pairs.push({ find, replace }); count++;
                    }
                }
            }
            saveState(); renderModeSelect(); loadSettingsToUI(); showNotification(`Đã nhập ${count} cặp!`);
        }; reader.readAsText(file);
    }
    function exportCSV() {
        saveCurrentPairsToState(true);
        let csvContent = "\uFEFFfind,replace,mode\n"; 
        Object.keys(state.modes).forEach(modeName => {
            const mode = state.modes[modeName];
            if (mode.pairs) mode.pairs.forEach(p => { csvContent += `"${(p.find||'').replace(/"/g, '""')}","${(p.replace||'').replace(/"/g, '""')}","${modeName.replace(/"/g, '""')}"\n`; });
        });
        const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'});
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'settings_full.csv'; a.click();
    }

    function updateCounters() {
      els.inputCount.textContent = 'Words: ' + countWords(els.inputText.value);
      els.outputCount.textContent = 'Words: ' + countWords(els.outputText.innerText);
      els.splitInputCount.textContent = 'Words: ' + countWords(els.splitInput.value);
    }
    function debounceSave() { clearTimeout(saveTimeout); saveTimeout = setTimeout(() => { saveTempInput(); if(state.activeTab==='settings') saveCurrentPairsToState(true); }, 500); }
    function saveTempInput() { localStorage.setItem(INPUT_STATE_KEY, JSON.stringify({ inputText: els.inputText.value, splitInput: els.splitInput.value })); }
    function loadTempInput() {
      const saved = JSON.parse(localStorage.getItem(INPUT_STATE_KEY));
      if(saved) { els.inputText.value = saved.inputText || ''; els.splitInput.value = saved.splitInput || ''; }
      updateCounters();
    }
    function switchTab(tabId) {
        els.tabButtons.forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === tabId));
        state.activeTab = tabId; saveState();
    }
    function switchSidebar(targetId) {
        els.sidebarBtns.forEach(b => b.classList.toggle('active', b.dataset.target === targetId));
        els.settingPanels.forEach(p => p.classList.toggle('active', p.id === targetId));
    }

    function initEvents() {
      // Switchers
      els.tabButtons.forEach(btn => btn.onclick = () => switchTab(btn.dataset.tab));
      els.sidebarBtns.forEach(btn => btn.onclick = () => switchSidebar(btn.dataset.target));

      // Settings Logic
      const toggleHandler = (prop) => { const m = state.modes[state.currentMode]; m[prop] = !m[prop]; saveState(); updateModeUI(); };
      els.matchCaseBtn.onclick = () => toggleHandler('matchCase');
      els.wholeWordBtn.onclick = () => toggleHandler('wholeWord');
      els.autoCapsBtn.onclick = () => toggleHandler('autoCaps');
      
      els.modeSelect.onchange = (e) => { state.currentMode = e.target.value; saveState(); loadSettingsToUI(); };
      els.saveExceptionBtn.onclick = () => { state.modes[state.currentMode].exceptions = els.capsExceptionInput.value; saveState(); showNotification('Đã lưu ngoại lệ!'); };

      document.getElementById('add-mode').onclick = () => { 
          const n = prompt('Tên Mode mới:'); 
          if(n && !state.modes[n]) { state.modes[n] = JSON.parse(JSON.stringify(defaultState.modes.default)); state.currentMode = n; saveState(); renderModeSelect(); loadSettingsToUI(); }
      };
      document.getElementById('copy-mode').onclick = () => {
        const n = prompt('Tên Mode bản sao:'); 
        if(n && !state.modes[n]) { state.modes[n] = JSON.parse(JSON.stringify(state.modes[state.currentMode])); state.currentMode = n; saveState(); renderModeSelect(); loadSettingsToUI(); }
      };
      els.renameBtn.onclick = () => { 
          const n = prompt('Tên mới:', state.currentMode); 
          if(n && n !== state.currentMode && !state.modes[n]) { state.modes[n] = state.modes[state.currentMode]; delete state.modes[state.currentMode]; state.currentMode = n; saveState(); renderModeSelect(); }
      };
      els.deleteBtn.onclick = () => { 
          if(confirm('Xóa chế độ này?')) { 
              delete state.modes[state.currentMode]; 
              const keys = Object.keys(state.modes);
              if (keys.length === 0) { state.modes['default'] = JSON.parse(JSON.stringify(defaultState.modes.default)); state.currentMode = 'default'; } else { state.currentMode = keys[0]; }
              saveState(); renderModeSelect(); loadSettingsToUI(); 
          }
      };
      document.getElementById('add-pair').onclick = () => addPairToUI();
      document.getElementById('save-settings').onclick = () => saveCurrentPairsToState();
      document.getElementById('export-settings').onclick = exportCSV;
      document.getElementById('import-settings').onclick = () => { const inp = document.createElement('input'); inp.type='file'; inp.accept='.csv'; inp.onchange = e => { if(e.target.files.length) importCSV(e.target.files[0]) }; inp.click(); };
      
      els.replaceBtn.onclick = performReplaceAll;
      document.getElementById('copy-button').onclick = () => { if(els.outputText.innerText) { navigator.clipboard.writeText(els.outputText.innerText).then(() => { showNotification('Đã sao chép văn bản!'); }); }};

      els.formatCards.forEach(card => {
          card.onclick = () => {
              state.dialogueMode = parseInt(card.dataset.format);
              saveState();
              updateModeUI();
              showNotification(`Đã chọn mẫu: ${card.querySelector('.card-header span').textContent}`);
          };
      });

      els.splitTypeRadios.forEach(radio => {
          radio.addEventListener('change', (e) => {
              const val = e.target.value;
              els.splitControlCount.classList.toggle('hidden', val !== 'count');
              els.splitControlRegex.classList.toggle('hidden', val !== 'regex');
              if(val === 'count') renderSplitPlaceholders(currentSplitMode);
              else els.splitWrapper.innerHTML = ''; 
          });
      });
      document.querySelectorAll('.split-mode-btn').forEach(btn => btn.onclick = () => { 
          document.querySelectorAll('.split-mode-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); 
          currentSplitMode = parseInt(btn.dataset.split); 
          renderSplitPlaceholders(currentSplitMode);
      });
      els.splitActionBtn.onclick = performSplit;
      els.clearSplitRegexBtn.onclick = () => { els.splitWrapper.innerHTML = ''; showNotification('Đã xóa kết quả chia!'); };
      
      [els.inputText, els.splitInput].forEach(el => el.addEventListener('input', () => { updateCounters(); debounceSave(); }));
    }

    // INIT EVENTS
    if(state.activeTab) switchTab(state.activeTab); 
    initEvents();
});
