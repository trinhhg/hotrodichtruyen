// Cấu hình ID
const ADMIN_ID = '524168349';

// Bot 1: Báo cáo Trạng thái (Login, Logout, Hết hạn, Limit)
const BOT_STATUS = '8317998690:AAEJ51BLc6wp2gRAiTnM2qEyB4sXHYoN7lI';

// Bot 2: Thanh toán & Giao dịch (Tiền về, Trả Key)
const BOT_PAYMENT = '8551019963:AAEld8A0Cibfnl2f-PUtwOvo_ab68_4Il0U';

// Hàm gửi tin nhắn Telegram
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
    // 1. Handle CORS for Local Admin Tool & Web App
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, x-admin-secret",
        },
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // 2. Logic Webhook (Ngân hàng gọi vào đây khi có tiền) - Dùng BOT_PAYMENT
    if (path === '/webhook-bank') {
        try {
            const data = await request.json();
            const content = data.content || ""; // Nội dung CK: HG1234...
            const amount = data.amount || 0;
            
            // Regex bóc tách mã giao dịch
            const matchCode = content.match(/HG\d+/);
            if (matchCode) {
                const transCode = matchCode[0];
                const key = `TEMP-${Date.now().toString(36).toUpperCase()}`; // Tạo key tạm
                
                // Lưu vào KV: Mapping HG... -> Key
                await env.WEB1.put(transCode, JSON.stringify({ key, amount, status: 'pending' }), { expirationTtl: 3600 });
                
                // Báo về Tele Payment
                await sendTelegram(
                    `💰 <b>NHẬN ĐƯỢC TIỀN!</b>\n💸 Số tiền: ${amount.toLocaleString()} VND\n📝 ND: ${content}\n🔑 Key tạm: ${key}`, 
                    'payment'
                );
                
                return new Response("OK");
            }
        } catch(e) { return new Response("Error", { status: 500 }); }
    }

    // 3. Logic Check Payment (Client polling) - Client hỏi xem HG... có key chưa
    if (path === '/check-payment') {
        const { transCode } = await request.json();
        const data = await env.WEB1.get(transCode, { type: 'json' });
        if (data && data.key) {
             return new Response(JSON.stringify({ success: true, key: data.key }), { headers: { "Access-Control-Allow-Origin": "*" } });
        }
        return new Response(JSON.stringify({ success: false }), { headers: { "Access-Control-Allow-Origin": "*" } });
    }

    // 4. Logic Login / Verify Key - Dùng BOT_STATUS
    if (path === '/verify-key') {
        const { key, deviceId, ip } = await request.json();
        // Giả lập logic check key từ KV
        // const keyData = await env.WEB1.get(key, {type: 'json'});
        
        // Demo phản hồi
        if (key.startsWith('VIP')) {
             await sendTelegram(
                `🚀 <b>ĐĂNG NHẬP THÀNH CÔNG!</b>\n🔑 Key: ${key}\n🌍 IP: ${ip}\n🆔 Device: ${deviceId}`, 
                'status'
            );
            return new Response(JSON.stringify({ valid: true, type: 'vip' }), { headers: { "Access-Control-Allow-Origin": "*" } });
        } else {
            await sendTelegram(
                `❌ <b>ĐĂNG NHẬP THẤT BẠI</b>\n🔑 Key: ${key}\n🌍 IP: ${ip}`, 
                'status'
            );
            return new Response(JSON.stringify({ valid: false }), { headers: { "Access-Control-Allow-Origin": "*" } });
        }
    }

    // 5. Logic Logout - Dùng BOT_STATUS
    if (path === '/logout-report') {
        const { key, ip } = await request.json();
        await sendTelegram(
            `🚪 <b>BÁO CÁO ĐĂNG XUẤT</b>\n🔑 Key: ${key}\n🌍 IP: ${ip}`, 
            'status'
        );
        return new Response("OK", { headers: { "Access-Control-Allow-Origin": "*" } });
    }

    return new Response("Server Running", { headers: { "Access-Control-Allow-Origin": "*" } });
  },
};
