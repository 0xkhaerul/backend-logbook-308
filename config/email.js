require("dotenv").config();
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const sendOTPEmail = async (email, otpCode, name) => {
  const mailOptions = {
    from: `"Ilman OTP Verification" <${process.env.EMAIL_USER}>`,
    to: email,
    subject: "Verifikasi Akun - Kode OTP",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Verifikasi Akun Anda</h2>
        <p>Halo ${name},</p>
        <p>Terima kasih telah mendaftar! Gunakan kode OTP berikut untuk memverifikasi akun Anda:</p>
        <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0;">
          <h1 style="color: #2196F3; font-size: 32px; margin: 0; letter-spacing: 5px;">${otpCode}</h1>
        </div>
        <p>Kode ini berlaku selama 10 menit.</p>
        <p>Jika Anda tidak melakukan pendaftaran, abaikan email ini.</p>
        <hr>
        <p style="color: #666; font-size: 12px;">Email otomatis, mohon tidak membalas.</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("OTP email sent successfully!");
    return true;
  } catch (error) {
    console.error("Error sending email:", error);
    return false;
  }
};

module.exports = { sendOTPEmail };
