const express = require('express');

const router = express.Router();

const SUPPORT_EMAIL =
  process.env.SUPPORT_EMAIL ||
  process.env.BREVO_SENDER_EMAIL ||
  'support@dodaily.app';

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderPage({ title, description, content }) {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)} | DoDaily</title>
    <meta name="description" content="${escapeHtml(description)}" />
    <style>
      :root {
        color-scheme: light;
        --bg: #f4f7f4;
        --panel: #ffffff;
        --ink: #16302d;
        --muted: #56716c;
        --brand: #0d7a76;
        --brand-deep: #0b625f;
        --line: #d7e3df;
        --soft: #e9f4f2;
      }

      * {
        box-sizing: border-box;
      }

      body {
        margin: 0;
        font-family: Arial, Helvetica, sans-serif;
        background:
          radial-gradient(circle at top left, rgba(13, 122, 118, 0.12), transparent 36%),
          linear-gradient(180deg, #f8fbf9 0%, var(--bg) 100%);
        color: var(--ink);
      }

      .shell {
        width: min(920px, calc(100% - 32px));
        margin: 0 auto;
        padding: 32px 0 56px;
      }

      .hero {
        background: linear-gradient(145deg, var(--brand) 0%, var(--brand-deep) 100%);
        color: #ffffff;
        border-radius: 28px;
        padding: 28px;
        box-shadow: 0 18px 44px rgba(11, 98, 95, 0.18);
      }

      .eyebrow {
        margin: 0 0 10px;
        font-size: 13px;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        opacity: 0.82;
      }

      h1 {
        margin: 0;
        font-size: clamp(30px, 5vw, 44px);
        line-height: 1.08;
      }

      .lede {
        margin: 14px 0 0;
        max-width: 720px;
        font-size: 16px;
        line-height: 1.72;
        color: rgba(255, 255, 255, 0.9);
      }

      .panel {
        margin-top: 20px;
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 24px;
        padding: 26px;
        box-shadow: 0 10px 26px rgba(22, 48, 45, 0.06);
      }

      h2 {
        margin: 0 0 12px;
        font-size: 22px;
      }

      p,
      li {
        font-size: 16px;
        line-height: 1.7;
        color: var(--muted);
      }

      ul {
        margin: 12px 0 0;
        padding-left: 22px;
      }

      .callout {
        margin-top: 16px;
        border-radius: 18px;
        padding: 18px 20px;
        background: var(--soft);
        border: 1px solid rgba(13, 122, 118, 0.15);
      }

      .callout strong {
        color: var(--ink);
      }

      .meta {
        margin-top: 12px;
        font-size: 14px;
        color: var(--muted);
      }

      a {
        color: var(--brand);
      }
    </style>
  </head>
  <body>
    <main class="shell">
      ${content}
    </main>
  </body>
</html>`;
}

router.get('/privacy-/policy', (req, res) => {
  const html = renderPage({
    title: 'Privacy Policy',
    description: 'DoDaily privacy policy',
    content: `
      <section class="hero">
        <p class="eyebrow">DoDaily Legal</p>
        <h1>Privacy Policy</h1>
        <p class="lede">
          This Privacy Policy explains how DoDaily collects, uses, stores, and protects
          information when you use the app and related services.
        </p>
        <p class="meta">Last updated: March 30, 2026</p>
      </section>

      <section class="panel">
        <h2>Information We Collect</h2>
        <p>We may collect the information you provide directly to DoDaily, including:</p>
        <ul>
          <li>Account details such as username, display name, and email address.</li>
          <li>Planner items, reminders, notes, dates, and times you create in the app.</li>
          <li>Friend requests, sharing activity, and responses when you use social features.</li>
          <li>Basic technical and usage information needed to operate and secure the service.</li>
        </ul>
      </section>

      <section class="panel">
        <h2>How We Use Information</h2>
        <ul>
          <li>To create and maintain your account.</li>
          <li>To save, sync, and display planners, reminders, and friend activity.</li>
          <li>To send verification emails and service-related notifications.</li>
          <li>To improve reliability, security, and support for the app.</li>
        </ul>
      </section>

      <section class="panel">
        <h2>Sharing and Storage</h2>
        <p>
          We do not sell your personal information. We may use trusted service providers
          for hosting, database infrastructure, and transactional email delivery only as
          needed to run DoDaily.
        </p>
        <p>
          Information is stored only for as long as needed to provide the service,
          comply with legal requirements, resolve disputes, and enforce our policies.
        </p>
      </section>

      <section class="panel">
        <h2>Your Choices</h2>
        <p>
          You may update your display name and email address in the app. You may also
          request complete deletion of your DoDaily account and associated data.
        </p>
        <div class="callout">
          <strong>Deletion Policy:</strong> We allow complete data deletion on request.
          Once a valid deletion request is received, deletion may take up to 30 days to
          fully complete across our systems and backups.
        </div>
      </section>

      <section class="panel">
        <h2>Contact</h2>
        <p>
          For privacy questions or data requests, contact us at
          <a href="mailto:${escapeHtml(SUPPORT_EMAIL)}">${escapeHtml(SUPPORT_EMAIL)}</a>.
        </p>
      </section>
    `,
  });

  return res.status(200).type('html').send(html);
});

router.get('/account/manage', (req, res) => {
  const html = renderPage({
    title: 'Account Management',
    description: 'DoDaily account management and deletion details',
    content: `
      <section class="hero">
        <p class="eyebrow">DoDaily Support</p>
        <h1>Account Management</h1>
        <p class="lede">
          This page explains how account deletion and data removal are handled for DoDaily users.
        </p>
        <p class="meta">Last updated: March 30, 2026</p>
      </section>

      <section class="panel">
        <h2>Account Deletion</h2>
        <p>
          DoDaily allows complete deletion of your account and associated personal data.
          This includes your account profile, planners, reminders, and related friend data
          that is tied to your account, subject to operational and legal requirements.
        </p>
        <div class="callout">
          <strong>Important:</strong> Complete data deletion may take up to 30 days from
          the time a valid request is received.
        </div>
      </section>

      <section class="panel">
        <h2>How to Request Deletion</h2>
        <ul>
          <li>Send an account deletion request to <a href="mailto:${escapeHtml(SUPPORT_EMAIL)}">${escapeHtml(SUPPORT_EMAIL)}</a>.</li>
          <li>Include the username or email address connected to your DoDaily account.</li>
          <li>We may ask for additional verification before processing the request.</li>
        </ul>
      </section>

      <section class="panel">
        <h2>What Happens After a Request</h2>
        <ul>
          <li>Your request will be reviewed and queued for deletion processing.</li>
          <li>Access to some or all account features may stop once deletion begins.</li>
          <li>Some records may remain temporarily in backups or logs until normal retention periods expire.</li>
        </ul>
      </section>

      <section class="panel">
        <h2>Contact</h2>
        <p>
          For help with account access, privacy, or deletion, contact
          <a href="mailto:${escapeHtml(SUPPORT_EMAIL)}">${escapeHtml(SUPPORT_EMAIL)}</a>.
        </p>
      </section>
    `,
  });

  return res.status(200).type('html').send(html);
});

module.exports = router;
