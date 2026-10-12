# Formulärmottagaren (Google Sheet + Apps Script)

The website's forms (Intresseanmälan, Kontakta oss) are sent to a small
Google Apps Script. It stores every submission as a row in a Google Sheet and
emails a notification. The code is `formular.gs` in this folder — this
folder is NOT part of the published website.

## Set it up (once, ~15 minutes)

1. **Create the sheet.** Go to sheets.google.com with the Google account that
   should own the data, and create an empty spreadsheet, e.g. "InFlow –
   anmälningar". Set **Arkiv/File → Inställningar/Settings → Tidszon** to
   Stockholm.
2. **Add the script.** In the sheet: **Tillägg/Extensions → Apps Script**.
   Delete what's in the editor, paste the whole of `formular.gs`, and save.
3. **Set your email.** At the top, change `NOTIFY_EMAIL` to the address that
   should get notifications. Save.
4. **Test it.** In the toolbar, choose the function `testaInskick` and click
   **▶ Kör/Run**. Google asks for permission the first time (the script needs
   to edit *this* sheet and send email as you) — allow it. If Google warns
   "Google hasn't verified this app", click **Avancerat/Advanced → Gå till …
   (osäkert)** — it's your own script. Afterwards there should be a
   "Meddelanden" tab with a test row, and a test email in your inbox.
5. **Publish it as a web app.** **Implementera/Deploy → Ny
   implementering/New deployment** → type (⚙) **Webbapp/Web app**:
   - *Kör som / Execute as:* **Jag / Me**
   - *Vem har åtkomst / Who has access:* **Alla / Anyone**
   → **Implementera/Deploy**, and copy the **web app URL** (ends in `/exec`).
6. **Connect the website.** Paste the URL into `FORM_ENDPOINT` at the top of
   `Hemsida/js/forms.js`, commit and push. Done.

"Anyone" only means anyone can *send* to the script (that's what the website
does). Nobody but you can see the sheet.

## Changing the script later
Edit it in the Apps Script editor (and copy the change back into
`formular.gs` here, so this copy stays up to date). Then:
**Implementera/Deploy → Hantera implementeringar/Manage deployments → ✏️ →
Version: Ny version/New version → Implementera/Deploy**. The URL stays the
same, so the website doesn't need changing.

## Switching to info@inflow.se later
Change `NOTIFY_EMAIL` in the script and deploy a new version as above.

## Adding a field to a form
1. Add the input to the HTML form (e.g. `name="allergier"`).
2. Add a line to that form's `fields` in `formular.gs`, e.g.
   `["allergier", "Allergier", false],` — the column is only created
   automatically for a brand-new tab, so also add the heading to the sheet by
   hand, in the same position.
3. Deploy a new version.

## Privacy
The sign-up notification email only says *that* a sign-up came in and for
which group — names, phone numbers and messages stay in the sheet. Keep the
sheet private (don't share it with "anyone with the link"), and delete old
rows according to the retention time in `integritetspolicy.html`.
