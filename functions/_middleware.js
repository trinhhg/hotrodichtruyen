// === CẤU HÌNH HỆ THỐNG ===
// Bot 1: Báo cáo Admin (Login, Tiền về, Key mới)
const TG_NOTIFY_BOT_TOKEN = "8317998690:AAEJ51BLc6wp2gRAiTnM2qEyB4sXHYoN7lI"; 
// Bot 2: Log Webhook Raw (Nhận tin nhắn từ điện thoại)
const TG_PAYMENT_BOT_TOKEN = "8551019963:AAEld8A0Cibfnl2f-PUtwOvo_ab68_4Il0U"; 
const TG_ADMIN_ID = "5524168349";
const ADMIN_SECRET = "trinhhg_admin_secret_123"; 
const APP_VERSION = "2025.12.12.01";

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

  // --- 1. WEBHOOK (AUTO BANKING) ---
  if (url.pathname === "/api/webhook" && request.method === "POST") {
      try {
          const data = await request.json();
          const message = (data.message || "").toUpperCase(); 
          const title = data.title || "";
          const appName = data.app || "App";
          
          if (title.includes("HIỂN THỊ TRÊN") || message.includes("ĐANG CHẠY")) {
             return new Response(JSON.stringify({ skipped: true }));
          }

          // Gửi Log thô về Bot Payment
          context.waitUntil(sendTelegram(TG_PAYMENT_BOT_TOKEN, TG_ADMIN_ID, `📩 <b>RAW:</b> ${message}`));

          // A. Bóc tách số tiền (VD: +10,000VND)
          let amount = 0;
          const amountMatch = message.match(/([\d.,]+)\s*VND/);
          if (amountMatch) {
              amount = parseInt(amountMatch[1].replace(/[.,]/g, ''));
          }

          // B. Bóc tách Mã HG (HGxxxx)
          const codeMatch = message.match(/HG\d+/);
          
          if (codeMatch) {
              const transCode = codeMatch[0];
              const tempKey = "TEMP-" + Math.random().toString(36).substring(2, 10).toUpperCase();
              const now = Date.now();
              
              const keyData = {
                  type: "temp",
                  status: "temp", // Chờ duyệt
                  duration_seconds: 86400, // 24h dùng thử
                  activated_at: now,
                  expires_at: now + 86400000,
                  max_devices: 2,
                  devices: [],
                  paid_amount: amount, // Số tiền thực nhận
                  trans_code: transCode,
                  raw_message: message, // Lưu nội dung CK để đối chiếu
                  note: `Auto-gen: ${transCode}`
              };

              // Lưu KV
              await env.WEB1.put(tempKey, JSON.stringify(keyData));
              await env.WEB1.put(`TRANS_${transCode}`, tempKey, {expirationTtl: 3600});

              // Báo Admin (Notify Bot)
              const notifyMsg = `
💰 <b>TIỀN VỀ:</b> ${amount.toLocaleString()} VND
Mã GD: <code>${transCode}</code>
Key Tạm: <code>${tempKey}</code>
<i>Vào Admin Tool để duyệt chính thức!</i>
`;
              context.waitUntil(sendTelegram(TG_NOTIFY_BOT_TOKEN, TG_ADMIN_ID, notifyMsg));
          }

          return new Response(JSON.stringify({ success: true }));
      } catch (e) {
          return new Response(JSON.stringify({ error: e.message }), { status: 400 });
      }
  }

  // --- 2. LOGIN (LOGIC + NOTIFICATION) ---
  if (url.pathname === "/login" && request.method === "POST") {
    try {
        const formData = await request.json();
        const inputKey = (formData.secret_key || "").trim();
        const deviceId = (formData.device_id || "unknown").trim();
        const ip = request.headers.get("CF-Connecting-IP") || "Unknown";

        const keyVal = await env.WEB1.get(inputKey);
        
        if (!keyVal) {
            context.waitUntil(sendTelegram(TG_NOTIFY_BOT_TOKEN, TG_ADMIN_ID, `❌ <b>LOGIN FAIL (No Key):</b> ${inputKey} | IP: ${ip}`));
            return new Response(JSON.stringify({success: false, message: "Key không tồn tại!"}), {headers:{"Content-Type":"application/json"}});
        }

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
             context.waitUntil(sendTelegram(TG_NOTIFY_BOT_TOKEN, TG_ADMIN_ID, `⚠️ <b>LOGIN FAIL (Expired):</b> ${inputKey}`));
             return new Response(JSON.stringify({success: false, message: "Key đã hết hạn sử dụng!"}), {headers:{"Content-Type":"application/json"}});
        }

        // Check thiết bị
        let devices = keyData.devices || [];
        const existing = devices.find(d => d.id === deviceId);
        if (!existing) {
            if (devices.length >= keyData.max_devices) {
                context.waitUntil(sendTelegram(TG_NOTIFY_BOT_TOKEN, TG_ADMIN_ID, `🚫 <b>LOGIN BLOCK (Max Dev):</b> ${inputKey}`));
                return new Response(JSON.stringify({success: false, message: `Key này đã đạt giới hạn ${keyData.max_devices} thiết bị!`}), {headers:{"Content-Type":"application/json"}});
            }
            devices.push({ id: deviceId, ip: ip, ua: request.headers.get("User-Agent") });
            keyData.devices = devices;
            await env.WEB1.put(inputKey, JSON.stringify(keyData));
        }

        // Success Log
        const msg = `🚀 <b>LOGIN OK:</b> ${inputKey}\nDev: ${devices.length}/${keyData.max_devices}\nIP: ${ip}`;
        context.waitUntil(sendTelegram(TG_NOTIFY_BOT_TOKEN, TG_ADMIN_ID, msg));

        return new Response(JSON.stringify({success: true}), {
            status: 200,
            headers: { "Content-Type": "application/json", "Set-Cookie": `auth_vip=${inputKey}; Path=/; HttpOnly; Secure; Max-Age=31536000; SameSite=Lax` },
        });

    } catch (e) {
        return new Response(JSON.stringify({success: false, message: "Lỗi Server: " + e.message}), {headers:{"Content-Type":"application/json"}});
    }
  }

  // --- 3. ADMIN API: LIST TEMP KEYS ---
  if (url.pathname === "/api/admin/list-temp") {
      const secret = request.headers.get("x-admin-secret");
      if(secret !== ADMIN_SECRET) return new Response("Unauthorized", {status: 401});

      const list = await env.WEB1.list({ prefix: "TEMP-" });
      const keys = [];
      for(const k of list.keys) {
          const val = await env.WEB1.get(k.name);
          if(val) {
              const d = JSON.parse(val);
              // Lấy key chưa phải official
              if(d.status !== 'official') keys.push({ key: k.name, ...d });
          }
      }
      return new Response(JSON.stringify(keys), {headers: {"Content-Type": "application/json"}});
  }

  // --- 4. ADMIN API: UPGRADE KEY ---
  if (url.pathname === "/api/admin/upgrade" && request.method === "POST") {
      const secret = request.headers.get("x-admin-secret");
      if(secret !== ADMIN_SECRET) return new Response("Unauthorized", {status: 401});

      const body = await request.json();
      const { key, duration, devices } = body; // duration is seconds

      const val = await env.WEB1.get(key);
      if(!val) return new Response("Key not found", {status: 404});

      const data = JSON.parse(val);
      const now = Date.now();

      // Tính toán thời gian: Nếu đang dùng thử, Reset lại ngày bắt đầu là hôm nay
      // Nếu là gia hạn key cũ (VIP), cộng dồn. Ở đây xử lý duyệt TEMP -> OFFICIAL
      
      data.type = "permanent";
      data.status = "official";
      data.duration_seconds = parseInt(duration);
      data.max_devices = parseInt(devices);
      data.activated_at = now; // Reset activated time to NOW when approved
      data.expires_at = now + (data.duration_seconds * 1000);
      data.note += " [APPROVED]";

      await env.WEB1.put(key, JSON.stringify(data));
      context.waitUntil(sendTelegram(TG_NOTIFY_BOT_TOKEN, TG_ADMIN_ID, `✅ <b>APPROVED:</b> ${key}\nExp: ${new Date(data.expires_at).toLocaleDateString('vi-VN')}`));

      return new Response(JSON.stringify({ success: true }), {headers: {"Content-Type": "application/json"}});
  }

  // --- 5. LOGOUT ---
  if (url.pathname === "/logout") {
      const userKey = getCookie(request, "auth_vip");
      if(userKey) context.waitUntil(sendTelegram(TG_NOTIFY_BOT_TOKEN, TG_ADMIN_ID, `👋 <b>LOGOUT:</b> ${userKey}`));
      return new Response(null, { status: 302, headers: { "Location": "/", "Set-Cookie": `auth_vip=; Path=/; HttpOnly; Secure; Max-Age=0` } });
  }

  // --- 6. CHECK PAYMENT (POLLING) ---
  if (url.pathname === "/api/check-payment") {
      const code = url.searchParams.get("code");
      const key = await env.WEB1.get(`TRANS_${code}`);
      return new Response(JSON.stringify({ status: key ? 'success' : 'pending', key: key }), {headers: {"Content-Type": "application/json"}});
  }

  // --- 7. KEY INFO (HEARTBEAT) ---
  if (url.pathname === "/api/key-info") {
      const userKey = getCookie(request, "auth_vip");
      if(!userKey) return new Response("Unauthorized", {status: 401});
      const val = await env.WEB1.get(userKey);
      if(!val) return new Response("Not Found", {status: 404});
      const d = JSON.parse(val);
      return new Response(JSON.stringify({
          key: userKey, type: d.type, status: d.status,
          activated_at: d.activated_at, expires_at: d.expires_at,
          max_devices: d.max_devices, current_devices: (d.devices||[]).length
      }), {headers: {"Content-Type": "application/json"}});
  }

  if (url.pathname === "/api/heartbeat") {
      const userKey = getCookie(request, "auth_vip");
      if(!userKey) return new Response("No Key", {status: 401});
      const val = await env.WEB1.get(userKey);
      if(!val) return new Response("Invalid", {status: 401});
      const d = JSON.parse(val);
      if(d.expires_at && Date.now() > d.expires_at) return new Response("Expired", {status: 401});
      return new Response("OK", { status: 200, headers: { "x-app-version": APP_VERSION } });
  }

  return next();
}
