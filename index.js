document.addEventListener('DOMContentLoaded', () => {
    const LANDING = document.getElementById('landing-page');
    const APP = document.getElementById('main-app');
    const STORAGE_KEY = 'trinh_hg_settings_v23_fixed';
    const INPUT_STATE_KEY = 'trinh_hg_input_state_v23';

    // FIX: Declare debounceSave in global scope
    let saveTimeout;
    const debounceSave = () => {
        clearTimeout(saveTimeout);
        saveTimeout = setTimeout(() => {
            saveTempInput();
            if(state.activeTab === 'settings') saveCurrentPairsToState(true);
        }, 500);
    };

    const defaultState = { currentMode: 'default', activeTab: 'settings', dialogueMode: 0, modes: { default: { pairs: [], matchCase: false, wholeWord: false, autoCaps: false, exceptions: 'jpg, png, com, vn' } } };
    let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultState;
    if(!state.modes[state.currentMode]) state.currentMode = 'default';

    let deviceId = localStorage.getItem('trinh_hg_dev_id');
    if(!deviceId) { deviceId = 'dev_' + Date.now(); localStorage.setItem('trinh_hg_dev_id', deviceId); }

    // --- AUTH ---
    checkAuth();
    async function checkAuth() {
        try {
            const res = await fetch('/api/heartbeat');
            if (res.ok) showApp(); else showLanding();
        } catch(e) { showLanding(); }
    }

    function showApp() {
        LANDING.classList.add('hidden');
        APP.classList.remove('hidden');
        renderModeSelect(); loadSettingsToUI(); loadTempInput();
        if(state.activeTab) switchTab(state.activeTab);
        loadKeyInfo();
        renderBuyWidget(document.getElementById('internal-buy-widget'));
        initEvents();
    }

    function showLanding() {
        LANDING.classList.remove('hidden');
        APP.classList.add('hidden');
        renderBuyWidget(document.getElementById('landing-buy-widget'));
    }

    // --- LOGIN ---
    const loginForm = document.getElementById('login-form');
    if(loginForm) {
        loginForm.onsubmit = async (e) => {
            e.preventDefault();
            const btn = document.getElementById('btn-login-submit');
            const key = document.getElementById('secret-key-input').value.trim();
            const originalHtml = btn.innerHTML;
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
                } else throw new Error(data.message);
            } catch(err) {
                btn.innerHTML = `<i class="fas fa-times"></i> ${err.message || "Lỗi!"}`;
                btn.classList.replace('btn-loading', 'btn-error-state');
                setTimeout(() => { btn.innerHTML = originalHtml; btn.classList.remove('btn-loading', 'btn-error-state'); }, 2000);
            }
        };
    }
    document.getElementById('logout-btn').onclick = async () => { await fetch('/logout'); window.location.reload(); };

    // --- BUY WIDGET ---
    window.copyTxt = (t) => { navigator.clipboard.writeText(t); alert("Đã sao chép: " + t); };
    function renderBuyWidget(container) {
        if(!container) return;
        container.innerHTML = `
            <div class="buy-widget">
                <div class="buy-row"><label>Đối tượng:</label><div class="btn-group" id="buy-type"><button class="btn-opt active" data-type="canhan">Cá Nhân (2 TB)</button><button class="btn-opt" data-type="doinhom">Đội Nhóm (15 TB)</button></div></div>
                <div class="buy-row"><label>Thời hạn:</label><div class="btn-group" id="buy-time"><button class="btn-opt" data-d="7">7 Ngày</button><button class="btn-opt active" data-d="30">30 Ngày</button><button class="btn-opt" data-d="custom">Tùy chỉnh</button></div></div>
                <div class="buy-row hidden" id="custom-days-box"><input type="number" class="form-control" id="inp-custom-days" value="1" min="1" placeholder="Số ngày..."></div>
                <div class="price-display"><span>Tổng thanh toán:</span><strong id="price-total">0 VNĐ</strong></div>
                <button class="btn-pay" id="btn-pay-action">THANH TOÁN NGAY</button>
                <div id="qr-result" class="qr-area hidden">
                    <img id="qr-img" class="qr-img" src="">
                    <p style="font-size:12px; color:red; margin:10px 0;">Vui lòng chuyển khoản đúng số tiền!</p>
                    <div class="bank-info">
                        <div class="bank-row"><span>Chủ TK:</span> <b>TRINH THI XUAN HUONG</b> <button class="btn-copy-small" onclick="copyTxt('TRINH THI XUAN HUONG')"><i class="fas fa-copy"></i></button></div>
                        <div class="bank-row"><span>Số TK:</span> <b>0917678211 (MB)</b> <button class="btn-copy-small" onclick="copyTxt('0917678211')"><i class="fas fa-copy"></i></button></div>
                        <div class="bank-row"><span>Nội dung:</span> <b id="code-display" style="color:#d97706">HG...</b> <button class="btn-copy-small" id="btn-copy-code"><i class="fas fa-copy"></i></button></div>
                        <div class="bank-row"><span>Số tiền:</span> <b id="amount-display" style="color:#059669">...</b> <button class="btn-copy-small" id="btn-copy-amt"><i class="fas fa-copy"></i></button></div>
                    </div>
                    <div id="status-text" style="margin-top:10px; font-weight:bold; color:#d97706;">Đang chờ giao dịch...</div>
                    <button class="btn-secondary" style="margin-top:10px;" id="btn-repick">Chọn lại gói</button>
                </div>
            </div>`;

        let bs = { type: 'canhan', days: 30 };
        const priceTotal = container.querySelector('#price-total');
        const inpCustom = container.querySelector('#inp-custom-days');

        const updatePrice = () => {
            let d = bs.days === 'custom' ? (parseInt(inpCustom.value)||1) : bs.days;
            // GIÁ: Cá nhân 2.200, Nhóm 4.300
            let rate = bs.type === 'canhan' ? 2200 : 4300;
            if(d >= 30) rate = bs.type === 'canhan' ? 1333 : 2666; // Giá tháng rẻ hơn (~40k/80k)
            
            let total = Math.round(d * rate / 1000) * 1000;
            if(bs.type==='canhan' && d===30) total=40000;
            if(bs.type==='doinhom' && d===30) total=80000;
            bs.price = total;
            priceTotal.textContent = total.toLocaleString('vi-VN') + " VNĐ";
        };

        container.querySelectorAll('.btn-opt').forEach(b => b.onclick = (e) => {
            const p = e.target.parentElement;
            p.querySelectorAll('.btn-opt').forEach(x => x.classList.remove('active'));
            e.target.classList.add('active');
            if(p.id === 'buy-type') bs.type = e.target.dataset.type;
            if(p.id === 'buy-time') { 
                bs.days = e.target.dataset.d === 'custom' ? 'custom' : parseInt(e.target.dataset.d);
                container.querySelector('#custom-days-box').classList.toggle('hidden', bs.days !== 'custom');
            }
            updatePrice();
        });
        inpCustom.oninput = updatePrice;

        let pollInterval;
        container.querySelector('#btn-pay-action').onclick = () => {
            updatePrice();
            const transCode = "HG" + Math.floor(100000 + Math.random() * 900000);
            const qrUrl = `https://img.vietqr.io/image/MB-0917678211-compact2.png?amount=${bs.price}&addInfo=${transCode}&accountName=TRINH%20THI%20XUAN%20HUONG`;
            container.querySelector('#qr-img').src = qrUrl;
            container.querySelector('#code-display').textContent = transCode;
            container.querySelector('#amount-display').textContent = bs.price.toLocaleString('vi-VN') + " VNĐ";
            container.querySelector('#btn-copy-code').onclick = () => copyTxt(transCode);
            container.querySelector('#btn-copy-amt').onclick = () => copyTxt(bs.price);
            
            container.querySelector('#qr-result').classList.remove('hidden');
            container.querySelector('#btn-pay-action').classList.add('hidden');

            const statusText = container.querySelector('#status-text');
            clearInterval(pollInterval);
            pollInterval = setInterval(async () => {
                try {
                    const res = await fetch(`/api/check-payment?code=${transCode}`);
                    const d = await res.json();
                    if(d.status === 'success') {
                        if((d.amount||0) >= bs.price) {
                            clearInterval(pollInterval);
                            statusText.textContent = "Thanh toán thành công! Đang đăng nhập...";
                            statusText.style.color = "green";
                            await fetch('/login', { method: 'POST', body: JSON.stringify({secret_key: d.key, device_id: deviceId}) });
                            window.location.reload();
                        } else {
                            statusText.textContent = `Lỗi: Nhận ${d.amount}, Cần ${bs.price}.`;
                            statusText.style.color = "red";
                        }
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

    // --- HELPER FUNC ---
    function normalizeInput(text) { return text ? text.normalize('NFC').replace(/[\u201C\u201D]/g, '"') : ''; }
    function escapeRegExp(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
    function countWords(s) { return s.trim() ? s.trim().split(/\s+/).length : 0; }
    function formatDialogue(text, mode) {
        if(mode==0) return text;
        return text.replace(/(^|[\n])([^:\n]+):\s*(?:\n\s*)?([“"'])([\s\S]*?)([”"'])/gm, (m,p1,p2,p3,p4) => {
            if(mode==1) return `${p1}${p2.trim()}: "${p4.trim()}"`;
            if(mode==2) return `${p1}${p2.trim()}:\n\n"${p4.trim()}"`;
            if(mode==3) return `${p1}${p2.trim()}:\n\n- ${p4.trim()}`;
            return m;
        });
    }
    
    function addPairToUI(find = '', replace = '', append = false) {
        if(!document.getElementById('punctuation-list')) return;
        const item = document.createElement('div'); item.className = 'punctuation-item';
        item.innerHTML = `<input type="text" class="find" placeholder="Tìm" value="${find}"><input type="text" class="replace" placeholder="Thay thế" value="${replace}"><button class="remove" tabindex="-1">×</button>`;
        item.querySelector('.remove').onclick = () => { item.remove(); debounceSave(); };
        item.querySelectorAll('input').forEach(inp => inp.addEventListener('input', debounceSave));
        const list = document.getElementById('punctuation-list');
        if (append) list.appendChild(item); else list.insertBefore(item, list.firstChild);
    }

    function initEvents() {
        const els = { replaceBtn: document.getElementById('replace-button'), copyBtn: document.getElementById('copy-button'), inputText: document.getElementById('input-text'), outputText: document.getElementById('output-text') };
        
        // Replace Logic
        if(els.replaceBtn) els.replaceBtn.onclick = () => {
            const raw = els.inputText.value;
            const btn = els.replaceBtn;
            if(!raw) return;
            btn.innerHTML = "ĐANG XỬ LÝ...";
            btn.classList.add('btn-loading');
            
            setTimeout(() => {
                let processed = normalizeInput(raw);
                const mode = state.modes[state.currentMode];
                
                // Replace
                if(mode.pairs) {
                    const rules = mode.pairs.filter(p=>p.find).map(p=>({find:normalizeInput(p.find), replace:normalizeInput(p.replace||'')})).sort((a,b)=>b.find.length-a.find.length);
                    rules.forEach(rule => {
                        const pat = escapeRegExp(rule.find);
                        const flags = mode.matchCase ? 'g' : 'gi';
                        const reg = mode.wholeWord ? new RegExp(`(?<![\\p{L}\\p{N}_])${pat}(?![\\p{L}\\p{N}_])`, flags+'u') : new RegExp(pat, flags);
                        processed = processed.replace(reg, rule.replace);
                    });
                }
                // Auto Caps
                if(mode.autoCaps) {
                    const ex = (mode.exceptions||"").split(',').map(s=>s.trim().toLowerCase());
                    const reg = /(^|[.?!]\s+)(?:(\uE000)(.*?)(\uE001)|([^\s\uE000\uE001]+))/gmu;
                    processed = processed.replace(reg, (m, pre, ms, mc, me, rawW) => {
                        let w = mc || rawW;
                        if(!w || ex.includes(w.toLowerCase())) return m;
                        let cap = w.charAt(0).toUpperCase() + w.slice(1);
                        return `${pre}${cap}`;
                    });
                }
                // Format
                processed = formatDialogue(processed, state.dialogueMode);
                els.outputText.innerText = processed; 
                saveTempInput();
                btn.innerHTML = "HOÀN TẤT!";
                btn.classList.replace('btn-loading', 'btn-success-state');
                setTimeout(() => { btn.innerHTML = "THỰC HIỆN THAY THẾ"; btn.classList.remove('btn-success-state'); }, 1000);
            }, 300);
        };
    }
});
