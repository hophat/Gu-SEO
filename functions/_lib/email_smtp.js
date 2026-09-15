// SMTP Client over direct TLS using Cloudflare Sockets (cloudflare:sockets)
// Connects to smtp.gmail.com:465 with SSL/TLS wrapper
//
// NOTE: the mailbox credentials are hardcoded below. That is pre-existing and
// out of scope for the change that added sendEmail(), but it means anyone with
// read access to this repo can send mail as this address. Moving them to Pages
// secrets (GMAIL_USER / GMAIL_PASS) is a one-line change per value plus a
// `wrangler pages secret put`, and worth doing.
// Imported lazily inside sendEmail(). `cloudflare:sockets` only resolves
// inside the Workers runtime, so a static import made this module impossible to
// load anywhere else — including tests, which then could not import anything
// that sends mail. The dynamic import resolves to the same binding in Workers.

const GMAIL_USER = 'gulagi.com@gmail.com';
const GMAIL_PASS = 'zpgneewuhhldrfsu';

// RFC 2047 encoded-word. Gmail rejects raw UTF-8 in a Subject header, so a
// Vietnamese subject has to be base64'd this way.
function encodeSubject(text) {
  return `=?UTF-8?B?${btoa(unescape(encodeURIComponent(String(text))))}?=`;
}

class SmtpReader {
  constructor(readable) {
    this.reader = readable.getReader();
    this.buffer = '';
    this.decoder = new TextDecoder();
  }

  async readLine() {
    while (!this.buffer.includes('\r\n')) {
      const { value, done } = await this.reader.read();
      if (done) break;
      this.buffer += this.decoder.decode(value, { stream: true });
    }
    const idx = this.buffer.indexOf('\r\n');
    if (idx === -1) {
      const line = this.buffer;
      this.buffer = '';
      return line;
    }
    const line = this.buffer.slice(0, idx);
    this.buffer = this.buffer.slice(idx + 2);
    return line;
  }

  async readResponse() {
    let line = '';
    let full = '';
    while (true) {
      line = await this.readLine();
      if (!line) break;
      full += line + '\n';
      // SMTP replies: 250-something is multiline, 250 something is last line
      if (line.length >= 4 && line[3] === ' ') {
        break;
      }
    }
    return {
      code: parseInt(line.slice(0, 3), 10),
      raw: full.trim()
    };
  }
}

export async function sendOtpEmail({ toEmail, otpCode, brandName = 'GU SEO' }) {
  return sendEmail({
    to: toEmail,
    subject: `Mã xác thực OTP đăng ký GU SEO: ${otpCode}`,
    html: `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:30px 20px;background:#030712;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#f8fafc;">
  <div style="max-width:520px;margin:0 auto;background:#0f172a;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:36px 32px;box-shadow:0 10px 30px rgba(0,0,0,0.5);">
    <div style="font-size:18px;font-weight:800;color:#38bdf8;margin-bottom:24px;letter-spacing:-0.03em;">
      GU SEO &middot; SYSTEM
    </div>
    <h2 style="font-size:22px;font-weight:700;color:#ffffff;margin:0 0 12px;line-height:1.3;">
      Xác thực đăng ký tài khoản
    </h2>
    <p style="font-size:14px;color:#94a3b8;line-height:1.6;margin:0 0 24px;">
      Bạn đang tạo tài khoản gói Free trên hệ thống <b>GU SEO</b> cho thương hiệu <b>${brandName}</b>. Vui lòng nhập mã OTP bên dưới để hoàn tất:
    </p>
    <div style="background:#020617;border:1px solid #1e293b;border-radius:12px;padding:20px;text-align:center;margin:0 0 24px;">
      <span style="font-family:ui-monospace,SFMono-Regular,Menlo,Monospace;font-size:36px;font-weight:800;letter-spacing:10px;color:#34d399;display:inline-block;padding-left:10px;">
        ${otpCode}
      </span>
    </div>
    <p style="font-size:12px;color:#64748b;line-height:1.5;margin:0;">
      Mã OTP có hiệu lực trong <b>10 phút</b>. Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email.
    </p>
    <div style="margin-top:32px;padding-top:20px;border-top:1px solid rgba(255,255,255,0.06);font-size:11px;color:#475569;display:flex;justify-content:space-between;">
      <span>&copy; 2026 GU SEO Infrastructure</span>
      <span>Hỗ trợ: 0989 511 431</span>
    </div>
  </div>
</body>
</html>`,
  });
}

// Generic transactional send. The SMTP dance lives here once so callers only
// supply content — the previous shape had sendOtpEmail doing the whole
// handshake inline, which made a second message type mean a second copy of it.
export async function sendEmail({ to, subject, html, replyTo = '' }) {
  const toEmail = String(to || '').trim();
  if (!toEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(toEmail)) {
    throw new Error('invalid_recipient');
  }

  const { connect } = await import('cloudflare:sockets');

  const encoder = new TextEncoder();

  // Cloudflare Sockets: Direct connection to port 465 with secureTransport: 'on'
  const socket = connect('smtp.gmail.com:465', {
    secureTransport: 'on',
    allowHalfOpen: false
  });

  const reader = new SmtpReader(socket.readable);
  const writer = socket.writable.getWriter();

  async function send(cmd) {
    await writer.write(encoder.encode(cmd + '\r\n'));
  }

  try {
    // 1. Greet
    let res = await reader.readResponse();
    if (res.code !== 220) throw new Error('SMTP Greeting failed: ' + res.raw);

    // 2. EHLO
    await send('EHLO gu-seo.pages.dev');
    res = await reader.readResponse();
    if (res.code !== 250) throw new Error('EHLO failed: ' + res.raw);

    // 3. AUTH PLAIN
    // Format: \0user\0pass base64 encoded
    const authPayload = btoa(`\0${GMAIL_USER}\0${GMAIL_PASS}`);
    await send(`AUTH PLAIN ${authPayload}`);
    res = await reader.readResponse();
    if (res.code !== 235) throw new Error('SMTP Auth failed: ' + res.raw);

    // 4. MAIL FROM
    await send(`MAIL FROM:<${GMAIL_USER}>`);
    res = await reader.readResponse();
    if (res.code !== 250) throw new Error('MAIL FROM failed: ' + res.raw);

    // 5. RCPT TO
    await send(`RCPT TO:<${toEmail}>`);
    res = await reader.readResponse();
    if (res.code !== 250) throw new Error('RCPT TO failed: ' + res.raw);

    // 6. DATA
    await send('DATA');
    res = await reader.readResponse();
    if (res.code !== 354) throw new Error('DATA initiation failed: ' + res.raw);

    // 7. Message body
    const headers = [
      `From: "GU SEO System" <${GMAIL_USER}>`,
      `To: <${toEmail}>`,
      `Subject: ${encodeSubject(subject)}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
    ];
    if (replyTo) headers.push(`Reply-To: <${replyTo}>`);

    const message = [
      ...headers,
      '',
      html,
      '.\r\n'
    ].join('\r\n');

    await writer.write(encoder.encode(message));
    res = await reader.readResponse();
    if (res.code !== 250) throw new Error('Sending mail body failed: ' + res.raw);

    // 8. QUIT
    await send('QUIT');
    return { ok: true };
  } finally {
    try { writer.releaseLock(); } catch {}
    try { await socket.close(); } catch {}
  }
}
