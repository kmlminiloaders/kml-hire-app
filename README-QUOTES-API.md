# KML Hire Manager — Quotes API

This repository contains the KML Hire Manager front end (GitHub Pages) and a Cloudflare Worker + D1 backend for secure customer quote links and acceptance.

## What the quote backend does

- Stores quotes in Cloudflare D1.
- Creates unguessable customer quote links.
- Sends quotes by email through Resend and SMS through Twilio.
- Records the customer's name and acceptance timestamp.
- Emails the business when a quote is accepted.
- Exposes an authenticated API for the KML app to refresh statuses and convert accepted quotes into jobs.

The app keeps its existing local records in the browser. Quote records are also saved locally so the app can associate the secure service status with the matching job. Back up app data regularly.

## Deploy the Worker

You need a Cloudflare account with Workers and D1 enabled.

1. Install Node.js and Wrangler on a computer:
   `npm install` then `npx wrangler login`.
2. Create the database:
   `npx wrangler d1 create kml-hire-db`
3. Copy the database ID returned by Cloudflare into `wrangler.toml`, replacing `REPLACE_WITH_D1_DATABASE_ID`.
4. Create the table:
   `npx wrangler d1 execute kml-hire-db --remote --file=./schema.sql`
5. Set the private admin key (make a long random value and keep it private):
   `npx wrangler secret put KML_ADMIN_KEY`
6. Configure email:
   - Verify a sending domain/address with Resend.
   - `npx wrangler secret put RESEND_API_KEY`
   - `npx wrangler secret put OWNER_EMAIL` (the email address that receives quote acceptance notifications).
   - Set `EMAIL_FROM` as a Worker secret to a sender verified in Resend, e.g. `KML Mini Loaders <quotes@your-verified-domain>`.
7. Configure SMS with a Twilio account and an SMS-capable Australian number:
   - `npx wrangler secret put TWILIO_ACCOUNT_SID`
   - `npx wrangler secret put TWILIO_AUTH_TOKEN`
   - `npx wrangler secret put TWILIO_PHONE` (use international format, e.g. +614xxxxxxxx).
8. Check `APP_ORIGIN` in `wrangler.toml` matches the origin of the live GitHub Pages app. It must be the origin only, with no page path.
9. Deploy:
   `npx wrangler deploy`

Cloudflare will show a Worker URL such as `https://kml-hire-api.<your-account>.workers.dev`.

## Connect the app

Open KML Hire Manager → Settings → Quote delivery connection.

- Quote API URL: paste the Worker URL.
- KML API key: enter the exact value used for `KML_ADMIN_KEY`.
- Save, then press **Test connection**.

To send a quote, fill in both customer email and mobile number, save the quote, then press **Send email + SMS**. The app intentionally requires both contact details because KML selected both delivery methods.

## Important before going live

- Resend and Twilio accounts, verified sending details, and billing may be required. Their usage charges are separate from GitHub and Cloudflare.
- Test with your own email and mobile first.
- Check the accepted quote page and the owner acceptance notification.
- Review and add KML's actual Terms of Hire before sending quotes to customers. The terms field is editable per quote.
- The API key is stored in the browser's local app settings. Keep the app and device private; do not share the key.
- Customer acceptance is recorded by the Worker. The app refreshes quote status while the Quotes screen is open and adds accepted quotes to Jobs. Keep the Quotes screen open or press Refresh to sync promptly.
- This is an operational record, not legal advice or an accounting system. Confirm your quote terms, deposit rules, GST treatment and recordkeeping with your adviser.
