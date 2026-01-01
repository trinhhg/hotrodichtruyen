// === CẤU HÌNH BOT TELEGRAM ===
const TG_BOT_TOKEN = "8551019963:AAEld8A0Cibfnl2f-PUtwOvo_ab68_4Il0U"; 
const TG_ADMIN_ID = "5524168349"; 
const APP_VERSION = "2025.12.11.02";

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // --- 1. WEBHOOK TỪ MACRODROID (BOT LOGIC) ---
  if (url.pathname === "/api/webhook" && request.method === "POST") {
      try {
          const data = await request.json();
          // MacroDroid gửi: { message: "ND: TRINH THI XUAN HUONG chuyen tien HG123456 ..." }
          const msgContent = (data.message || "").toUpperCase();
          const title = data.title || "";
          
          // Filter rác
          if (title.includes("hiển thị trên") || msgContent.includes("đang chạy")) 
             return new Response("Skipped", {status:200});

          // Detect HG code (HG + số)
          const match = msgContent.match(/HG\d+/);
          
          if (match) {
              const transCode = match[0]; // e.g., HG123456
              
              // 1. Tạo Temp Key (24h)
              const tempKey = "TEMP-" + Math.random().toString(36).substring(2, 10).toUpperCase();
              const now = Date.now();
              const keyData = {
                  type: "temp",
                  status: "temp",
                  duration_seconds: 86400, // 24h
                  activated_at: now,
                  expires_at: now + 86400000,
                  max_devices: 2, // Mặc định 2 cho an toàn
                  devices: [],
                  note: `Auto-generated via ${transCode}`
              };

              // 2. Lưu Key vào KV
              await env.WEB1.put(tempKey, JSON.stringify(keyData));

              // 3. Map Transaction -> Key để Web polling lấy được
              // Key: TRANS_HG123456, Value: VIP-XXXX
              await env.WEB1.put(`TRANS_${transCode}`, tempKey, {expirationTtl: 3600}); // Lưu mapping 1h

              // 4. Báo Admin
              const adminMsg = `
💰 <b>GIAO DỊCH THÀNH CÔNG!</b>
Code: <code>${transCode}</code>
Key Tạm: <code>${tempKey}</code>
Nội dung: ${msgContent}
`;
              await sendTelegram(TG_ADMIN_ID, adminMsg);
          }

          return new Response("Webhook Processed", {status: 200});

      } catch (e) {
          return new Response("Error: " + e.message, {status: 500});
      }
  }

  // --- 2. API CHECK PAYMENT (WEB POLLING) ---
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

  // --- 3. HEARTBEAT & VERSION CHECK ---
  if (url.pathname === "/api/heartbeat") {
      const userKey = getCookie(request, "auth_vip");
      if(!userKey) return new Response("No Key", {status: 401});
      
      const keyVal = await env.WEB1.get(userKey);
      if(!keyVal) return new Response("Invalid", {status: 401});

      const d = JSON.parse(keyVal);
      if(d.expires_at && Date.now() > d.expires_at) return new Response("Expired", {status: 401});

      return new Response("OK", {
          status: 200,
          headers: { "x-app-version": APP_VERSION }
      });
  }

  // --- 4. KEY INFO API ---
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

  // --- 5. LOGIN LOGIC ---
  if (url.pathname === "/login" && request.method === "POST") {
    try {
        const formData = await request.formData();
        const inputKey = (formData.get("secret_key") || "").trim();
        const deviceId = (formData.get("device_id") || "unknown").trim();
        
        const keyVal = await env.WEB1.get(inputKey);
        if (!keyVal) return new Response(renderErrorPage("Key không tồn tại!"), {headers:{"Content-Type":"text/html"}});

        let keyData = JSON.parse(keyVal);
        const now = Date.now();

        // Kích hoạt lần đầu nếu chưa
        if (!keyData.activated_at) {
            keyData.activated_at = now;
            keyData.expires_at = now + (keyData.duration_seconds * 1000);
            keyData.devices = [];
        }

        // Check hết hạn
        if (keyData.expires_at && now > keyData.expires_at) {
             return new Response(renderErrorPage("Key đã hết hạn!"), {headers:{"Content-Type":"text/html"}});
        }

        // Check thiết bị
        let devices = keyData.devices || [];
        const existing = devices.find(d => d.id === deviceId);
        if (!existing) {
            if (devices.length >= keyData.max_devices) {
                return new Response(renderErrorPage(`Key đã đạt giới hạn ${keyData.max_devices} thiết bị!`), {headers:{"Content-Type":"text/html"}});
            }
            devices.push({ id: deviceId, ip: request.headers.get("CF-Connecting-IP") });
            keyData.devices = devices;
            await env.WEB1.put(inputKey, JSON.stringify(keyData));
        }

        // Send Notif
        const msg = `🚀 <b>LOGIN:</b> ${inputKey} (${devices.length}/${keyData.max_devices})`;
        context.waitUntil(sendTelegram(TG_ADMIN_ID, msg));

        return new Response(null, {
            status: 302,
            headers: { "Location": "/", "Set-Cookie": `auth_vip=${inputKey}; Path=/; HttpOnly; Secure; Max-Age=31536000` },
        });

    } catch (e) {
        return new Response(renderErrorPage("Lỗi Server: " + e.message), {headers:{"Content-Type":"text/html"}});
    }
  }

  // --- 6. LOGOUT ---
  if (url.pathname === "/logout") {
      return new Response(null, { 
          status: 302, 
          headers: { "Location": "/", "Set-Cookie": `auth_vip=; Path=/; HttpOnly; Secure; Max-Age=0` } 
      });
  }

  return context.next();
}

// Helpers
async function sendTelegram(chatId, text) {
    if(!TG_BOT_TOKEN) return;
    await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ chat_id: chatId, text: text, parse_mode: "HTML" })
    });
}
function getCookie(req, name) {
    const c = req.headers.get("Cookie");
    if(!c) return null;
    const m = c.match(new RegExp(name + "=([^;]+)"));
    return m ? m[1] : null;
}
function renderErrorPage(msg) {
    return `<html><body><div class="notification" style="color:red; font-weight:bold;">${msg}</div></body></html>`;
}
