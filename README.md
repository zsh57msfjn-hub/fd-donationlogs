# Donation Card Server

Generates a donation-alert card image (two avatars, Robux amount, "donated to").
Built to replace a third-party service you didn't have credentials/access for —
this one is entirely yours.

## Architecture note: why this doesn't post to Discord itself

The obvious design would have this server upload the card straight to your
Discord webhook. That doesn't work reliably from Render (and several other
hosts) — Discord's Cloudflare has a known bug where certain hosting-provider
IPs get hit with error 1015 ("you are being rate limited") on file-upload
POSTs to discord.com, even with zero real traffic. See
[discord-api-docs#7137](https://github.com/discord/discord-api-docs/issues/7137).

So instead:

1. Roblox → this server: sends the donation data, gets back a URL to the
   generated card image.
2. Roblox → Discord directly: posts an embed pointing at that image URL —
   the same webhook path your other logs (joins, exploits, reports) already
   use successfully, since Roblox's own IP isn't affected by the block.
3. Discord fetches the image from this server itself (a GET request this
   server receives, not a POST it sends) — a different traffic pattern that
   isn't subject to that same rate limit.

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
3. Stores the image in memory for 30 minutes and responds with:

```json
{
  "success": true,
  "imageUrl": "https://your-app.onrender.com/cards/<id>.png",
  "content": "**annegwnth** donated **5 Robux** to **anne_gwnth**!"
}
```

Roblox then builds the Discord embed itself using `imageUrl` and `content`.

Every request to `/donation` must include header `x-api-key: <your API_TOKEN>`
— without it, anyone who finds your server URL could spam it into generating
cards (each one costs a little CPU/memory, and image fetches to Roblox).

## Local setup

```bash
npm install
cp .env.example .env
# fill in API_TOKEN in .env
npm start
```

Then test it:

```bash
curl -X POST http://localhost:3000/donation \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_TOKEN" \
  -d '{"DonatorId":1,"RaiserId":261,"DonatorName":"test1","RaiserName":"test2","Amount":5}'
```

The response's `imageUrl` should load a rendered card in your browser.

## Deploying to Render (free tier)

1. Push this folder to a GitHub repo.
2. On [render.com](https://render.com), **New +** → **Web Service** → connect that repo.
3. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Instance Type:** Free
4. Under **Environment**, add:
   - `API_TOKEN` — a random secret string (e.g. output of `openssl rand -hex 24`)
5. Deploy. Render gives you a URL like `https://your-app.onrender.com`.
6. In your Roblox `LogService`, point `DonationCardServer.Url` at
   `https://your-app.onrender.com/donation` with the matching `ApiKey`, and
   make sure `Webhooks.DonateLogs` is set to your actual Discord webhook —
   Roblox does the final Discord post itself (see the architecture note above).

Note: Render's free tier spins down after inactivity, so the first request
after idle time can take 20-50s to respond (cold start). If that's an issue,
a paid instance stays warm.

## Restyling the card

All the visual knobs (colors, sizes, radius, font size) live in the `CARD`
object and the draw functions near the top of `server.js` — no other file
needs to change.
