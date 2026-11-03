const nodemailer = require('nodemailer');

function getTransport() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, SMTP_FROM } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASSWORD || !SMTP_FROM || /[\r\n]/.test(SMTP_FROM)) {
    const error = new Error('Guardian invitations are unavailable until SMTP is configured.');
    error.statusCode = 503;
    throw error;
  }
  const port = Number(SMTP_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    const error = new Error('Guardian invitation email is not configured correctly.');
    error.statusCode = 503;
    throw error;
  }
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: process.env.SMTP_SECURE === 'true' || port === 465,
    disableFileAccess: true,
    disableUrlAccess: true,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD }
  });
}

async function sendGuardianInvite({ email, studentName, inviteUrl }) {
  const { SMTP_FROM } = process.env;
  const transport = getTransport();
  await transport.sendMail({
    from: SMTP_FROM,
    to: email,
    subject: 'MythoVerse guardian access invitation',
    text: `${studentName} invited you to verify a guardian relationship in MythoVerse. Open this link within 24 hours: ${inviteUrl}\n\nThe student must approve your request before you can access any student data. If you did not expect this invitation, ignore this message.`,
    html: `<p>${escapeHtml(studentName)} invited you to verify a guardian relationship in MythoVerse.</p><p><a href="${escapeHtml(inviteUrl)}">Verify your email and continue</a></p><p>This link expires in 24 hours. The student must approve your request before you can access any student data. If you did not expect this invitation, ignore this message.</p>`,
    disableFileAccess: true,
    disableUrlAccess: true
  });
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

module.exports = { sendGuardianInvite };
