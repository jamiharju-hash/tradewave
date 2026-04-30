-- TradeWave Dune Market Data Query Pack
--
-- Usage:
-- 1. Create one Dune query per section below.
-- 2. Replace parameter placeholders such as {{lookback_days}} and {{chain}} in Dune.
-- 3. Start with chain = 'base' for TradeWave's current Base deployment.
--
-- Recommended default parameters:
--   {{chain}} = base
--   {{lookback_days}} = 90
--   {{wallet_address}} = 0x0000000000000000000000000000000000000000
--
-- Notes:
-- - Dune table schemas evolve. Use Dune Wand/Edit to adapt column names if your workspace table version differs.
-- - Keep runtime trading separate from Dune analytics. Dune is for monitoring, dashboards and market intelligence.

--------------------------------------------------------------------------------
-- 01. Daily DEX market overview by chain
--------------------------------------------------------------------------------
SELECT
  date_trunc('day', block_time) AS day,
  blockchain,
  COUNT(*) AS trades,
  COUNT(DISTINCT tx_hash) AS transactions,
  COUNT(DISTINCT taker) AS active_traders,
  SUM(CAST(amount_usd AS DOUBLE)) AS volume_usd,
  AVG(CAST(amount_usd AS DOUBLE)) AS avg_trade_usd,
  APPROX_PERCENTILE(CAST(amount_usd AS DOUBLE), 0.5) AS median_trade_usd
FROM dex.trades
WHERE
  blockchain = '{{chain}}'
  AND block_time >= current_timestamp - interval '{{lookback_days}}' day
  AND amount_usd IS NOT NULL
GROUP BY 1, 2
ORDER BY 1 DESC;

--------------------------------------------------------------------------------
-- 02. Hourly DEX volume and active traders
--------------------------------------------------------------------------------
SELECT
  date_trunc('hour', block_time) AS hour,
  blockchain,
  COUNT(*) AS trades,
  COUNT(DISTINCT taker) AS active_traders,
  SUM(CAST(amount_usd AS DOUBLE)) AS volume_usd
FROM dex.trades
WHERE
  blockchain = '{{chain}}'
  AND block_time >= current_timestamp - interval '{{lookback_days}}' day
  AND amount_usd IS NOT NULL
GROUP BY 1, 2
ORDER BY 1 DESC;

--------------------------------------------------------------------------------
-- 03. Top DEX projects by volume
--------------------------------------------------------------------------------
SELECT
  project,
  COUNT(*) AS trades,
  COUNT(DISTINCT taker) AS active_traders,
  SUM(CAST(amount_usd AS DOUBLE)) AS volume_usd,
  SUM(CAST(amount_usd AS DOUBLE)) / NULLIF(COUNT(*), 0) AS avg_trade_usd
FROM dex.trades
WHERE
  blockchain = '{{chain}}'
  AND block_time >= current_timestamp - interval '{{lookback_days}}' day
  AND amount_usd IS NOT NULL
GROUP BY 1
ORDER BY volume_usd DESC;

--------------------------------------------------------------------------------
-- 04. Top token pairs by DEX volume
--------------------------------------------------------------------------------
SELECT
  token_bought_symbol,
  token_sold_symbol,
  COUNT(*) AS trades,
  COUNT(DISTINCT taker) AS active_traders,
  SUM(CAST(amount_usd AS DOUBLE)) AS volume_usd
FROM dex.trades
WHERE
  blockchain = '{{chain}}'
  AND block_time >= current_timestamp - interval '{{lookback_days}}' day
  AND amount_usd IS NOT NULL
GROUP BY 1, 2
ORDER BY volume_usd DESC
LIMIT 100;

--------------------------------------------------------------------------------
-- 05. ETH / USDC market volume on DEXes
-- Adjust symbols if wrapped/native naming differs in your Dune workspace.
--------------------------------------------------------------------------------
SELECT
  date_trunc('day', block_time) AS day,
  project,
  COUNT(*) AS trades,
  SUM(CAST(amount_usd AS DOUBLE)) AS volume_usd,
  AVG(CAST(amount_usd AS DOUBLE)) AS avg_trade_usd
FROM dex.trades
WHERE
  blockchain = '{{chain}}'
  AND block_time >= current_timestamp - interval '{{lookback_days}}' day
  AND amount_usd IS NOT NULL
  AND (
    (upper(token_bought_symbol) IN ('ETH', 'WETH') AND upper(token_sold_symbol) = 'USDC')
    OR
    (upper(token_sold_symbol) IN ('ETH', 'WETH') AND upper(token_bought_symbol) = 'USDC')
  )
GROUP BY 1, 2
ORDER BY 1 DESC, volume_usd DESC;

--------------------------------------------------------------------------------
-- 06. DEX buy/sell imbalance for ETH/WETH vs USDC
--------------------------------------------------------------------------------
SELECT
  date_trunc('day', block_time) AS day,
  SUM(CASE WHEN upper(token_bought_symbol) IN ('ETH', 'WETH') THEN CAST(amount_usd AS DOUBLE) ELSE 0 END) AS eth_buy_volume_usd,
  SUM(CASE WHEN upper(token_sold_symbol) IN ('ETH', 'WETH') THEN CAST(amount_usd AS DOUBLE) ELSE 0 END) AS eth_sell_volume_usd,
  SUM(CASE WHEN upper(token_bought_symbol) IN ('ETH', 'WETH') THEN CAST(amount_usd AS DOUBLE) ELSE 0 END)
    - SUM(CASE WHEN upper(token_sold_symbol) IN ('ETH', 'WETH') THEN CAST(amount_usd AS DOUBLE) ELSE 0 END) AS net_eth_buy_pressure_usd
FROM dex.trades
WHERE
  blockchain = '{{chain}}'
  AND block_time >= current_timestamp - interval '{{lookback_days}}' day
  AND amount_usd IS NOT NULL
  AND (
    upper(token_bought_symbol) IN ('ETH', 'WETH')
    OR upper(token_sold_symbol) IN ('ETH', 'WETH')
  )
GROUP BY 1
ORDER BY 1 DESC;

--------------------------------------------------------------------------------
-- 07. Token price OHLCV from DEX trades
-- Replace {{token_symbol}} with ETH, WETH, USDC, etc.
--------------------------------------------------------------------------------
WITH token_trades AS (
  SELECT
    block_time,
    amount_usd,
    token_bought_symbol AS symbol,
    token_bought_amount AS token_amount,
    amount_usd / NULLIF(CAST(token_bought_amount AS DOUBLE), 0) AS price_usd
  FROM dex.trades
  WHERE
    blockchain = '{{chain}}'
    AND block_time >= current_timestamp - interval '{{lookback_days}}' day
    AND upper(token_bought_symbol) = upper('{{token_symbol}}')
    AND amount_usd IS NOT NULL
    AND token_bought_amount IS NOT NULL

  UNION ALL

  SELECT
    block_time,
    amount_usd,
    token_sold_symbol AS symbol,
    token_sold_amount AS token_amount,
    amount_usd / NULLIF(CAST(token_sold_amount AS DOUBLE), 0) AS price_usd
  FROM dex.trades
  WHERE
    blockchain = '{{chain}}'
    AND block_time >= current_timestamp - interval '{{lookback_days}}' day
    AND upper(token_sold_symbol) = upper('{{token_symbol}}')
    AND amount_usd IS NOT NULL
    AND token_sold_amount IS NOT NULL
), ranked AS (
  SELECT
    date_trunc('day', block_time) AS day,
    block_time,
    price_usd,
    amount_usd,
    ROW_NUMBER() OVER (PARTITION BY date_trunc('day', block_time) ORDER BY block_time ASC) AS open_rank,
    ROW_NUMBER() OVER (PARTITION BY date_trunc('day', block_time) ORDER BY block_time DESC) AS close_rank
  FROM token_trades
  WHERE price_usd IS NOT NULL AND price_usd > 0
)
SELECT
  day,
  MAX(CASE WHEN open_rank = 1 THEN price_usd END) AS open_price_usd,
  MAX(price_usd) AS high_price_usd,
  MIN(price_usd) AS low_price_usd,
  MAX(CASE WHEN close_rank = 1 THEN price_usd END) AS close_price_usd,
  SUM(CAST(amount_usd AS DOUBLE)) AS volume_usd,
  COUNT(*) AS trades
FROM ranked
GROUP BY 1
ORDER BY 1 DESC;

--------------------------------------------------------------------------------
-- 08. Base gas market: daily gas price and transaction activity
--------------------------------------------------------------------------------
SELECT
  date_trunc('day', block_time) AS day,
  COUNT(*) AS tx_count,
  COUNT(DISTINCT "from") AS active_senders,
  AVG(CAST(gas_price AS DOUBLE)) / 1e9 AS avg_gwei,
  APPROX_PERCENTILE(CAST(gas_price AS DOUBLE) / 1e9, 0.5) AS median_gwei,
  APPROX_PERCENTILE(CAST(gas_price AS DOUBLE) / 1e9, 0.9) AS p90_gwei,
  SUM(CAST(gas_used AS DOUBLE) * CAST(gas_price AS DOUBLE)) / 1e18 AS total_fees_eth
FROM base.transactions
WHERE
  block_time >= current_timestamp - interval '{{lookback_days}}' day
GROUP BY 1
ORDER BY 1 DESC;

--------------------------------------------------------------------------------
-- 09. Base gas market: hourly congestion monitor
--------------------------------------------------------------------------------
SELECT
  date_trunc('hour', block_time) AS hour,
  COUNT(*) AS tx_count,
  APPROX_PERCENTILE(CAST(gas_price AS DOUBLE) / 1e9, 0.5) AS median_gwei,
  APPROX_PERCENTILE(CAST(gas_price AS DOUBLE) / 1e9, 0.95) AS p95_gwei,
  SUM(CAST(gas_used AS DOUBLE) * CAST(gas_price AS DOUBLE)) / 1e18 AS total_fees_eth
FROM base.transactions
WHERE
  block_time >= current_timestamp - interval '{{lookback_days}}' day
GROUP BY 1
ORDER BY 1 DESC;

--------------------------------------------------------------------------------
-- 10. ERC20 transfer market flow by token
--------------------------------------------------------------------------------
SELECT
  date_trunc('day', block_time) AS day,
  symbol,
  contract_address,
  COUNT(*) AS transfers,
  COUNT(DISTINCT "from") AS senders,
  COUNT(DISTINCT "to") AS receivers,
  SUM(CAST(amount_usd AS DOUBLE)) AS transfer_volume_usd
FROM tokens.transfers
WHERE
  blockchain = '{{chain}}'
  AND block_time >= current_timestamp - interval '{{lookback_days}}' day
  AND amount_usd IS NOT NULL
GROUP BY 1, 2, 3
ORDER BY day DESC, transfer_volume_usd DESC;

--------------------------------------------------------------------------------
-- 11. Stablecoin transfer flow: USDC focus
--------------------------------------------------------------------------------
SELECT
  date_trunc('day', block_time) AS day,
  symbol,
  COUNT(*) AS transfers,
  COUNT(DISTINCT "from") AS senders,
  COUNT(DISTINCT "to") AS receivers,
  SUM(CAST(amount AS DOUBLE)) AS amount_tokens,
  SUM(CAST(amount_usd AS DOUBLE)) AS amount_usd
FROM tokens.transfers
WHERE
  blockchain = '{{chain}}'
  AND block_time >= current_timestamp - interval '{{lookback_days}}' day
  AND upper(symbol) = 'USDC'
GROUP BY 1, 2
ORDER BY 1 DESC;

--------------------------------------------------------------------------------
-- 12. Wallet token balances approximation by net transfers
-- Replace the wallet list in the CTE with TradeWave wallet addresses.
--------------------------------------------------------------------------------
WITH wallets(address) AS (
  VALUES
    (0x0000000000000000000000000000000000000000)
), flows AS (
  SELECT
    t.symbol,
    t.contract_address,
    t."to" AS address,
    CAST(t.amount AS DOUBLE) AS signed_amount,
    CAST(t.amount_usd AS DOUBLE) AS signed_amount_usd
  FROM tokens.transfers t
  JOIN wallets w ON t."to" = w.address
  WHERE t.blockchain = '{{chain}}'

  UNION ALL

  SELECT
    t.symbol,
    t.contract_address,
    t."from" AS address,
    -CAST(t.amount AS DOUBLE) AS signed_amount,
    -CAST(t.amount_usd AS DOUBLE) AS signed_amount_usd
  FROM tokens.transfers t
  JOIN wallets w ON t."from" = w.address
  WHERE t.blockchain = '{{chain}}'
)
SELECT
  address,
  symbol,
  contract_address,
  SUM(signed_amount) AS estimated_token_balance,
  SUM(signed_amount_usd) AS estimated_net_flow_usd
FROM flows
GROUP BY 1, 2, 3
HAVING ABS(SUM(signed_amount)) > 0
ORDER BY estimated_net_flow_usd DESC;

--------------------------------------------------------------------------------
-- 13. Wallet DEX trading history
-- Replace {{wallet_address}} with a user or treasury wallet address.
--------------------------------------------------------------------------------
SELECT
  block_time,
  tx_hash,
  project,
  token_sold_symbol,
  token_sold_amount,
  token_bought_symbol,
  token_bought_amount,
  amount_usd
FROM dex.trades
WHERE
  blockchain = '{{chain}}'
  AND block_time >= current_timestamp - interval '{{lookback_days}}' day
  AND taker = {{wallet_address}}
ORDER BY block_time DESC;

--------------------------------------------------------------------------------
-- 14. Wallet daily PnL-like net trading flow by token
-- This is not tax/accounting-grade PnL. It is a directional flow monitor.
--------------------------------------------------------------------------------
SELECT
  date_trunc('day', block_time) AS day,
  token_bought_symbol AS token_symbol,
  SUM(CAST(amount_usd AS DOUBLE)) AS bought_usd,
  0 AS sold_usd
FROM dex.trades
WHERE
  blockchain = '{{chain}}'
  AND block_time >= current_timestamp - interval '{{lookback_days}}' day
  AND taker = {{wallet_address}}
  AND amount_usd IS NOT NULL
GROUP BY 1, 2

UNION ALL

SELECT
  date_trunc('day', block_time) AS day,
  token_sold_symbol AS token_symbol,
  0 AS bought_usd,
  SUM(CAST(amount_usd AS DOUBLE)) AS sold_usd
FROM dex.trades
WHERE
  blockchain = '{{chain}}'
  AND block_time >= current_timestamp - interval '{{lookback_days}}' day
  AND taker = {{wallet_address}}
  AND amount_usd IS NOT NULL
GROUP BY 1, 2
ORDER BY 1 DESC;

--------------------------------------------------------------------------------
-- 15. Market momentum score: volume, users, gas and ETH buy pressure
--------------------------------------------------------------------------------
WITH daily_dex AS (
  SELECT
    date_trunc('day', block_time) AS day,
    SUM(CAST(amount_usd AS DOUBLE)) AS dex_volume_usd,
    COUNT(DISTINCT taker) AS active_traders,
    SUM(CASE WHEN upper(token_bought_symbol) IN ('ETH', 'WETH') THEN CAST(amount_usd AS DOUBLE) ELSE 0 END)
      - SUM(CASE WHEN upper(token_sold_symbol) IN ('ETH', 'WETH') THEN CAST(amount_usd AS DOUBLE) ELSE 0 END) AS eth_buy_pressure_usd
  FROM dex.trades
  WHERE
    blockchain = '{{chain}}'
    AND block_time >= current_timestamp - interval '{{lookback_days}}' day
    AND amount_usd IS NOT NULL
  GROUP BY 1
), gas AS (
  SELECT
    date_trunc('day', block_time) AS day,
    APPROX_PERCENTILE(CAST(gas_price AS DOUBLE) / 1e9, 0.5) AS median_gwei,
    COUNT(*) AS tx_count
  FROM base.transactions
  WHERE block_time >= current_timestamp - interval '{{lookback_days}}' day
  GROUP BY 1
)
SELECT
  d.day,
  d.dex_volume_usd,
  d.active_traders,
  d.eth_buy_pressure_usd,
  g.median_gwei,
  g.tx_count,
  d.dex_volume_usd / NULLIF(AVG(d.dex_volume_usd) OVER (ORDER BY d.day ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING), 0) AS volume_vs_7d_avg,
  d.active_traders / NULLIF(AVG(d.active_traders) OVER (ORDER BY d.day ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING), 0) AS traders_vs_7d_avg,
  g.median_gwei / NULLIF(AVG(g.median_gwei) OVER (ORDER BY d.day ROWS BETWEEN 7 PRECEDING AND 1 PRECEDING), 0) AS gas_vs_7d_avg
FROM daily_dex d
LEFT JOIN gas g ON d.day = g.day
ORDER BY d.day DESC;

--------------------------------------------------------------------------------
-- 16. New vs returning DEX traders
--------------------------------------------------------------------------------
WITH first_seen AS (
  SELECT
    taker,
    MIN(date_trunc('day', block_time)) AS first_day
  FROM dex.trades
  WHERE blockchain = '{{chain}}'
  GROUP BY 1
), daily AS (
  SELECT
    date_trunc('day', t.block_time) AS day,
    t.taker,
    fs.first_day
  FROM dex.trades t
  JOIN first_seen fs ON t.taker = fs.taker
  WHERE
    t.blockchain = '{{chain}}'
    AND t.block_time >= current_timestamp - interval '{{lookback_days}}' day
)
SELECT
  day,
  COUNT(DISTINCT taker) AS active_traders,
  COUNT(DISTINCT CASE WHEN first_day = day THEN taker END) AS new_traders,
  COUNT(DISTINCT CASE WHEN first_day < day THEN taker END) AS returning_traders,
  COUNT(DISTINCT CASE WHEN first_day = day THEN taker END) * 100.0 / NULLIF(COUNT(DISTINCT taker), 0) AS new_trader_pct
FROM daily
GROUP BY 1
ORDER BY 1 DESC;

--------------------------------------------------------------------------------
-- 17. Whale trades monitor
--------------------------------------------------------------------------------
SELECT
  block_time,
  blockchain,
  project,
  taker,
  tx_hash,
  token_sold_symbol,
  token_sold_amount,
  token_bought_symbol,
  token_bought_amount,
  amount_usd
FROM dex.trades
WHERE
  blockchain = '{{chain}}'
  AND block_time >= current_timestamp - interval '{{lookback_days}}' day
  AND CAST(amount_usd AS DOUBLE) >= {{min_trade_usd}}
ORDER BY amount_usd DESC;

--------------------------------------------------------------------------------
-- 18. DEX concentration by trader
--------------------------------------------------------------------------------
SELECT
  taker,
  COUNT(*) AS trades,
  SUM(CAST(amount_usd AS DOUBLE)) AS volume_usd,
  SUM(CAST(amount_usd AS DOUBLE)) * 100.0 / SUM(SUM(CAST(amount_usd AS DOUBLE))) OVER () AS volume_share_pct
FROM dex.trades
WHERE
  blockchain = '{{chain}}'
  AND block_time >= current_timestamp - interval '{{lookback_days}}' day
  AND amount_usd IS NOT NULL
GROUP BY 1
ORDER BY volume_usd DESC
LIMIT 100;

--------------------------------------------------------------------------------
-- 19. Protocol market share over time
--------------------------------------------------------------------------------
SELECT
  date_trunc('day', block_time) AS day,
  project,
  SUM(CAST(amount_usd AS DOUBLE)) AS volume_usd,
  SUM(CAST(amount_usd AS DOUBLE)) * 100.0
    / NULLIF(SUM(SUM(CAST(amount_usd AS DOUBLE))) OVER (PARTITION BY date_trunc('day', block_time)), 0) AS daily_market_share_pct
FROM dex.trades
WHERE
  blockchain = '{{chain}}'
  AND block_time >= current_timestamp - interval '{{lookback_days}}' day
  AND amount_usd IS NOT NULL
GROUP BY 1, 2
ORDER BY 1 DESC, volume_usd DESC;

--------------------------------------------------------------------------------
-- 20. Full daily market snapshot table for export/API usage
--------------------------------------------------------------------------------
WITH dex_daily AS (
  SELECT
    date_trunc('day', block_time) AS day,
    COUNT(*) AS dex_trades,
    COUNT(DISTINCT tx_hash) AS dex_txs,
    COUNT(DISTINCT taker) AS dex_traders,
    SUM(CAST(amount_usd AS DOUBLE)) AS dex_volume_usd,
    AVG(CAST(amount_usd AS DOUBLE)) AS avg_trade_usd
  FROM dex.trades
  WHERE
    blockchain = '{{chain}}'
    AND block_time >= current_timestamp - interval '{{lookback_days}}' day
    AND amount_usd IS NOT NULL
  GROUP BY 1
), transfers_daily AS (
  SELECT
    date_trunc('day', block_time) AS day,
    COUNT(*) AS token_transfers,
    COUNT(DISTINCT "from") AS token_senders,
    COUNT(DISTINCT "to") AS token_receivers,
    SUM(CAST(amount_usd AS DOUBLE)) AS token_transfer_volume_usd
  FROM tokens.transfers
  WHERE
    blockchain = '{{chain}}'
    AND block_time >= current_timestamp - interval '{{lookback_days}}' day
    AND amount_usd IS NOT NULL
  GROUP BY 1
), gas_daily AS (
  SELECT
    date_trunc('day', block_time) AS day,
    COUNT(*) AS chain_txs,
    COUNT(DISTINCT "from") AS chain_active_senders,
    APPROX_PERCENTILE(CAST(gas_price AS DOUBLE) / 1e9, 0.5) AS median_gwei,
    SUM(CAST(gas_used AS DOUBLE) * CAST(gas_price AS DOUBLE)) / 1e18 AS total_fees_eth
  FROM base.transactions
  WHERE block_time >= current_timestamp - interval '{{lookback_days}}' day
  GROUP BY 1
)
SELECT
  COALESCE(d.day, t.day, g.day) AS day,
  d.dex_trades,
  d.dex_txs,
  d.dex_traders,
  d.dex_volume_usd,
  d.avg_trade_usd,
  t.token_transfers,
  t.token_senders,
  t.token_receivers,
  t.token_transfer_volume_usd,
  g.chain_txs,
  g.chain_active_senders,
  g.median_gwei,
  g.total_fees_eth
FROM dex_daily d
FULL OUTER JOIN transfers_daily t ON d.day = t.day
FULL OUTER JOIN gas_daily g ON COALESCE(d.day, t.day) = g.day
ORDER BY 1 DESC;
