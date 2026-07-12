import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;
const from = process.env.RESEND_FROM_EMAIL;

const resend = apiKey ? new Resend(apiKey) : null;

type SendArgs = {
  to: string;
  subject: string;
  html: string;
};

async function send({ to, subject, html }: SendArgs) {
  if (!resend || !from) {
    console.warn(
      `[email] RESEND_API_KEY / RESEND_FROM_EMAIL not configured — skipping email to ${to}`,
    );
    return;
  }

  const { error } = await resend.emails.send({ from, to, subject, html });
  if (error) {
    throw new Error(`Failed to send email: ${error.message}`);
  }
}

export async function sendPasswordResetEmail({
  to,
  url,
}: {
  to: string;
  url: string;
}) {
  await send({
    to,
    subject: "Reset your password",
    html: `
      <p>You requested a password reset.</p>
      <p><a href="${url}">Click here to reset your password</a>.</p>
      <p>If you didn't request this, you can safely ignore this email.</p>
    `,
  });
}

export async function sendVerificationEmail({
  to,
  url,
}: {
  to: string;
  url: string;
}) {
  await send({
    to,
    subject: "Verify your email",
    html: `
      <p>Welcome! Please verify your email address.</p>
      <p><a href="${url}">Click here to verify</a>.</p>
    `,
  });
}
