import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  return transporter;
}

export async function sendOtpEmail(to, otp) {
  const t = getTransporter();
  if (!t) {
    console.log(`[DEV] OTP for ${to}: ${otp}`);
    return;
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;

  await t.sendMail({
    from: `"KashApp" <${from}>`,
    to,
    subject: 'Your KashApp Verification Code',
    html: buildEmailHtml(otp),
  });

  console.log(`[EMAIL] OTP sent to ${to}`);
}

function buildEmailHtml(otp) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
</head>
<body style="margin:0;padding:0;background-color:#f0f4ff;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:48px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 40px rgba(37,99,235,0.12);">
          <tr>
            <td align="center" style="background:#111827;padding:40px 40px 36px;">
              <div style="width:56px;height:56px;background:rgba(255,255,255,0.15);border-radius:16px;display:inline-flex;align-items:center;justify-content:center;font-size:28px;margin-bottom:16px;">&#x1F4B8;</div>
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.3px;">KashApp</h1>
              <p style="margin:6px 0 0;color:rgba(255,255,255,0.7);font-size:13px;letter-spacing:0.5px;text-transform:uppercase;">Verification Code</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px 48px 32px;">
              <p style="margin:0 0 8px;color:#111827;font-size:22px;font-weight:700;">Verify your identity</p>
              <p style="margin:0 0 32px;color:#6b7280;font-size:15px;line-height:1.65;">
                Enter this code in the KashApp to complete verification.
              </p>
              <div style="text-align:center;margin:0 0 32px;">
                <div style="display:inline-block;background:#F3F4F6;border:2px solid #D1D5DB;border-radius:14px;padding:20px 52px;font-size:40px;font-weight:900;letter-spacing:12px;color:#111827;font-family:monospace;">
                  ${otp}
                </div>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
