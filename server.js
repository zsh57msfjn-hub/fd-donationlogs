// Donation card server
//
// Receives a donation event from Roblox, generates a card image
// (two avatars, Robux amount, "donated to"), and posts it to a
// Discord webhook. Replaces a third-party service the game owner
// did not control/have credentials for.

const path = require('path');
const express = require('express');
const { createCanvas, GlobalFonts, loadImage } = require('@napi-rs/canvas');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Shared secret Roblox must send in the `x-api-key` header.
// If left unset, the token check is skipped (NOT recommended in production —
// set API_TOKEN as an env var on Render so randoms can't spam your webhook).
const API_TOKEN = process.env.API_TOKEN || '';

// Your Discord webhook URL. Set this as an env var on Render — never commit it.
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';

if (!DISCORD_WEBHOOK_URL) {
  console.warn('[startup] WARNING: DISCORD_WEBHOOK_URL is not set. /donation will fail until it is.');
}
if (!API_TOKEN) {
  console.warn('[startup] WARNING: API_TOKEN is not set. The /donation endpoint is UNAUTHENTICATED.');
}

GlobalFonts.registerFromPath(path.join(__dirname, 'assets', 'ArchivoBlack-Regular.ttf'), 'Archivo Black');

// ---- Card design constants (tweak these to restyle the card) ----

const CARD = {
  width: 2000,
  height: 500,
  bgTop: '#1c1d26',
  bgBottom: '#3a0e30',
  ringColor: '#ff2196',
  textWhite: '#ffffff',
  avatarRadius: 150,
  ringWidth: 10,
};

// ---- Helpers ----

function avatarThumbnailApiUrl(userId) {
  return `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${encodeURIComponent(
    userId
  )}&size=420x420&format=Png&isCircular=false`;
}

async function fetchAvatarImageUrl(userId) {
  const res = await fetch(avatarThumbnailApiUrl(userId));
  if (!res.ok) throw new Error(`Thumbnail API returned ${res.status} for user ${userId}`);
  const json = await res.json();
  const imageUrl = json?.data?.[0]?.imageUrl;
  if (!imageUrl) throw new Error(`No thumbnail image URL for user ${userId}`);
  return imageUrl;
}

async function loadImageBuffer(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download image (${res.status}): ${url}`);
  const arrayBuffer = await res.arrayBuffer();
  return loadImage(Buffer.from(arrayBuffer));
}

function drawCircularAvatar(ctx, image, centerX, centerY, radius) {
  ctx.save();

  // Pink ring behind the avatar
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius + CARD.ringWidth, 0, Math.PI * 2);
  ctx.fillStyle = CARD.ringColor;
  ctx.fill();

  // Clip to circle and draw the avatar (or a placeholder if it failed to load)
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  if (image) {
    ctx.drawImage(image, centerX - radius, centerY - radius, radius * 2, radius * 2);
  } else {
    ctx.fillStyle = '#3a3a44';
    ctx.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
  }

  ctx.restore();
}

function drawOutlinedText(ctx, text, x, y, { font, fill, strokeWidth = 8, align = 'center' }) {
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.lineWidth = strokeWidth;
  ctx.strokeStyle = '#000000';
  ctx.fillStyle = fill;
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
}

function drawRobuxIcon(ctx, centerX, centerY, size) {
  ctx.save();
  ctx.translate(centerX, centerY);

  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 2;
    const x = size * Math.cos(angle);
    const y = size * Math.sin(angle);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.lineWidth = size * 0.22;
  ctx.strokeStyle = CARD.ringColor;
  ctx.stroke();

  const sq = size * 0.55;
  ctx.fillStyle = CARD.ringColor;
  ctx.fillRect(-sq / 2, -sq / 2, sq, sq);

  ctx.restore();
}

function formatAmount(amount) {
  const n = Number(amount);
  if (Number.isNaN(n)) return String(amount);
  return n.toLocaleString('en-US');
}

async function generateDonationCard({ donatorName, donatorAvatarUrl, raiserName, raiserAvatarUrl, amount }) {
  const canvas = createCanvas(CARD.width, CARD.height);
  const ctx = canvas.getContext('2d');

  // Background gradient
  const gradient = ctx.createLinearGradient(0, 0, 0, CARD.height);
  gradient.addColorStop(0, CARD.bgTop);
  gradient.addColorStop(1, CARD.bgBottom);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, CARD.width, CARD.height);

  const leftX = CARD.width * 0.2;
  const rightX = CARD.width * 0.8;
  const avatarY = CARD.height * 0.42;

  const [donatorImg, raiserImg] = await Promise.all([
    donatorAvatarUrl ? loadImageBuffer(donatorAvatarUrl).catch(() => null) : Promise.resolve(null),
    raiserAvatarUrl ? loadImageBuffer(raiserAvatarUrl).catch(() => null) : Promise.resolve(null),
  ]);

  drawCircularAvatar(ctx, donatorImg, leftX, avatarY, CARD.avatarRadius);
  drawCircularAvatar(ctx, raiserImg, rightX, avatarY, CARD.avatarRadius);

  drawOutlinedText(ctx, `@${donatorName}`, leftX, avatarY + CARD.avatarRadius + 75, {
    font: '54px "Archivo Black"',
    fill: CARD.textWhite,
  });
  drawOutlinedText(ctx, `@${raiserName}`, rightX, avatarY + CARD.avatarRadius + 75, {
    font: '54px "Archivo Black"',
    fill: CARD.textWhite,
  });

  // Center: Robux icon + amount, then "donated to"
  const centerX = CARD.width / 2;
  const amountText = formatAmount(amount);

  ctx.font = '88px "Archivo Black"';
  const amountWidth = ctx.measureText(amountText).width;
  const iconSize = 46;
  const groupWidth = amountWidth + iconSize * 2 + 24;

  drawRobuxIcon(ctx, centerX - groupWidth / 2 + iconSize, 130, iconSize);
  drawOutlinedText(ctx, amountText, centerX - groupWidth / 2 + iconSize * 2 + 24, 165, {
    font: '88px "Archivo Black"',
    fill: CARD.ringColor,
    align: 'left',
    strokeWidth: 6,
  });

  drawOutlinedText(ctx, 'donated to', centerX, 285, {
    font: '82px "Archivo Black"',
    fill: CARD.textWhite,
    strokeWidth: 7,
  });

  return canvas.toBuffer('image/png');
}

// ---- Route ----

app.post('/donation', async (req, res) => {
  try {
    if (API_TOKEN) {
      const provided = req.get('x-api-key');
      if (provided !== API_TOKEN) {
        return res.status(401).json({ success: false, error: 'Invalid or missing API token' });
      }
    }

    const { DonatorId, RaiserId, DonatorName, RaiserName, Amount } = req.body || {};
    if (!DonatorId || !RaiserId || !DonatorName || !RaiserName || Amount === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing one of DonatorId, RaiserId, DonatorName, RaiserName, Amount',
      });
    }

    const [donatorAvatarUrl, raiserAvatarUrl] = await Promise.all([
      fetchAvatarImageUrl(DonatorId).catch((err) => {
        console.error('donator avatar lookup failed:', err.message);
        return null;
      }),
      fetchAvatarImageUrl(RaiserId).catch((err) => {
        console.error('raiser avatar lookup failed:', err.message);
        return null;
      }),
    ]);

    const imageBuffer = await generateDonationCard({
      donatorName: DonatorName,
      donatorAvatarUrl,
      raiserName: RaiserName,
      raiserAvatarUrl,
      amount: Amount,
    });

    if (!DISCORD_WEBHOOK_URL) {
      return res.status(500).json({ success: false, error: 'Server has no DISCORD_WEBHOOK_URL configured' });
    }

    const form = new FormData();
    form.append('content', `**${DonatorName}** donated **${formatAmount(Amount)} Robux** to **${RaiserName}**!`);
    form.append('file', new Blob([imageBuffer], { type: 'image/png' }), 'donation.png');

    const discordRes = await fetch(DISCORD_WEBHOOK_URL, { method: 'POST', body: form });

    if (!discordRes.ok) {
      const errText = await discordRes.text();
      console.error('Discord post failed:', discordRes.status, errText);
      return res.status(502).json({ success: false, error: 'Failed to post to Discord', details: errText });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('Error handling /donation:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => console.log(`Donation card server listening on port ${PORT}`));
