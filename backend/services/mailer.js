const logger = require('../config/logger');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  try {
    const nodemailer = require('nodemailer');
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    return transporter;
  } catch (_) {
    return null;
  }
}

async function sendPasswordReset(toEmail, resetUrl) {
  const transport = getTransporter();
  const from = process.env.SMTP_FROM || 'GeoRewards <no-reply@georewardsusa.com>';

  if (!transport) {
    // No SMTP configured — log the link so it can still be used in development
    logger.info({ msg: 'Password reset link (SMTP not configured)', toEmail, resetUrl });
    return;
  }

  await transport.sendMail({
    from,
    to: toEmail,
    subject: 'Reset your GeoRewards password',
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#fff">
        <div style="font-size:22px;font-weight:800;color:#0F1A00;margin-bottom:24px">Geo<span style="color:#8FA800">Rewards</span></div>
        <h2 style="font-size:20px;font-weight:700;color:#1a1a1a;margin:0 0 12px">Reset your password</h2>
        <p style="font-size:15px;color:#555;line-height:1.6;margin:0 0 24px">
          We received a request to reset your password. Click the button below — the link expires in <strong>1 hour</strong>.
        </p>
        <a href="${resetUrl}" style="display:inline-block;background:#B5D300;color:#0F1A00;font-weight:700;font-size:15px;padding:14px 28px;border-radius:10px;text-decoration:none;margin-bottom:24px">
          Reset password →
        </a>
        <p style="font-size:13px;color:#888;line-height:1.5;margin:0">
          If you didn't request this, you can ignore this email — your password won't change.<br>
          Link: <a href="${resetUrl}" style="color:#8FA800">${resetUrl}</a>
        </p>
      </div>
    `,
    text: `Reset your GeoRewards password\n\nClick here to reset: ${resetUrl}\n\nThis link expires in 1 hour. If you didn't request this, ignore this email.`,
  });
}

module.exports = { sendPasswordReset };
