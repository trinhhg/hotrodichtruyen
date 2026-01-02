// === CẤU HÌNH HỆ THỐNG ===
const TG_NOTIFY_BOT_TOKEN = "8317998690:AAEJ51BLc6wp2gRAiTnM2qEyB4sXHYoN7lI"; // Bot báo cáo admin
const TG_PAYMENT_BOT_TOKEN = "8551019963:AAEld8A0Cibfnl2f-PUtwOvo_ab68_4Il0U"; // Bot nhận tin nhắn từ điện thoại
const TG_ADMIN_ID = "5524168349";
const APP_VERSION = "2025.12.11.03";

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

  // --- 1. WEBHOOK TỪ MACRODROID (Xử lý thanh toán tự động) ---
  // MacroDroid cần cấu hình POST đến: https://domain-cua-ban.pages.dev/api/webhook
  if (url.pathname === "/api/webhook" && request.method === "POST") {
      try {
          const data = await request.json();
          const message = (data.message || "").toUpperCase();
          const title = data.title || "";
          const appName = data.app || "App";
          const time = data.time || new Date().toLocaleString("vi-VN");

          // Bỏ qua tin rác
          if (title.includes("hiển thị trên") || message.includes("đang chạy")) {
             return new Response(JSON.stringify({ skipped: true }));
          }

          // 1. Gửi thông báo về Bot Payment (để Admin theo dõi log)
          const logMsg = `🔔 <b>Giao dịch mới</b>\n📱 App: ${appName}\n💬 ND: ${message}\n⏰ ${time}`;
          context.waitUntil(sendTelegram(TG_PAYMENT_BOT_TOKEN, TG_ADMIN_ID, logMsg));

          // 2. Tự động tìm mã HG (Ví dụ: HG123456)
          const match = message.match(/HG\d+/);
          if (match) {
              const transCode = match[0];
              
              // Tạo Key Tạm (24h)
              const tempKey = "TEMP-" + Math.random().toString(36).substring(2, 10).toUpperCase();
              const now = Date.now();
              const keyData = {
                  type: "temp",
                  status: "temp",
                  duration_seconds: 86400, // 24h
                  activated_at: now,
                  expires_at: now + 86400000,
                  max_devices: 2,
                  devices: [],
                  note: `Auto-gen from Transaction ${transCode}`
              };

              // Lưu Key vào KV
              await env.WEB1.put(tempKey, JSON.stringify(keyData));
              // Map mã giao dịch sang Key để Client polling
              await env.WEB1.put(`TRANS_${transCode}`, tempKey, {expirationTtl: 3600});

              // Báo Admin (Bot Notify)
              const successMsg = `
💰 <b>THANH TOÁN THÀNH CÔNG!</b>
Mã GD: <code>${transCode}</code>
Key Tạm: <code>${tempKey}</code>
<i>Hệ thống đã cấp key tạm cho khách.</i>
`;
              context.waitUntil(sendTelegram(TG_NOTIFY_BOT_TOKEN, TG_ADMIN_ID, successMsg));
          }

          return new Response(JSON.stringify({ success: true }));

      } catch (e) {
          return new Response(JSON.stringify({ error: e.message }), { status: 400 });
      }
  }

  // --- 2. API CHECK PAYMENT (Client Polling) ---
  if (url.pathname === "/api/check-payment") {
      const code = url.searchParams.get("code"); // HGxxxx
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

  // --- 3. API HEARTBEAT (Check Auth & Version) ---
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

  // --- 4. API KEY INFO ---
  if (url.pathname === "/api/key-info") {
      const userKey = getCookie(request, "auth_vip");
      if(!userKey) return new Response("Unauthorized", {status: 401});
      const keyVal = await env.WEB1.get(userKey);
      if(!keyVal) return new Response("Not Found", {status: 404});
      
      const d = JSON.parse(keyVal);
      // Tính toán dữ liệu an toàn để trả về Client
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

  // --- 5. LOGIN LOGIC ---
  if (url.pathname === "/login" && request.method === "POST") {
    try {
        const formData = await request.json(); // Nhận JSON từ Client
        const inputKey = (formData.secret_key || "").trim();
        const deviceId = (formData.device_id || "unknown").trim();
        const ip = request.headers.get("CF-Connecting-IP") || "Unknown";

        const keyVal = await env.WEB1.get(inputKey);
        
        // Return JSON thay vì HTML để Client xử lý UI
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
             context.waitUntil(sendTelegram(TG_NOTIFY_BOT_TOKEN, TG_ADMIN_ID, `❌ <b>LOGIN FAIL:</b> Key ${inputKey} đã hết hạn.`));
             return new Response(JSON.stringify({success: false, message: "Key đã hết hạn sử dụng!"}), {headers:{"Content-Type":"application/json"}});
        }

        // Check thiết bị
        let devices = keyData.devices || [];
        const existing = devices.find(d => d.id === deviceId);
        if (!existing) {
            if (devices.length >= keyData.max_devices) {
                context.waitUntil(sendTelegram(TG_NOTIFY_BOT_TOKEN, TG_ADMIN_ID, `🚫 <b>LOGIN BLOCKED:</b> Key ${inputKey} quá giới hạn thiết bị.`));
                return new Response(JSON.stringify({success: false, message: `Key này đã đạt giới hạn ${keyData.max_devices} thiết bị!`}), {headers:{"Content-Type":"application/json"}});
            }
            devices.push({ id: deviceId, ip: ip, ua: request.headers.get("User-Agent") });
            keyData.devices = devices;
            await env.WEB1.put(inputKey, JSON.stringify(keyData));
        }

        // Thông báo Login thành công
        const msg = `
🚀 <b>ĐĂNG NHẬP THÀNH CÔNG</b>
🔑 Key: <code>${inputKey}</code>
📱 Device: ${devices.length}/${keyData.max_devices}
🌍 IP: ${ip}
`;
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

  // --- 6. LOGOUT ---
  if (url.pathname === "/logout") {
      const userKey = getCookie(request, "auth_vip");
      if(userKey) context.waitUntil(sendTelegram(TG_NOTIFY_BOT_TOKEN, TG_ADMIN_ID, `👋 <b>LOGOUT:</b> Key ${userKey}`));
      
      return new Response(null, { 
          status: 302, 
          headers: { "Location": "/", "Set-Cookie": `auth_vip=; Path=/; HttpOnly; Secure; Max-Age=0` } 
      });
  }

  // Serve static assets
  return next();
}
