# 🌊 TradeWave

> Ride Every Wave. Miss Nothing.

Non-custodial Telegram crypto trading bot — buy, sell & withdraw directly from Telegram. Every user gets their own AES-256-GCM encrypted on-chain wallet via Coinbase CDP.

---

## Quick Start

### 1. Prerequisites

- Node.js 18+
- Telegram bot token from [@BotFather](https://t.me/BotFather)
- [Coinbase CDP](https://portal.cdp.coinbase.com) API credentials

### 2. Install

```bash
git clone <your-repo>
cd tradewave
npm install
```

### 3. Configure

```bash
cp .env.example .env
```

Fill in `.env`:

| Variable | Where to get it |
|---|---|
| `TELEGRAM_BOT_TOKEN` | @BotFather on Telegram |
| `CDP_API_KEY_NAME` | portal.cdp.coinbase.com |
| `CDP_PRIVATE_KEY` | portal.cdp.coinbase.com |
| `WALLET_ENCRYPTION_KEY` | Generate (see below) |
| `NETWORK_ID` | `base-sepolia` for testnet |

**Generate encryption key:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 4. Run

```bash
# Development
npm run dev

# Production
npm start
```

---

## Deploy

### Railway
1. Push to GitHub
2. Connect repo in Railway
3. Add environment variables in Railway dashboard
4. Deploy — Railway auto-detects Node.js

### VPS (Docker)
```bash
mkdir data
cp .env.example .env && nano .env   # fill in values
docker compose up -d
```

### Render
- Runtime: Node
- Build command: `npm install`
- Start command: `node src/index.js`
- Add env vars in dashboard

---

## Bot Commands

| Command | Description |
|---|---|
| `/start` | Create wallet & welcome |
| `/balance` | View ETH / USDC / SOL balances |
| `/deposit` | Show deposit address |
| `/buy` | Buy crypto with USDC |
| `/sell` | Sell crypto for USDC |
| `/withdraw` | Send crypto to external wallet |
| `/portfolio` | Full portfolio overview |
| `/help` | Command list |

---

## Architecture

```
User (Telegram) → Grammy.js → Coinbase CDP SDK → Base / Ethereum
                       ↓
               SQLite (better-sqlite3)
               AES-256-GCM encrypted seeds
```

---

## Security Notes

- Wallet seeds are AES-256-GCM encrypted before storage
- The `WALLET_ENCRYPTION_KEY` must never be committed or lost
- TradeWave is non-custodial — it never holds user funds
- Start on `base-sepolia` testnet before going mainnet

---

## Extending

- Add DCA scheduler: read `src/db.js` `dca_configs` table + cron
- Add price feeds: integrate CoinGecko or Coinbase market API
- Add AI signals: call Claude API with indicator data from strategy docs
