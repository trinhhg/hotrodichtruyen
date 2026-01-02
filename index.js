document.addEventListener('DOMContentLoaded', () => {
    
    // --- PHẦN LOGIC ĐĂNG NHẬP (Giả lập để hiển thị UI) ---
    // Thực tế sẽ dùng logic gọi API kiểm tra Key từ LocalStorage
    const landingPage = document.getElementById('landing-page');
    const mainApp = document.getElementById('main-app');
    const btnLogin = document.getElementById('btnLogin');
    const btnLogout = document.getElementById('btnLogout');
    const keyInput = document.getElementById('keyInput');
    
    // Check LocalStorage nếu đã login thì vào thẳng app
    if(localStorage.getItem('trinh_hg_is_logged_in') === 'true') {
        showApp();
    }

    if(btnLogin) {
        btnLogin.addEventListener('click', () => {
            const key = keyInput.value.trim();
            if(key) {
                // Ở đây sẽ gọi API check key
                // Giả lập thành công:
                localStorage.setItem('trinh_hg_is_logged_in', 'true');
                showApp();
            } else {
                showNotification('Vui lòng nhập Key!', 'error');
            }
        });
    }

    if(btnLogout) {
        btnLogout.addEventListener('click', () => {
            if(confirm('Bạn muốn đăng xuất?')) {
                localStorage.removeItem('trinh_hg_is_logged_in');
                location.reload();
            }
        });
    }

    function showApp() {
        landingPage.classList.add('hidden');
        mainApp.classList.remove('hidden');
    }

    // --- PHẦN LOGIC TEXT TOOL (GIỮ NGUYÊN TỪ SOURCE CŨ) ---
    // =========================================================================
    // 1. CONFIGURATION & STATE
    // =========================================================================
    
    const STORAGE_KEY = 'trinh_hg_settings_v22_layout_fixed';
    const INPUT_STATE_KEY = 'trinh_hg_input_state_v22';
  
    // MARKERS
    const MARK_REP_START  = '\uE000'; 
    const MARK_REP_END    = '\uE001';
    const MARK_CAP_START  = '\uE002'; 
    const MARK_CAP_END    = '\uE003';
    const MARK_BOTH_START = '\uE004'; 
    const MARK_BOTH_END   = '\uE005';
  
    const defaultState = {
      currentMode: 'default',
      activeTab: 'settings',
      dialogueMode: 0, 
      modes: {
        default: { 
            pairs: [], matchCase: false, wholeWord: false, autoCaps: false, exceptions: 'jpg, png, com, vn, net'
        }
      }
    };
  
    let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultState;
    if (!state.activeTab) state.activeTab = 'settings';
    if (state.dialogueMode === undefined) state.dialogueMode = 0;

    if (!state.modes || Object.keys(state.modes).length === 0) {
        state.modes = JSON.parse(JSON.stringify(defaultState.modes));
        state.currentMode = 'default';
    }
    if (!state.modes[state.currentMode]) state.currentMode = Object.keys(state.modes)[0] || 'default';
  
    let currentSplitMode = 2;
    let saveTimeout;
  
    // =========================================================================
    // 2. DOM ELEMENTS (Updated Selectors for New HTML)
    // =========================================================================
    const els = {
      // Main Tabs (Sửa selector class)
      tabButtons: document.querySelectorAll('.nav-btn'), 
      
      // Sidebar & Panels
      sidebarBtns: document.querySelectorAll('.sidebar-btn'),
      settingPanels: document.querySelectorAll('.setting-panel'),
      
      // Settings Controls
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
      
      // Format Cards
      formatCards: document.querySelectorAll('.format-card'),

      // Input/Output
      inputText: document.getElementById('input-text'),
      outputText: document.getElementById('output-text'),
      replaceBtn: document.getElementById('replace-button'),
      
      // Split
      splitInput: document.getElementById('split-input-text'),
      splitWrapper: document.getElementById('split-outputs-wrapper'),
      splitRegexInput: document.getElementById('split-regex-input'),
      splitTypeRadios: document.getElementsByName('split-type'),
      splitControlCount: document.getElementById('split-type-count'),
      splitControlRegex: document.getElementById('split-type-regex'),
      splitActionBtn: document.getElementById('split-action-btn'),
      clearSplitRegexBtn: document.getElementById('clear-split-regex'),
      
      // Counters
      inputCount: document.getElementById('input-word-count'),
      outputCount: document.getElementById('output-word-count'), // Note: In HTML I removed this id from badge, added to span inside pane-head logic if needed, but lets keep it safe.
      replaceCountBadge: document.getElementById('count-replace'),
      capsCountBadge: document.getElementById('count-caps'),
      splitInputCount: document.getElementById('split-input-word-count')
    };
  
    // Helper to avoid null errors if element missing in new UI
    function safeSetText(el, text) { if(el) el.textContent = text; }

    // =========================================================================
    // 3. HELPER FUNCTIONS & LOGIC
    // =========================================================================
    function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    
    function showNotification(msg, type = 'success') {
      const container = document.getElementById('notification-container');
      const note = document.createElement('div');
      note.className = `notification ${type}`;
      note.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-check-circle' : 'fa-circle-exclamation'}"></i> ${msg}`;
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
    // 4. CORE: FIND & REPLACE PIPELINE
    // =========================================================================
    function performReplaceAll() {
        const rawText = els.inputText.value;
        if (!rawText) return showNotification("Chưa có nội dung!", "error");

        try {
            let processedText = normalizeInput(rawText);
            const mode = state.modes[state.currentMode];
            let countReplace = 0;
            let countCaps = 0;

            if (mode.pairs && mode.pairs.length > 0) {
                const rules = mode.pairs
                    .filter(p => p.find && p.find.trim())
                    .map(p => ({ 
                        find: normalizeInput(p.find), 
                        replace: normalizeInput(p.replace || '') 
                    }))
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
                    if (mStart) {
                        countCaps++;
                        return `${prefix}${MARK_BOTH_START}${cappedWord}${MARK_BOTH_END}`;
                    } else {
                        if (rawWord.charAt(0) === rawWord.charAt(0).toUpperCase()) return match; 
                        countCaps++;
                        return `${prefix}${MARK_CAP_START}${cappedWord}${MARK_CAP_END}`;
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
            safeSetText(els.replaceCountBadge, `Rep: ${countReplace}`);
            safeSetText(els.capsCountBadge, `Caps: ${countCaps}`);
            updateCounters();
            
            els.inputText.value = ''; saveTempInput();
            showNotification("Đã xử lý xong!");
        } catch (e) { console.error(e); showNotification("Lỗi: " + e.message, "error"); }
    }

    // =========================================================================
    // 5. SPLITTER
    // =========================================================================
    function renderSplitPlaceholders(count) {
        els.splitWrapper.innerHTML = ''; 
        for (let i = 1; i <= count; i++) {
             const div = document.createElement('div'); div.className = 'split-box';
             div.innerHTML = `
                <div class="pane-head"><span>Phần ${i}</span><span class="badge-gray">0 Words</span></div>
                <textarea id="out-split-${i-1}" class="editor-textarea custom-scrollbar" readonly placeholder="Kết quả phần ${i}..."></textarea>
                <div class="split-footer"><button class="btn-success full-width copy-split-btn" data-target="out-split-${i-1}" data-seq="${i}">Sao chép P${i}</button></div>
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
                if (matches.length === 0) return showNotification("Không tìm thấy chương!", "warning");
                
                let parts = [];
                for (let i = 0; i < matches.length; i++) {
                    const start = matches[i].index;
                    const end = (i < matches.length - 1) ? matches[i+1].index : text.length;
                    let chunk = text.substring(start, end).trim().split(/\r?\n/).filter(l => l.trim()).join('\n\n');
                    const title = chunk.split('\n')[0].trim();
                    parts.push({ content: chunk, title: title || `Phần ${i+1}` });
                }
                renderFilledSplitGrid(parts); 
                showNotification(`Đã chia thành ${parts.length} chương!`);
            } catch (e) { return showNotification("Regex lỗi!", "error"); }
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
                if (textArea) textArea.value = pContent;
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
                <div class="pane-head"><span>${part.title.substring(0,20)}...</span><span class="badge-gray">${countWords(part.content)} W</span></div>
                <textarea id="out-split-${index}" class="editor-textarea custom-scrollbar" readonly>${part.content}</textarea>
                <div class="split-footer"><button class="btn-success full-width copy-split-btn" data-target="out-split-${index}" data-seq="${index+1}">Sao chép P${index+1}</button></div>`;
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
                    e.target.innerHTML = `<i class="fa-solid fa-check"></i> Đã chép!`;
                    setTimeout(()=>{ e.target.innerHTML = `Sao chép P${e.target.dataset.seq}`; }, 1500);
                }
            };
        });
    }

    // =========================================================================
    // 6. UI & EVENTS
    // =========================================================================
    function renderModeSelect() {
      if(!els.modeSelect) return;
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
          const upd = (btn, act) => { if(btn) btn.classList.toggle('active', act); };
          upd(els.matchCaseBtn, mode.matchCase);
          upd(els.wholeWordBtn, mode.wholeWord);
          upd(els.autoCapsBtn, mode.autoCaps);
          if(els.capsExceptionInput) els.capsExceptionInput.value = mode.exceptions || '';
      }
      if(els.formatCards) els.formatCards.forEach(card => card.classList.toggle('active', parseInt(card.dataset.format) === state.dialogueMode));
    }
  
    function addPairToUI(find = '', replace = '', append = false) {
      if(!els.list) return;
      const item = document.createElement('div'); item.className = 'punctuation-item';
      item.innerHTML = `<input type="text" class="find" placeholder="Tìm" value="${find.replace(/"/g, '&quot;')}"><input type="text" class="replace" placeholder="Thay thế" value="${replace.replace(/"/g, '&quot;')}"><button class="remove" tabindex="-1"><i class="fa-solid fa-xmark"></i></button>`;
      item.querySelector('.remove').onclick = () => { item.remove(); checkEmptyState(); saveCurrentPairsToState(true); };
      item.querySelectorAll('input').forEach(inp => inp.addEventListener('input', debounceSave));
      if (append) els.list.appendChild(item); else els.list.insertBefore(item, els.list.firstChild);
      checkEmptyState();
    }
    
    function loadSettingsToUI() {
      if(!els.list) return;
      els.list.innerHTML = '';
      const mode = state.modes[state.currentMode];
      if (mode && mode.pairs) mode.pairs.forEach(p => addPairToUI(p.find, p.replace, true));
      updateModeUI(); checkEmptyState();
    }
    function checkEmptyState() { if(els.emptyState) els.emptyState.classList.toggle('hidden', els.list.children.length > 0); }
    function saveCurrentPairsToState(silent = false) {
      if(!els.list) return;
      const items = Array.from(els.list.children);
      const newPairs = items.map(item => ({ find: item.querySelector('.find').value, replace: item.querySelector('.replace').value })).filter(p => p.find !== '');
      state.modes[state.currentMode].pairs = newPairs;
      saveState(); if (!silent) showNotification('Đã lưu cấu hình!');
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
            saveState(); renderModeSelect(); loadSettingsToUI(); showNotification(`Đã import ${count} dòng!`);
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
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'edittruyen_data.csv'; a.click();
    }

    function updateCounters() {
      if(els.inputCount) els.inputCount.textContent = countWords(els.inputText.value) + ' Words';
      if(els.splitInputCount) els.splitInputCount.textContent = countWords(els.splitInput.value) + ' Words';
    }
    function debounceSave() { clearTimeout(saveTimeout); saveTimeout = setTimeout(() => { saveTempInput(); if(state.activeTab==='settings') saveCurrentPairsToState(true); }, 500); }
    function saveTempInput() { localStorage.setItem(INPUT_STATE_KEY, JSON.stringify({ inputText: els.inputText.value, splitInput: els.splitInput.value })); }
    function loadTempInput() {
      const saved = JSON.parse(localStorage.getItem(INPUT_STATE_KEY));
      if(saved) { 
          if(els.inputText) els.inputText.value = saved.inputText || ''; 
          if(els.splitInput) els.splitInput.value = saved.splitInput || ''; 
      }
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
      els.tabButtons.forEach(btn => btn.onclick = () => switchTab(btn.dataset.tab));
      els.sidebarBtns.forEach(btn => btn.onclick = () => switchSidebar(btn.dataset.target));

      const toggleHandler = (prop) => { const m = state.modes[state.currentMode]; m[prop] = !m[prop]; saveState(); updateModeUI(); };
      if(els.matchCaseBtn) els.matchCaseBtn.onclick = () => toggleHandler('matchCase');
      if(els.wholeWordBtn) els.wholeWordBtn.onclick = () => toggleHandler('wholeWord');
      if(els.autoCapsBtn) els.autoCapsBtn.onclick = () => toggleHandler('autoCaps');
      
      if(els.modeSelect) els.modeSelect.onchange = (e) => { state.currentMode = e.target.value; saveState(); loadSettingsToUI(); };
      if(els.saveExceptionBtn) els.saveExceptionBtn.onclick = () => { state.modes[state.currentMode].exceptions = els.capsExceptionInput.value; saveState(); showNotification('Đã lưu!'); };

      if(document.getElementById('add-mode')) document.getElementById('add-mode').onclick = () => { 
          const n = prompt('Tên data mới:'); 
          if(n && !state.modes[n]) { state.modes[n] = JSON.parse(JSON.stringify(defaultState.modes.default)); state.currentMode = n; saveState(); renderModeSelect(); loadSettingsToUI(); }
      };
      if(els.renameBtn) els.renameBtn.onclick = () => { 
          const n = prompt('Tên mới:', state.currentMode); 
          if(n && n !== state.currentMode && !state.modes[n]) { state.modes[n] = state.modes[state.currentMode]; delete state.modes[state.currentMode]; state.currentMode = n; saveState(); renderModeSelect(); }
      };
      if(els.deleteBtn) els.deleteBtn.onclick = () => { 
          if(confirm('Xóa data này?')) { 
              delete state.modes[state.currentMode]; 
              const keys = Object.keys(state.modes);
              if (keys.length === 0) { state.modes['default'] = JSON.parse(JSON.stringify(defaultState.modes.default)); state.currentMode = 'default'; } else { state.currentMode = keys[0]; }
              saveState(); renderModeSelect(); loadSettingsToUI(); 
          }
      };
      if(document.getElementById('add-pair')) document.getElementById('add-pair').onclick = () => addPairToUI();
      if(document.getElementById('save-settings')) document.getElementById('save-settings').onclick = () => saveCurrentPairsToState();
      if(document.getElementById('export-settings')) document.getElementById('export-settings').onclick = exportCSV;
      if(document.getElementById('import-settings')) document.getElementById('import-settings').onclick = () => { const inp = document.createElement('input'); inp.type='file'; inp.accept='.csv'; inp.onchange = e => { if(e.target.files.length) importCSV(e.target.files[0]) }; inp.click(); };
      
      if(els.replaceBtn) els.replaceBtn.onclick = performReplaceAll;
      if(document.getElementById('copy-button')) document.getElementById('copy-button').onclick = () => { 
          if(els.outputText.innerText) { navigator.clipboard.writeText(els.outputText.innerText).then(() => { showNotification('Đã sao chép!'); }); }
      };

      els.formatCards.forEach(card => {
          card.onclick = () => {
              state.dialogueMode = parseInt(card.dataset.format);
              saveState(); updateModeUI();
          };
      });

      if(els.splitTypeRadios) els.splitTypeRadios.forEach(radio => {
          radio.addEventListener('change', (e) => {
              const val = e.target.value;
              if(els.splitControlCount) els.splitControlCount.classList.toggle('hidden', val !== 'count');
              if(els.splitControlRegex) els.splitControlRegex.classList.toggle('hidden', val !== 'regex');
              if(val === 'count') renderSplitPlaceholders(currentSplitMode);
              else els.splitWrapper.innerHTML = ''; 
          });
      });
      document.querySelectorAll('.num-btn').forEach(btn => btn.onclick = () => { 
          document.querySelectorAll('.num-btn').forEach(b=>b.classList.remove('active')); btn.classList.add('active'); 
          currentSplitMode = parseInt(btn.dataset.split); 
          renderSplitPlaceholders(currentSplitMode);
      });
      if(els.splitActionBtn) els.splitActionBtn.onclick = performSplit;
      if(els.clearSplitRegexBtn) els.clearSplitRegexBtn.onclick = () => { els.splitWrapper.innerHTML = ''; };
      
      if(els.inputText) els.inputText.addEventListener('input', () => { updateCounters(); debounceSave(); });
      if(els.splitInput) els.splitInput.addEventListener('input', () => { updateCounters(); debounceSave(); });
    }

    // INIT
    renderModeSelect(); 
    loadSettingsToUI(); 
    loadTempInput(); 
    if(state.activeTab) switchTab(state.activeTab); 
    if (document.querySelector('input[name="split-type"]:checked') && document.querySelector('input[name="split-type"]:checked').value === 'count') renderSplitPlaceholders(currentSplitMode);
    
    initEvents();
});
