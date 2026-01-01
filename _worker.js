export default {
  async fetch(request, env, ctx) {
    const TG_BOT_TOKEN = "8551019963:AAEld8A0Cibfnl2f-PUtwOvo_ab68_4Il0U";
    const ADMIN_CHAT_ID = "5524168349";

    if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });

    try {
      const data = await request.json();
      const message = data.message || ""; // Noi dung tin nhan bank
      const title = data.title || "";

      // 1. FILTER RÁC
      if (title.includes("đang hiển thị") || message.includes("đang chạy")) return new Response("Skipped");

      // 2. PARSE BANK MSG (MB BANK FORMAT)
      // Tìm mẫu: ND: HGxxxxxx (Nội dung chuyển khoản chứa HG...)
      const syntaxMatch = message.match(/HG\d+/i); // Tìm chữ HG + số
      
      let replyText = `🔔 <b>Thông báo Bank</b>\n📝 ${message}`;

      if (syntaxMatch) {
          const userSyntax = syntaxMatch[0].toUpperCase();
          
          // 3. AUTO GEN KEY (TEMP 24H)
          const tempKey = "VIP-" + userSyntax + "-" + Math.floor(Math.random()*1000);
          
          const keyData = {
              duration_seconds: 86400, // 24h
              max_devices: 1, // Temp chỉ cho 1 máy test
              activated_at: Date.now(),
              expires_at: Date.now() + 86400000,
              type: "TEMP",
              note: "AutoGen_" + userSyntax,
              devices: [],
              created_at: new Date().toISOString()
          };

          // 4. SAVE TO KV (Quan Trọng)
          // Cần bind KV 'PRO_1' vào worker này
          if (env.PRO_1) {
              await env.PRO_1.put(tempKey, JSON.stringify(keyData));
              
              replyText += `\n\n✅ <b>Đã tạo Key Tạm (24h)!</b>\n🔑 Key: <code>${tempKey}</code>\n(Key đã kích hoạt, nhập vào web dùng ngay)`;
          } else {
              replyText += `\n\n⚠️ Lỗi: Không tìm thấy KV Database (PRO_1). Không thể tạo key tự động.`;
          }
      }

      // 5. SEND TELEGRAM
      await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
              chat_id: ADMIN_CHAT_ID,
              text: replyText,
              parse_mode: "HTML"
          })
      });

      return new Response(JSON.stringify({ success: true }));

    } catch (e) {
      return new Response(JSON.stringify({ error: e.message }), { status: 400 });
    }
  },
};
