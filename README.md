# Nodemailer + Queue (Awon) Starter

A production-friendly starter to send 100–300 daily emails with **Nodemailer**, **connection pooling**, and a **3-concurrent queue**, while keeping deliverability in mind. It separates:
- **Recipient list** → `emails.csv`
- **HTML template** → `template.html`
- **Mailer logic** → `mailer.js`

## Features

- SMTP (Mandrill or SendGrid transactional)
- Concurrency-limited queue (default 3) with per-minute cap
- Connection pooling
- Plaintext alternative (auto-generated)
- `List-Unsubscribe` + One-Click header
- Minimal, brand-safe template with a lightweight **AWON** header (no heavy images)
- Retry with exponential backoff
- CSV recipients with `name` and `unsubscribe_url` fields
- Send logs to `send-log.json`

## Setup

1. **Install**  
   ```bash
   npm install
   ```

2. **Configure env**  
   Copy `.env.example` to `.env` and fill in your SMTP + sender details.

3. **Edit recipients**  
   Update `emails.csv` (columns: `email,name,unsubscribe_url`).

4. **Edit template**  
   Update `template.html`. Handlebars variables available:
   - `{{name}}` (falls back to “there”)
   - `{{unsubscribe_url}}`
   - `{{year}}`

5. **Run**  
   ```bash
   npm run send
   ```

## Deliverability Tips (Important)

- Use **opt-in lists only**. Never send unsolicited email.
- Set up **SPF, DKIM, DMARC** on your sending domain.
- Keep a **consistent From domain** and warm up volume gradually.
- Always include **unsubscribe** in the footer and the **List-Unsubscribe** header.
- Keep HTML lean: minimal CSS, avoid spammy words, respect a good text-to-image ratio (this template uses text brand mark to avoid image blocking).
- Track bounces/complaints via your ESP’s webhooks and remove problem addresses quickly.
- Keep bounced/complaint rate under **0.1%**; keep content relevant and expected.
- Use **REPLY-TO** that’s monitored.

## Notes on the "Awon" Brand Header

- The header is text-based (“AWON”) rather than an external image to avoid image blocking and extra requests, which helps deliverability.
- If you prefer a logo image, host a small (under ~10 KB) PNG on your domain and replace the header block with:
  ```html
  <div class="logo-wrap">
    <img src="https://yourdomain.com/awon-logo.png" alt="Awon" width="96" height="auto" style="display:block;margin:0 auto;">
  </div>
  ```
  Test deliverability; if open rates drop, switch back to the text mark.

## Provider-specific Notes

- **Mandrill (Mailchimp Transactional)**: You can use your API key as the SMTP password. Ensure domain is verified and DKIM is set in your Mandrill settings.
- **SendGrid**: Use `apikey` as the SMTP user and your API key as the password. Verify sender domain and enable DKIM.
- For tags/metadata, SMTP headers may be ignored; prefer provider-native APIs for advanced features.

## Legal & Ethical Use

Use only with **consented recipients** and comply with CAN-SPAM/GDPR/PECR. Unsolicited bulk email can violate laws and your ESP’s terms, and will harm deliverability.

---

Happy sending! ✉️
