// === CẤU HÌNH HỆ THỐNG ===
// Bot thông báo (Gửi tin nhắn cho Admin)
const TG_NOTIFY_BOT_TOKEN = "8317998690:AAEJ51BLc6wp2gRAiTnM2qEyB4sXHYoN7lI"; 
// Bot Payment (Nhận webhook từ điện thoại)
const TG_PAYMENT_BOT_TOKEN = "8551019963:AAEld8A0Cibfnl2f-PUtwOvo_ab68_4Il0U"; 
const TG_ADMIN_ID = "5524168349";
// Mật khẩu để truy cập Admin Tool (Header: x-admin-secret)
const ADMIN_SECRET = "trinhhg_admin_secret_123"; 
const APP_VERSION = "2025.12.11.05";

export async function onRequest(context) {
  const { request, env, next } = context;
  const url = new URL(request.url);

  // --- HELPERS ---
  async function sendTelegram(token, chatId, msg) {
      if(!token) return;
      try {
          await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
              method: 'POST',
              headers: {'Content-Type': 'application/json'},
              body: JSON.stringify({ chat_id: chatId, text: msg, parse_mode: "HTML" })
          });
      } catch(e) { console.error("Tele Error:", e); }
  }

  function getCookie(req, name) {
      const c = req.headers.get("Cookie");
      if(!c) return null;
      const m = c.match(new RegExp(name + "=([^;]+)"));
      return m ? m[1] : null;
  }

  // --- 1. WEBHOOK (XỬ LÝ THANH TOÁN TỪ MACRODROID) ---
  if (url.pathname === "/api/webhook" && request.method === "POST") {
      try {
          const data = await request.json();
          // Chuẩn hóa dữ liệu
          const message = (data.message || "").toUpperCase(); 
          const title = data.title || "";
          
          // Bỏ qua tin rác hệ thống
          if (title.includes("HIỂN THỊ TRÊN") || message.includes("ĐANG CHẠY")) {
             return new Response(JSON.stringify({ skipped: true }));
          }

          // A. Bóc tách số tiền (VD: +10,000VND hoặc 10.000 VND)
          let amount = 0;
          // Regex tìm chuỗi số đứng trước chữ VND
          const amountMatch = message.match(/([\d.,]+)\s*VND/);
          if (amountMatch) {
              // Xóa dấu chấm/phẩy để lấy số nguyên
              amount = parseInt(amountMatch[1].replace(/[.,]/g, ''));
          }

          // B. Bóc tách Mã Giao Dịch (HGxxxx)
          const codeMatch = message.match(/HG\d+/);
          
          if (codeMatch) {
              const transCode = codeMatch[0];
              
              // Tạo Key Tạm (24h)
              const tempKey = "TEMP-" + Math.random().toString(36).substring(2, 10).toUpperCase();
              const now = Date.now();
              
              const keyData = {
                  type: "temp",
                  status: "temp",
                  duration_seconds: 86400, // 24h chờ duyệt
                  activated_at: now,
                  expires_at: now + 86400000,
                  max_devices: 2,
                  devices: [],
                  paid_amount: amount, // Lưu số tiền khách chuyển để Admin check
                  trans_code: transCode,
                  note: `Auto-gen: ${transCode} | Paid: ${amount}`
              };

              // Lưu vào KV (WEB1)
              await env.WEB1.put(tempKey, JSON.stringify(keyData));
              // Map mã giao dịch -> Key để Client polling
              await env.WEB1.put(`TRANS_${transCode}`, tempKey, {expirationTtl: 3600});

              // Báo Admin qua Bot Notify
              const notifyMsg = `
💰 <b>GIAO DỊCH MỚI!</b>
Mã GD: <code>${transCode}</code>
Số tiền: <b>${amount.toLocaleString()} VND</b>
Key Tạm: <code>${tempKey}</code>
<i>Vui lòng vào Admin Tool để duyệt Key chính thức.</i>
`;
              context.waitUntil(sendTelegram(TG_NOTIFY_BOT_TOKEN, TG_ADMIN_ID, notifyMsg));
          } else {
              // Log tin nhắn không khớp mã để debug
              // context.waitUntil(sendTelegram(TG_PAYMENT_BOT_TOKEN, TG_ADMIN_ID, `⚠️ Unmatched: ${message}`));
          }

          return new Response(JSON.stringify({ success: true }));

      } catch (e) {
          return new Response(JSON.stringify({ error: e.message }), { status: 400 });
      }
  }

  // --- 2. ADMIN API: LIST TEMP KEYS ---
  if (url.pathname === "/api/admin/list-temp") {
      const secret = request.headers.get("x-admin-secret");
      if(secret !== ADMIN_SECRET) return new Response("Unauthorized", {status: 401});

      const list = await env.WEB1.list({ prefix: "TEMP-" });
      const keys = [];
      for(const k of list.keys) {
          const val = await env.WEB1.get(k.name);
          if(val) {
              const d = JSON.parse(val);
              // Chỉ lấy key còn hạn temp (hoặc chưa duyệt)
              keys.push({ key: k.name, ...d });
          }
      }
      return new Response(JSON.stringify(keys), {headers: {"Content-Type": "application/json"}});
  }

  // --- 3. ADMIN API: UPGRADE KEY (DUYỆT KEY) ---
  if (url.pathname === "/api/admin/upgrade" && request.method === "POST") {
      const secret = request.headers.get("x-admin-secret");
      if(secret !== ADMIN_SECRET) return new Response("Unauthorized", {status: 401});

      const body = await request.json();
      const { key, duration, devices } = body;

      const val = await env.WEB1.get(key);
      if(!val) return new Response("Key not found", {status: 404});

      const data = JSON.parse(val);
      const now = Date.now();

      // Cập nhật thông tin thành Official
      data.type = "permanent";
      data.status = "official";
      data.duration_seconds = parseInt(duration);
      data.max_devices = parseInt(devices);
      data.activated_at = now;
      data.expires_at = now + (data.duration_seconds * 1000);
      data.note += " [APPROVED]";

      // Lưu lại (Giữ nguyên tên key TEMP- để khách không phải login lại)
      await env.WEB1.put(key, JSON.stringify(data));

      // Gửi thông báo cho Admin biết đã duyệt xong
      context.waitUntil(sendTelegram(TG_NOTIFY_BOT_TOKEN, TG_ADMIN_ID, `✅ <b>ĐÃ DUYỆT KEY:</b> ${key}`));

      return new Response(JSON.stringify({ success: true }), {headers: {"Content-Type": "application/json"}});
  }

  // --- 4. CHECK PAYMENT (CLIENT POLLING) ---
  if (url.pathname === "/api/check-payment") {
      const code = url.searchParams.get("code");
      if(!code) return new Response("Missing code", {status: 400});

      const key = await env.WEB1.get(`TRANS_${code}`);
      if(key) {
          return new Response(JSON.stringify({ status: 'success', key: key }), {
              headers: { "Content-Type": "application/json" }
          });
      }
      return new Response(JSON.stringify({ status: 'pending' }), {
          headers: { "Content-Type": "application/json" }
      });
  }

  // --- 5. HEARTBEAT & VERSION CHECK ---
  if (url.pathname === "/api/heartbeat") {
      const userKey = getCookie(request, "auth_vip");
      if(!userKey) return new Response("No Key", {status: 401});
      
      const keyVal = await env.WEB1.get(userKey);
      if(!keyVal) return new Response("Invalid Key", {status: 401});

      try {
          const d = JSON.parse(keyVal);
          if(d.expires_at && Date.now() > d.expires_at) {
              return new Response("Expired", {status: 401});
          }
          return new Response("OK", { status: 200, headers: { "x-app-version": APP_VERSION } });
      } catch(e) { return new Response("Error", {status: 401}); }
  }

  // --- 6. API KEY INFO (Cho Sidebar) ---
  if (url.pathname === "/api/key-info") {
      const userKey = getCookie(request, "auth_vip");
      if(!userKey) return new Response("Unauthorized", {status: 401});
      const keyVal = await env.WEB1.get(userKey);
      if(!keyVal) return new Response("Not Found", {status: 404});
      
      const d = JSON.parse(keyVal);
      const safeData = {
          key: userKey,
          type: d.type || 'temp',
          status: d.status || 'temp',
          activated_at: d.activated_at,
          expires_at: d.expires_at,
          max_devices: d.max_devices,
          current_devices: (d.devices || []).length
      };
      return new Response(JSON.stringify(safeData), {headers: {"Content-Type": "application/json"}});
  }

  // --- 7. LOGIN LOGIC ---
  if (url.pathname === "/login" && request.method === "POST") {
    try {
        const formData = await request.json();
        const inputKey = (formData.secret_key || "").trim();
        const deviceId = (formData.device_id || "unknown").trim();
        const ip = request.headers.get("CF-Connecting-IP") || "Unknown";

        const keyVal = await env.WEB1.get(inputKey);
        
        if (!keyVal) return new Response(JSON.stringify({success: false, message: "Key không tồn tại!"}), {headers:{"Content-Type":"application/json"}});

        let keyData = JSON.parse(keyVal);
        const now = Date.now();

        // Kích hoạt lần đầu
        if (!keyData.activated_at) {
            keyData.activated_at = now;
            keyData.expires_at = now + (keyData.duration_seconds * 1000);
            keyData.devices = [];
        }

        // Check hết hạn
        if (keyData.expires_at && now > keyData.expires_at) {
             return new Response(JSON.stringify({success: false, message: "Key đã hết hạn sử dụng!"}), {headers:{"Content-Type":"application/json"}});
        }

        // Check thiết bị
        let devices = keyData.devices || [];
        const existing = devices.find(d => d.id === deviceId);
        if (!existing) {
            if (devices.length >= keyData.max_devices) {
                return new Response(JSON.stringify({success: false, message: `Key này đã đạt giới hạn ${keyData.max_devices} thiết bị!`}), {headers:{"Content-Type":"application/json"}});
            }
            devices.push({ id: deviceId, ip: ip, ua: request.headers.get("User-Agent") });
            keyData.devices = devices;
            await env.WEB1.put(inputKey, JSON.stringify(keyData));
        }

        // Thông báo Login
        const msg = `🚀 <b>LOGIN:</b> ${inputKey}\nDev: ${devices.length}/${keyData.max_devices}`;
        context.waitUntil(sendTelegram(TG_NOTIFY_BOT_TOKEN, TG_ADMIN_ID, msg));

        return new Response(JSON.stringify({success: true}), {
            status: 200,
            headers: { 
                "Content-Type": "application/json",
                "Set-Cookie": `auth_vip=${inputKey}; Path=/; HttpOnly; Secure; Max-Age=31536000; SameSite=Lax` 
            },
        });

    } catch (e) {
        return new Response(JSON.stringify({success: false, message: "Lỗi Server: " + e.message}), {headers:{"Content-Type":"application/json"}});
    }
  }

  // --- 8. LOGOUT ---
  if (url.pathname === "/logout") {
      return new Response(null, { 
          status: 302, 
          headers: { "Location": "/", "Set-Cookie": `auth_vip=; Path=/; HttpOnly; Secure; Max-Age=0` } 
      });
  }

  return next();
}
