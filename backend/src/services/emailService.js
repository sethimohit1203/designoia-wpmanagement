const nodemailer = require('nodemailer');

function getTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    throw new Error('SMTP not configured — set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in backend/.env');
  }
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

async function sendPasswordResetEmail(resetUrl) {
  const to = process.env.ADMIN_EMAIL;
  if (!to) throw new Error('ADMIN_EMAIL not configured — set it in backend/.env');
  const transport = getTransport();
  await transport.sendMail({
    from: process.env.SMTP_USER,
    to,
    subject: 'ClikixPress — Reset your dashboard password',
    text: `Reset your dashboard password: ${resetUrl}\n\nThis link expires in 15 minutes. If you didn't request this, ignore this email.`,
    html: `<p>Reset your dashboard password:</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>This link expires in 15 minutes. If you didn't request this, ignore this email.</p>`,
  });
}

module.exports = { sendPasswordResetEmail };
