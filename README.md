# Donation Card Server

Generates a donation-alert card image (two avatars, Robux amount, "donated to")
and posts it to a Discord webhook. Built to replace a third-party service you
didn't have credentials/access for — this one is entirely yours.

## What it does

`POST /donation` with a JSON body:

```json
{
  "DonatorId": 123456,
  "RaiserId": 654321,
  "DonatorName": "annegwnth",
  "RaiserName": "anne_gwnth",
  "Amount": 5
}
```

1. Looks up both avatars from Roblox's public thumbnail API.
2. Draws the card (gradient background, pink-ringed circular avatars,
   Robux icon + amount, "donated to").
3. Uploads the image straight to your Discord webhook.

Every request must include header `x-api-key: <your API_TOKEN>` — without it,
anyone who finds your server URL could spam your Discord.

## Local setup

```bash
npm install
cp .env.example .env
# fill in DISCORD_WEBHOOK_URL and API_TOKEN in .env
npm start
```

Then test it:

```bash
curl -X POST http://localhost:3000/donation \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_TOKEN" \
  -d '{"DonatorId":1,"RaiserId":261,"DonatorName":"test1","RaiserName":"test2","Amount":5}'
```

## Deploying to Render (free tier)

1. Push this folder to a new GitHub repo.
2. On [render.com](https://render.com), **New +** → **Web Service** → connect that repo.
3. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
4. Under **Environment**, add:
   - `DISCORD_WEBHOOK_URL` — your Discord webhook URL
   - `API_TOKEN` — a random secret string (e.g. output of `openssl rand -hex 24`)
5. Deploy. Render gives you a URL like `https://your-app.onrender.com`.
6. In your Roblox `LogService`, set the server URL to
   `https://your-app.onrender.com/donation` and the API key to the same
   `API_TOKEN` value (see `roblox/LogService-donation-snippet.lua` in this
   folder for the exact code already wired up).

Note: Render's free tier spins down after inactivity, so the first request
after idle time can take 20-50s to respond (cold start). If that's an issue,
a paid instance stays warm.

## Restyling the card

All the visual knobs (colors, sizes, radius, font size) live in the `CARD`
object and the draw functions near the top of `server.js` — no other file
needs to change.
