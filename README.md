# Zeus One Authenticator (iPhone web app)

Live at **https://auth.profitharborai.com**

2-factor (TOTP) codes for iPhone, part of the Zeus One family.

- Open the address in **Safari** → Share → **Add to Home Screen**.
- Codes are encrypted on the phone (AES-256-GCM, PBKDF2-SHA256 600k) and never sent anywhere.
  This site only delivers the app's files; it has no server-side code and stores nothing.
- Scan a site's QR code, or receive accounts from Zeus One Olympus on Windows (encrypted transfer QR + code).
- Encrypted backups (`.zoauth`) work on both iPhone and Windows.

To update the app: replace the files here and bump `VERSION` in `sw.js`.
