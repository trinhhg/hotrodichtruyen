document.addEventListener('DOMContentLoaded', () => {
    // =========================================================================
    // 1. INIT & AUTH
    // =========================================================================
    const LANDING = document.getElementById('landing-page');
    const APP = document.getElementById('main-app');
    const STORAGE_KEY = 'trinh_hg_settings_v23_fixed';
    
    // Tạo Device ID duy nhất cho mỗi trình duyệt
    let deviceId = localStorage.getItem('trinh_hg_dev_id');
    if(!deviceId) { deviceId = 'dev_' + Date.now() + Math.random().toString(36).substr(2, 5); localStorage.setItem('trinh_hg_dev_id', deviceId); }

    // State mặc định cho Text Tools
    const defaultState = { currentMode: 'default', dialogueMode: 0, modes: { default: { pairs: [], matchCase: false, wholeWord: false, autoCaps: false, exceptions: 'jpg, png, com, vn' } } };
    let state = JSON.parse(localStorage.getItem(STORAGE_KEY)) || defaultState;
    if(!state.modes[state.currentMode]) state.currentMode = 'default';

    checkAuth();

    async function checkAuth() {
        try {
            const res = await fetch('/api/heartbeat');
            if(res.ok) {
                showApp();
            } else {
                showLanding();
            }
        } catch(e) { showLanding(); }
    }

    function showApp() {
        LANDING.classList.add('hidden');
        APP.classList.remove('hidden');
        initToolLogic();
        loadKeyInfo();
        // Render widget mua key trong Sidebar App
        renderBuyWidget(document.getElementById('internal-buy-widget'));
    }

    function showLanding() {
        LANDING.classList.remove('hidden');
        APP.classList.add('hidden');
        // Render widget mua key ngoài Landing
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
    // 3. BUY KEY WIDGET (DÙNG CHUNG)
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

        // Logic Widget
        let buyState = { type: 'canhan', days: 30 };
        const priceTotal = container.querySelector('#price-total');
        const customBox = container.querySelector('#custom-days-box');
        const inpCustom = container.querySelector('#inp-custom-days');

        const updatePrice = () => {
            let d = buyState.days === 'custom' ? (parseInt(inpCustom.value)||1) : buyState.days;
            // BẢNG GIÁ MỚI THEO YÊU CẦU:
            // Cá nhân: 2200/ngày 
            // Đội nhóm: 4300/ngày
            // Giảm dần khi mua nhiều (Ở đây làm mẫu giảm cho mốc 30 ngày)
            
            let rate = 0;
            if(buyState.type === 'canhan') {
                if(d < 7) rate = 2200;
                else if(d < 30) rate = 2100; 
                else rate = 1333; // 40k/30d
            } else {
                if(d < 7) rate = 4300;
                else if(d < 30) rate = 4100; 
                else rate = 2666; // 80k/30d
            }

            let total = Math.round(d * rate / 1000) * 1000; // Làm tròn nghìn
            // Fix cứng các mốc chuẩn
            if(buyState.type==='canhan' && d===30) total=40000;
            if(buyState.type==='doinhom' && d===30) total=80000;

            buyState.price = total;
            priceTotal.textContent = total.toLocaleString('vi-VN') + " VNĐ";
        };

        // Bind events
        container.querySelectorAll('#buy-type .btn-opt').forEach(b => b.onclick = (e) => {
            container.querySelectorAll('#buy-type .btn-opt').forEach(x => x.classList.remove('active'));
            e.target.classList.add('active');
            buyState.type = e.target.dataset.type;
            updatePrice();
        });

        container.querySelectorAll('#buy-time .btn-opt').forEach(b => b.onclick = (e) => {
            container.querySelectorAll('#buy-time .btn-opt').forEach(x => x.classList.remove('active'));
            e.target.classList.add('active');
            buyState.days = e.target.dataset.d === 'custom' ? 'custom' : parseInt(e.target.dataset.d);
            customBox.classList.toggle('hidden', buyState.days !== 'custom');
            updatePrice();
        });
        inpCustom.oninput = updatePrice;

        // CLICK THANH TOÁN
        let pollInterval;
        container.querySelector('#btn-pay-action').onclick = () => {
            updatePrice();
            const transCode = "HG" + Math.floor(100000 + Math.random() * 900000);
            
            // Generate QR VietQR
            const qrUrl = `https://img.vietqr.io/image/MB-0917678211-compact2.png?amount=${buyState.price}&addInfo=${transCode}&accountName=TRINH%20THI%20XUAN%20HUONG`;
            
            container.querySelector('#qr-img').src = qrUrl;
            container.querySelector('#code-display').textContent = transCode;
            container.querySelector('#amount-display').textContent = buyState.price.toLocaleString('vi-VN') + " VNĐ";
            
            container.querySelector('#qr-result').classList.remove('hidden');
            container.querySelector('#btn-pay-action').classList.add('hidden');

            // Polling check
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
                        // Auto login
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

        updatePrice(); // Init
    }

    // =========================================================================
    // 4. TEXT TOOLS LOGIC
    // =========================================================================
    function initToolLogic() {
        const els = {
            inputText: document.getElementById('input-text'),
            outputText: document.getElementById('output-text'),
            replaceBtn: document.getElementById('replace-button'),
            copyBtn: document.getElementById('copy-button'),
            // ... (Other standard elements)
        };

        // Render Settings List & Format Cards
        renderSettings();

        // 1. Logic Thay Thế (Inline Notification)
        if(els.replaceBtn) {
            els.replaceBtn.onclick = () => {
                const btn = els.replaceBtn;
                const originalText = btn.innerText;
                const raw = els.inputText.value;

                if(!raw) {
                    btn.innerText = "CHƯA CÓ NỘI DUNG!";
                    btn.classList.add('btn-error-state');
                    setTimeout(() => { btn.innerText = originalText; btn.classList.remove('btn-error-state'); }, 1500);
                    return;
                }

                btn.innerText = "ĐANG XỬ LÝ...";
                btn.classList.add('btn-loading');

                setTimeout(() => {
                    // --- CORE LOGIC REPLACE ---
                    let processed = raw; // Thực hiện replace thật ở đây (lấy từ state.modes)
                    
                    // Demo logic đơn giản:
                    const mode = state.modes[state.currentMode];
                    if(mode.pairs) {
                        mode.pairs.forEach(p => {
                            if(p.find) processed = processed.split(p.find).join(p.replace);
                        });
                    }
                    if(state.dialogueMode > 0) processed = formatDialogue(processed, state.dialogueMode);

                    // Render HTML Result
                    els.outputText.innerText = processed; 
                    
                    // Success State
                    btn.innerText = "HOÀN TẤT!";
                    btn.classList.replace('btn-loading', 'btn-success-state');
                    setTimeout(() => { btn.innerText = originalText; btn.classList.remove('btn-success-state'); }, 1000);
                }, 300);
            };
        }

        // 2. Logic Copy
        if(els.copyBtn) {
            els.copyBtn.onclick = () => {
                const txt = els.outputText.innerText;
                if(!txt) return;
                navigator.clipboard.writeText(txt);
                const btn = els.copyBtn;
                const org = btn.innerText;
                btn.innerText = "ĐÃ COPY!";
                btn.classList.add('btn-success-state');
                setTimeout(() => { btn.innerText = org; btn.classList.remove('btn-success-state'); }, 1000);
            };
        }

        // Navigation Switchers
        document.querySelectorAll('.nav-item').forEach(b => b.onclick = () => {
            document.querySelectorAll('.nav-item').forEach(x => x.classList.remove('active'));
            document.querySelectorAll('.tab-pane').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            document.getElementById(b.dataset.tab).classList.add('active');
        });

        document.querySelectorAll('.sb-btn').forEach(b => b.onclick = () => {
            document.querySelectorAll('.sb-btn').forEach(x => x.classList.remove('active'));
            document.querySelectorAll('.setting-panel').forEach(x => x.classList.remove('active'));
            b.classList.add('active');
            document.getElementById(b.dataset.target).classList.add('active');
        });

        // Format Card Select
        document.querySelectorAll('.format-card').forEach(c => c.onclick = () => {
            document.querySelectorAll('.format-card').forEach(x => x.classList.remove('active'));
            c.classList.add('active');
            state.dialogueMode = parseInt(c.dataset.format);
            saveState();
        });
    }

    // Helper functions
    function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    function renderSettings() {
        // Logic render list input replace giống bản cũ
        // ... Code render list pairs ...
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

    async function loadKeyInfo() {
        try {
            const res = await fetch('/api/key-info');
            const data = await res.json();
            document.getElementById('display-key').textContent = "*****************";
            document.getElementById('toggle-key').onclick = (e) => {
                 const el = document.getElementById('display-key');
                 if(el.textContent.includes('*')) { el.textContent = data.key; e.target.className = "fas fa-eye-slash"; }
                 else { el.textContent = "*****************"; e.target.className = "fas fa-eye"; }
            };
            document.getElementById('key-type').textContent = data.type === 'permanent' ? 'OFFICIAL' : 'TEMP';
            document.getElementById('key-device').textContent = `${data.current_devices}/${data.max_devices}`;
            if(data.expires_at) {
                const days = Math.ceil((data.expires_at - Date.now()) / 86400000);
                document.getElementById('key-expiry').textContent = `${new Date(data.expires_at).toLocaleDateString()} (${days} ngày)`;
            }
        } catch(e) {}
    }
});
