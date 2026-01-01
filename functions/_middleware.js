const TG_BOT_TOKEN = "8317998690:AAEJ51BLc6wp2gRAiTnM2qEyB4sXHYoN7lI"; 
const TG_ADMIN_ID = "5524168349"; 
const TG_CHANNEL_NOTIFY = "3206251077"; 
const ADMIN_SECRET = "trinhhg_admin_secret_123"; 
const CURRENT_VERSION = "2025.12.11.02";

export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);

  // --- HELPERS ---
  function getCookie(req, name) {
    const c = req.headers.get("Cookie");
    if(!c) return null;
    const m = c.match(new RegExp(name + "=([^;]+)"));
    return m ? m[1] : null;
  }
  
  async function sendTelegram(chatId, msg) {
      const tgUrl = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`;
      try { await fetch(tgUrl, { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: "HTML" }) }); } catch(e) {}
  }

  // --- API: KEY INFO (Dùng cho Sidebar) ---
  if (url.pathname === "/api/key-info") {
      const userKey = getCookie(request, "auth_vip");
      if(!userKey) return new Response("Unauthorized", {status: 401});
      
      const keyVal = await env.PRO_1.get(userKey);
      if(!keyVal) return new Response("Invalid", {status: 401});
      
      const data = JSON.parse(keyVal);
      // Trả về dữ liệu an toàn cho Client
      return new Response(JSON.stringify({
          key: userKey,
          type: data.type || 'VIP', // TEMP or VIP
          expires_at: data.expires_at,
          activated_at: data.activated_at,
          devices: data.devices || [],
          max_devices: data.max_devices
      }), { headers: { "Content-Type": "application/json" } });
  }

  // --- API: HEARTBEAT (Đá người dùng) ---
  if (url.pathname === "/api/heartbeat") {
      const userKey = getCookie(request, "auth_vip");
      if(!userKey) return new Response("No Key", {status: 401});
      const keyVal = await env.PRO_1.get(userKey);
      if(!keyVal) return new Response("Invalid Key", {status: 401, headers: { "Set-Cookie": "auth_vip=; Path=/; HttpOnly; Secure; Max-Age=0" }});
      
      const d = JSON.parse(keyVal);
      if(d.expires_at && Date.now() > d.expires_at) {
          return new Response("Expired", {status: 401, headers: { "Set-Cookie": "auth_vip=; Path=/; HttpOnly; Secure; Max-Age=0" }});
      }
      return new Response("OK", {status: 200});
  }

  if (url.pathname === "/api/version") return new Response(CURRENT_VERSION, {status: 200});

  // --- LOGOUT ---
  if (url.pathname === "/logout") {
      return new Response(null, { status: 302, headers: { "Location": "/", "Set-Cookie": `auth_vip=; Path=/; HttpOnly; Secure; Max-Age=0` } });
  }

  // --- LOGIN (POST) ---
  if (url.pathname === "/login" && request.method === "POST") {
    try {
        const formData = await request.formData();
        const inputKey = (formData.get("secret_key") || "").trim();
        const deviceId = (formData.get("device_id") || "unknown").trim();
        
        if (!inputKey) return new Response(renderLoginPage("Vui lòng nhập Key!"), {headers:{"Content-Type":"text/html"}});
        const keyVal = await env.PRO_1.get(inputKey);
        if (!keyVal) return new Response(renderLoginPage("Key không tồn tại!"), {headers:{"Content-Type":"text/html"}});
        
        let keyData = JSON.parse(keyVal);
        const now = Date.now();

        // LOGIC TEMP KEY: Nếu là TEMP thì expired_at được set cứng khi tạo (24h).
        // Nếu là OFFICIAL (chưa active) thì active ngay login đầu.
        if (!keyData.activated_at && keyData.type !== 'TEMP') {
             keyData.activated_at = now;
             keyData.expires_at = now + (keyData.duration_seconds * 1000);
             keyData.devices = [];
        }

        // Check hết hạn
        if (keyData.expires_at && now > keyData.expires_at) {
             return new Response(renderLoginPage("Key đã hết hạn!"), {headers:{"Content-Type":"text/html"}});
        }

        // Check Device Limit
        let devices = keyData.devices || [];
        if (!devices.find(d => d.id === deviceId)) {
            if (devices.length >= keyData.max_devices) return new Response(renderLoginPage(`Quá giới hạn thiết bị (${keyData.max_devices})!`), {headers:{"Content-Type":"text/html"}});
            devices.push({ id: deviceId, ip: request.headers.get("CF-Connecting-IP") });
            keyData.devices = devices;
            await env.PRO_1.put(inputKey, JSON.stringify(keyData));
        }

        return new Response(null, {
            status: 302,
            headers: { "Location": "/", "Set-Cookie": `auth_vip=${inputKey}; Path=/; HttpOnly; Secure; Max-Age=31536000` },
        });

    } catch (e) { return new Response(renderLoginPage("Error: " + e.message), {headers:{"Content-Type":"text/html"}}); }
  }

  // --- SERVE HTML ---
  if (url.pathname === "/" || url.pathname === "/index.html" || url.pathname === "/free.html" || url.pathname === "/vip.html") {
      const userKey = getCookie(request, "auth_vip");
      if (userKey) {
          const keyVal = await env.PRO_1.get(userKey);
          if (keyVal) {
              const d = JSON.parse(keyVal);
              if (d.expires_at && Date.now() < d.expires_at) {
                  // VIP or TEMP Active -> Serve VIP HTML
                  const response = await env.ASSETS.fetch(new URL("/vip.html", request.url));
                  return new Response(response.body, response);
              }
          }
      }
      // Không có key hoặc hết hạn -> Login Page
      return new Response(renderLoginPage(), {headers: {"Content-Type": "text/html; charset=utf-8"}});
  }

  return next();
}

// --- RENDER LOGIN PAGE (Với Modal Thanh Toán Mới) ---
function renderLoginPage(errorMsg) {
  return `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TrinhHG Access</title>
  <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700;800&display=swap" rel="stylesheet">
  <style>
    body { font-family: 'Montserrat', sans-serif; background: #f3f4f6; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .login-card { background: white; padding: 40px; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); width: 100%; max-width: 400px; text-align: center; }
    h2 { margin: 0 0 10px; color: #111827; }
    input { width: 100%; padding: 12px; margin: 15px 0; border: 1px solid #d1d5db; border-radius: 8px; box-sizing: border-box; }
    .btn { width: 100%; padding: 12px; border-radius: 8px; border: none; font-weight: 700; cursor: pointer; margin-top: 10px; }
    .btn-primary { background: #2563eb; color: white; }
    .btn-buy { background: #f59e0b; color: white; display: inline-block; text-decoration: none; }
    .notification { background: #fee2e2; color: #991b1b; padding: 10px; border-radius: 8px; margin-bottom: 15px; font-size: 13px; }
    
    /* MODAL STYLES */
    .modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); display: none; justify-content: center; align-items: center; z-index: 2000; }
    .modal-overlay.active { display: flex; }
    .modal-box { background: white; width: 500px; max-height: 90vh; overflow-y: auto; padding: 25px; border-radius: 12px; position: relative; animation: slideIn 0.3s; }
    @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: 0; opacity: 1; } }
    .close-btn { position: absolute; top: 15px; right: 15px; cursor: pointer; font-size: 20px; background: none; border: none; }
    
    .pricing-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 15px; }
    .price-card { border: 1px solid #eee; padding: 15px; border-radius: 8px; cursor: pointer; transition: 0.2s; }
    .price-card:hover, .price-card.selected { border-color: #2563eb; background: #eff6ff; }
    .qr-section { margin-top: 20px; text-align: center; display: none; border-top: 1px dashed #ddd; padding-top: 20px; }
    .qr-section.active { display: block; }
    .qr-img { width: 150px; height: 150px; border-radius: 8px; margin-bottom: 10px; }
    .bank-info { font-size: 13px; text-align: left; background: #f9fafb; padding: 10px; border-radius: 6px; margin-top: 10px; }
    .copy-icon { float: right; cursor: pointer; color: #2563eb; font-weight: bold; }
  </style>
  <script>
    window.onload = function() {
        // Device ID Check
        let did = localStorage.getItem('trinh_hg_device_id');
        if(!did) { did = 'dev_'+Math.random().toString(36).substr(2); localStorage.setItem('trinh_hg_device_id', did); }
        document.getElementById('device-id-input').value = did;

        // Modal Logic
        const modal = document.getElementById('buy-modal');
        document.getElementById('open-buy').onclick = (e) => { e.preventDefault(); modal.classList.add('active'); };
        document.querySelector('.close-btn').onclick = () => modal.classList.remove('active');
        
        // Pricing Logic
        let selectedAmount = 0;
        document.querySelectorAll('.price-card').forEach(c => {
            c.onclick = () => {
                document.querySelectorAll('.price-card').forEach(x => x.classList.remove('selected'));
                c.classList.add('selected');
                selectedAmount = c.dataset.amount;
                document.getElementById('qr-area').classList.add('active');
                
                // Gen Syntax
                const code = 'HG' + Math.floor(Math.random() * 1000000);
                document.getElementById('bank-content').innerText = code;
                document.getElementById('syntax-display').innerText = '"' + code + '"';
            }
        });
    }
    function copyText(id) {
        const txt = document.getElementById(id).innerText;
        navigator.clipboard.writeText(txt).then(() => alert('Đã copy!'));
    }
  </script>
</head>
<body>
  <div class="login-card">
    <h2>TrinhHG Access</h2>
    <p style="font-size:13px; color:#6b7280; margin-bottom:20px;">Vui lòng nhập KEY để tiếp tục</p>
    ${errorMsg ? `<div class="notification">⚠️ ${errorMsg}</div>` : ''}
    <form method="POST">
      <input type="hidden" id="device-id-input" name="device_id">
      <input type="password" name="secret_key" placeholder="Nhập Key (VD: VIP-HG...)" required>
      <button type="submit" class="btn btn-primary">Kích Hoạt</button>
      <a href="#" id="open-buy" class="btn btn-buy btn">Mua Key</a>
    </form>
  </div>

  <div id="buy-modal" class="modal-overlay">
    <div class="modal-box">
        <button class="close-btn">×</button>
        <h3>Chọn Gói VIP</h3>
        <div class="pricing-grid">
            <div class="price-card" data-amount="15000"><b>CÁ NHÂN</b><br>15k / 1 Tuần</div>
            <div class="price-card" data-amount="40000"><b>CÁ NHÂN</b><br>40k / 1 Tháng</div>
            <div class="price-card" data-amount="30000"><b>ĐỘI NHÓM</b><br>30k / 1 Tuần</div>
            <div class="price-card" data-amount="80000"><b>ĐỘI NHÓM</b><br>80k / 1 Tháng</div>
        </div>
        
        <div id="qr-area" class="qr-section">
            <div style="font-weight:bold; color:#2563eb; margin-bottom:10px;">QUÉT MÃ ĐỂ THANH TOÁN</div>
            <a href='https://postimg.cc/CBxsGPpN' target='_blank'><img src='https://i.postimg.cc/tThvHwrL/IMG-20250818-170711.jpg' class="qr-img"></a>
            <div class="bank-info">
                <div>Chủ TK: <b>TRINH THI XUAN HUONG</b> <span class="copy-icon" onclick="copyText('acc-name')">COPY</span><span id="acc-name" style="display:none">TRINH THI XUAN HUONG</span></div>
                <div style="margin-top:5px;">STK: <b>0917678211</b> (MB Bank) <span class="copy-icon" onclick="copyText('acc-num')">COPY</span><span id="acc-num" style="display:none">0917678211</span></div>
                <div style="margin-top:5px; color:#dc2626; font-weight:bold;">Nội dung bắt buộc: <span id="syntax-display">HG...</span> <span class="copy-icon" onclick="copyText('bank-content')">COPY</span></div>
                <span id="bank-content" style="display:none"></span>
            </div>
            <button class="btn btn-success" onclick="alert('Vui lòng đợi 1-2 phút. Hệ thống sẽ gửi Key về Telegram Admin hoặc bạn có thể liên hệ trực tiếp.')">ĐÃ THANH TOÁN</button>
            <p style="font-size:11px; color:#666; margin-top:10px;">Lưu ý: Nhập đúng nội dung để nhận Key tự động.</p>
        </div>
    </div>
  </div>
</body>
</html>
  `;
}
