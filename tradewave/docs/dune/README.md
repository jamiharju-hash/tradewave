# TradeWave Dune Market Analytics

This folder contains ready-to-use Dune SQL templates for collecting market data around the TradeWave Base deployment.

## Files

- `market-data-queries.sql` — complete query pack for market dashboards and exports.

## Recommended Dune parameters

Use these parameters in Dune queries:

| Parameter | Example | Purpose |
|---|---:|---|
| `chain` | `base` | Target blockchain for cross-chain Dune tables. |
| `lookback_days` | `90` | Rolling window for market data. |
| `wallet_address` | `0x...` | User, treasury or monitored wallet. |
| `token_symbol` | `WETH` | Token used in OHLCV query. |
| `min_trade_usd` | `100000` | Whale trade threshold. |

## Dashboard structure

### 1. Market Overview

Use:

- `01. Daily DEX market overview by chain`
- `02. Hourly DEX volume and active traders`
- `20. Full daily market snapshot table for export/API usage`

Suggested visualizations:

- Daily DEX volume line chart
- Active traders line chart
- Average trade size KPI
- Daily transaction count KPI

### 2. ETH / USDC Trading Market

Use:

- `05. ETH / USDC market volume on DEXes`
- `06. DEX buy/sell imbalance for ETH/WETH vs USDC`
- `07. Token price OHLCV from DEX trades`

Suggested visualizations:

- ETH/USDC volume by protocol
- Net ETH buy pressure
- Daily OHLCV export table

### 3. Protocol and Pair Intelligence

Use:

- `03. Top DEX projects by volume`
- `04. Top token pairs by DEX volume`
- `19. Protocol market share over time`

Suggested visualizations:

- Protocol market share stacked chart
- Top 20 pairs table
- Top protocols table

### 4. Network Cost and Congestion

Use:

- `08. Base gas market: daily gas price and transaction activity`
- `09. Base gas market: hourly congestion monitor`

Suggested visualizations:

- Median gas by day
- P95 gas by hour
- Total fees by day

### 5. Stablecoin and Transfer Flow

Use:

- `10. ERC20 transfer market flow by token`
- `11. Stablecoin transfer flow: USDC focus`

Suggested visualizations:

- USDC transfer volume
- USDC senders and receivers
- Top token transfer volume table

### 6. Wallet Monitoring

Use:

- `12. Wallet token balances approximation by net transfers`
- `13. Wallet DEX trading history`
- `14. Wallet daily PnL-like net trading flow by token`

Suggested visualizations:

- Wallet trading history table
- Net bought/sold flow by token
- Approximate balances by token

Important: query 12 is transfer-flow based and is not a replacement for a canonical balance indexer.

### 7. Market Risk and Opportunity Signals

Use:

- `15. Market momentum score: volume, users, gas and ETH buy pressure`
- `16. New vs returning DEX traders`
- `17. Whale trades monitor`
- `18. DEX concentration by trader`

Suggested visualizations:

- Volume vs 7-day average
- New trader percentage
- Whale trades table
- Top trader concentration table

## Operational usage

Recommended workflow:

1. Create Dune queries from each SQL section.
2. Save each query with a stable name, for example `TradeWave - 01 Daily DEX Overview`.
3. Build a Dune dashboard using the sections above.
4. Export only read-only analytics into the application if needed.
5. Keep all trading execution logic inside the bot runtime, not in Dune.

## Future integration option

A later PR can add a `/stats` Telegram command that reads selected Dune API query results and returns:

- 24h Base DEX volume
- 24h ETH/USDC volume
- median Base gas
- whale trade count
- ETH buy pressure

Do not place Dune API keys in source control. Use deployment secrets only.
