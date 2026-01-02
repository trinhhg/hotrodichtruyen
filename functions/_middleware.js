// === CẤU HÌNH BOT TELEGRAM & ADMIN ===
const ADMIN_ID = "5524168349";

// Bot 1: Báo cáo Trạng thái (Login, Logout, Hết hạn, Limit)
const BOT_STATUS = "8317998690:AAEJ51BLc6wp2gRAiTnM2qEyB4sXHYoN7lI";

// Bot 2: Xác nhận giao dịch (Tiền về, Trả Key)
const BOT_PAYMENT = "8551019963:AAEld8A0Cibfnl2f-PUtwOvo_ab68_4Il0U";

const ADMIN_SECRET = "trinhhg_secret_2025"; // Secret key để bảo vệ Admin Tool

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, x-admin-secret",
};

// Hàm gửi tin nhắn Telegram (Chọn bot dựa trên type)
async function sendTelegram(message, type = 'status') {
  const token = type === 'payment' ? BOT_PAYMENT : BOT_STATUS;
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  
  const payload = {
    chat_id: ADMIN_ID,
    text: message,
    parse_mode: 'HTML'
  };

  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (e) {
    console.error('Tele Error:', e);
  }
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
    const url = new URL(request.url);

    // 1. WEBHOOK NGÂN HÀNG (Dùng BOT_PAYMENT)
    if (url.pathname === "/api/webhook" && request.method === "POST") {
        try {
            const data = await request.json();
            // Data mẫu từ app bank/macrodroid gửi lên: { content: "MB VC CB...", amount: 20000 }
            const content = (data.content || "").toUpperCase(); 
            const amount = data.amount || 0;
            
            // Regex tìm mã HG (VD: HG123456)
            const match = content.match(/HG\d+/);
            
            if (match) {
                const transCode = match[0];
                const tempKey = `TEMP-${Date.now().toString(36).toUpperCase()}`;
                
                // Lưu vào KV (Lưu 24h)
                await env.WEB1.put(transCode, JSON.stringify({ 
                    key: tempKey, 
                    amount: amount, 
                    status: 'pending',
                    created_at: Date.now()
                }), { expirationTtl: 86400 });

                // Gửi Bot Payment
                ctx.waitUntil(sendTelegram(
                    `💰 <b>NHẬN ĐƯỢC TIỀN!</b>\n💸 Số tiền: ${amount.toLocaleString()} VND\n📝 ND: ${content}\n🔑 Key tạm: <code>${tempKey}</code>`, 
                    'payment'
                ));
            } else {
                 // Có tiền vào nhưng không đúng cú pháp HG... vẫn báo để admin check tay
                 ctx.waitUntil(sendTelegram(
                    `⚠️ <b>GIAO DỊCH KHÔNG RÕ MÃ</b>\n💸 Số tiền: ${amount.toLocaleString()} VND\n📝 ND: ${content}`, 
                    'payment'
                ));
            }
            return new Response("OK", { headers: corsHeaders });
        } catch(e) { return new Response("Error", { status: 400, headers: corsHeaders }); }
    }

    // 2. CHECK PAYMENT (Client Polling)
    if (url.pathname === "/api/check-payment") {
        const code = url.searchParams.get("code");
        const data = await env.WEB1.get(code, { type: 'json' });
        
        if (data && data.key) {
            return new Response(JSON.stringify({ success: true, key: data.key }), { headers: corsHeaders });
        }
        return new Response(JSON.stringify({ success: false }), { headers: corsHeaders });
    }

    // 3. ADMIN: LIST TEMP KEYS
    if (url.pathname === "/api/admin/list-temp") {
        if (request.headers.get("x-admin-secret") !== ADMIN_SECRET) 
            return new Response("Unauthorized", { status: 401, headers: corsHeaders });

        // Logic demo trả về mảng rỗng (Cần dùng KV list() nếu muốn full chức năng)
        return new Response(JSON.stringify([]), { headers: corsHeaders });
    }

    // 4. ADMIN: UPGRADE KEY (Duyệt key)
    if (url.pathname === "/api/admin/upgrade" && request.method === "POST") {
        if (request.headers.get("x-admin-secret") !== ADMIN_SECRET) 
            return new Response("Unauthorized", { status: 401, headers: corsHeaders });

        const { tempKey, days, type } = await request.json();
        // Chuyển TEMP -> VIP hoặc TEAM
        const officialKey = tempKey.replace("TEMP", type === 'personal' ? "VIP" : "TEAM");
        
        // Lưu key chính thức vào KV
        await env.WEB1.put(officialKey, JSON.stringify({
            status: 'official',
            expiry: Date.now() + (days * 86400000),
            devices: [],
            max_devices: type === 'personal' ? 2 : 5
        }));

        // Báo Bot Status là đã duyệt
        ctx.waitUntil(sendTelegram(
            `✅ <b>ĐÃ DUYỆT KEY</b>\n🔑 Key: <code>${officialKey}</code>\n📅 Hạn: ${days} ngày`,
            'status'
        ));
        
        return new Response(JSON.stringify({ success: true, key: officialKey }), { headers: corsHeaders });
    }

    // 5. LOGIN / VERIFY KEY (Dùng BOT_STATUS)
    if (url.pathname === "/api/login" && request.method === "POST") {
        try {
            const { key, deviceId } = await request.json();
            const keyData = await env.WEB1.get(key, { type: 'json' });

            if (!keyData) {
                return new Response(JSON.stringify({ success: false, message: "Key không tồn tại!" }), { headers: corsHeaders });
            }

            if (keyData.expiry < Date.now()) {
                 ctx.waitUntil(sendTelegram(`❌ <b>LOGIN FAIL (Hết hạn)</b>\n🔑 Key: ${key}`, 'status'));
                 return new Response(JSON.stringify({ success: false, message: "Key đã hết hạn!" }), { headers: corsHeaders });
            }

            // Logic check thiết bị
            let devices = keyData.devices || [];
            if (!devices.includes(deviceId)) {
                if (devices.length >= (keyData.max_devices || 2)) {
                    ctx.waitUntil(sendTelegram(`🚫 <b>LOGIN BLOCKED (Max Device)</b>\n🔑 Key: ${key}`, 'status'));
                    return new Response(JSON.stringify({ success: false, message: "Quá giới hạn thiết bị!" }), { headers: corsHeaders });
                }
                devices.push(deviceId);
                keyData.devices = devices;
                await env.WEB1.put(key, JSON.stringify(keyData));
            }

            ctx.waitUntil(sendTelegram(`🚀 <b>ĐĂNG NHẬP THÀNH CÔNG</b>\n🔑 Key: ${key}\n🆔 Device: ${deviceId}`, 'status'));
            
            return new Response(JSON.stringify({ 
                success: true, 
                keyData: { 
                    status: 'Active', 
                    expiry: keyData.expiry,
                    deviceCount: devices.length,
                    maxDevices: keyData.max_devices
                } 
            }), { headers: corsHeaders });

        } catch (e) {
            return new Response(JSON.stringify({ success: false, message: "Lỗi server" }), { headers: corsHeaders });
        }
    }

    return new Response("Trịnh Hg Tools API Running...", { headers: corsHeaders });
  }
}
