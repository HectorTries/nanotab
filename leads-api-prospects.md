# NanoTab Leads — API Businesses That Should Charge Per-Call (x402)

*Generated 2026-10-19. Thesis: these APIs sell discrete, countable calls (weather lookup, geocode, SERP scrape, price tick) but force buyers through API keys + monthly subscriptions. Per-call x402 removes signup friction — ideal for AI agents that need 1–10,000 calls with no account.*

## Tier S — Perfect fit (single countable call, heavy agent demand, weak paywall)

### 1. OpenWeatherMap
- URL: https://openweathermap.org/api
- Sells: current/forecast/historical weather per lat-long
- Current model: freemium (60 calls/min free tier, then $40–$1,700/mo subscriptions)
- Why x402: every agent that plans travel, logistics, or outdoor work needs 1 weather call. Signup + key + quota is pure friction.
- Competitor charging: Tomorrow.io (~$0.001/call equivalent on usage plans); Pirate Weather (free, no moat)

### 2. SerpApi
- URL: https://serpapi.com
- Sells: Google/Bing/Maps SERP scrapes per search
- Current model: subscription tiers ($75/mo 5K searches → $275/mo 30K); free 250/mo
- Why x402: agents doing research need 3–50 searches per task, not 5K/mo. Overage anxiety kills adoption.
- Competitor charging: Oxylabs SERP API (~$0.003/search pay-as-you-go credits); Bright Data ($0.001+/req PAYG)

### 3. CoinGecko API
- URL: https://coingecko.com/en/api
- Sells: crypto price/market-cap ticks per coin
- Current model: freemium (free 5–15/min, then $129–$999/mo Analyst plans)
- Why x402: trading bots/agents need burst ticks, not monthly seats. Rate-limit walls push devs to scraping.
- Competitor charging: CoinMarketCap ($29–$699/mo, still sub); Kaiko (enterprise per-call quotes)

### 4. IPGeolocation / ipapi
- URL: https://ipgeolocation.io
- Sells: IP → geo lookup per request
- Current model: freemium (30K free/mo, then $15–$449/mo)
- Why x402: fraud checks and personalisation are 1-call-per-visitor. Monthly quotas mismatch traffic spikes.
- Competitor charging: MaxMind GeoIP2 (~$0.00004/lookup PAYG credits); IPinfo ($49+ sub)

### 5. ScrapingBee
- URL: https://scrapingbee.com
- Sells: headless-browser page render per URL
- Current model: credit packs on subscription ($49/mo 150K credits → $249/mo 1M)
- Why x402: agents scrape 10–500 pages per job. Credits-expiring-monthly is hostile to sporadic use.
- Competitor charging: Bright Data (~$0.001/req PAYG); Oxylabs ($1.6/1K results PAYG)

### 6. ExchangeRate-API / exchangerate.host
- URL: https://exchangerate-api.com / https://exchangerate.host
- Sells: FX conversion quote per pair
- Current model: freemium (1.5K free/mo, then $10–$100/mo)
- Why x402: checkout/settlement agents need one quote per transaction. Sub floor is absurd for low volume.
- Competitor charging: Open Exchange Rates ($12–$97/mo sub); Fixer.io (sub only — ripe for undercut)

## Tier A — Strong fit (countable units, subscription friction)

### 7. Alpha Vantage
- URL: https://alphavantage.co
- Sells: stock/forex/crypto time-series per symbol
- Current model: freemium (25 req/day free, then $49.99–$249.99/mo premium)
- Why x402: quant agents backtest in bursts; 25/day free is unusable, $50/mo floor is steep for a weekend project.
- Competitor charging: Polygon.io ($29–$399/mo, still sub); Twelve Data (credit-based, closest to per-call)

### 8. WeatherAPI.com
- URL: https://weatherapi.com
- Sells: weather/forecast/astronomy per call
- Current model: freemium (1M free/mo, then $4–$104/mo)
- Why x402: generous free tier trains users to never pay; per-call captures the long tail that exceeds free but won't subscribe.
- Competitor charging: OpenWeatherMap (see #1); Visual Crossing ($3–$35/mo sub)

### 9. Positionstack (apilayer)
- URL: https://positionstack.com
- Sells: forward/reverse geocoding per address
- Current model: freemium (25K free/mo, then $9.99–$99.99/mo)
- Why x402: address validation is per-checkout-call; apilayer subs punish seasonal sellers.
- Competitor charging: Google Geocoding ($5/1K PAYG — the model to copy); Mapbox ($0.75/1K PAYG)

### 10. The Odds API
- URL: https://the-odds-api.com
- Sells: sports odds snapshot per region/sport
- Current model: freemium (500 free/mo, then $29–$499/mo)
- Why x402: betting agents poll on match days only; monthly billing for event-driven demand is broken.
- Competitor charging: OddsJam (sub $50+/mo); Sportradar (enterprise quotes)

### 11. API-Football (api-sports.io)
- URL: https://api-football-v1.p.rapidapi.com / https://api-sports.io
- Sells: fixtures/live scores/odds per endpoint hit
- Current model: RapidAPI subscription ($0 free 100/day → $29–$349/mo)
- Why x402: top-grossing RapidAPI sports product; agent fantasy/betting apps need matchday bursts, not 24/7 quotas.
- Competitor charging: Sportradar (enterprise); Livescore API (sub) — no PAYG leader

### 12. NewsAPI
- URL: https://newsapi.org
- Sells: headline search per query
- Current model: freemium dev ($0, 100/day) → $449/mo business (no middle)
- Why x402: $0→$449 cliff is infamous; agents doing daily briefs need ~30 calls/day at cents, not a $449 seat.
- Competitor charging: GNews ($9–$99/mo, still sub); Mediastack (freemium) — gap wide open

### 13. OCR.space
- URL: https://ocr.space
- Sells: OCR per image/PDF
- Current model: freemium (25K free/mo, then $30–$1,000/mo PRO)
- Why x402: document agents OCR in unpredictable batches; monthly tiers waste or throttle.
- Competitor charging: Google Vision ($1.50/1K PAYG); AWS Textract ($1.50/1K PAYG) — incumbents already per-call, OCR.space lags

### 14. Abstract APIs (email verify, VAT, phone)
- URL: https://abstractapi.com
- Sells: validation micro-calls (email/phone/VAT/screenshot)
- Current model: freemium per API (100 free/mo each, then $9–$99/mo each)
- Why x402: textbook micro-call business; 13 separate subs is absurd. One x402 price per verify wins.
- Competitor charging: ZeroBounce ($0.008/verify PAYG credits); MillionVerifier (PAYG)

## Tier B — Good fit (MCP/agent-native or emerging)

### 15. Brave Search API
- URL: https://brave.com/search/api
- Sells: web/image/news search per query
- Current model: freemium (2K free/mo, then $5–$15/1K queries subscription tiers)
- Why x402: the default search backend for agents (already powers many MCP servers). Agents should pay per query with no key dance.
- Competitor charging: SerpApi (see #2); Tavily ($0.008/search credit packs)

### 16. Tavily
- URL: https://tavily.com
- Sells: agent-optimised search + extract + crawl per call
- Current model: freemium (1K free/mo, then $30–$200/mo)
- Why x402: built FOR agents, still sells like it's 2019 SaaS. Per-call is the native model their own customers expect.
- Competitor charging: Exa ($0.005/search PAYG-ish credits); Firecrawl ($0.01/page credit)

### 17. Firecrawl
- URL: https://firecrawl.dev
- Sells: URL → markdown scrape/crawl/extract per page
- Current model: freemium (500 free/mo, then $16–$333/mo)
- Why x402: highest-install scraper on Smithery; agent devs burn credits unpredictably. Wallet-per-call beats seat-per-month.
- Competitor charging: ScrapingBee (see #5); Apify ($0.50–$5/1K results PAYG)

### 18. Exa (formerly Metaphor)
- URL: https://exa.ai
- Sells: neural search per query
- Current model: usage credits on subscription ($5–$1,000/mo tiers)
- Why x402: credits already quasi-per-call but locked behind subs; pure x402 removes the $5 floor entirely.
- Competitor charging: Tavily (see #16); You.com API (PAYG credits)

### 19. Twelve Data
- URL: https://twelvedata.com
- Sells: stocks/forex/crypto/fundamentals per API credit
- Current model: freemium (800 credits/day, then $29–$1,000/mo)
- Why x402: closest to per-call already (credit meter); x402 lets agents pay without accounts or expiring credits.
- Competitor charging: Alpha Vantage (#7); Polygon.io (sub)

### 20. OpenFIGI / FIGI validation
- URL: https://openfigi.com/api
- Sells: security identifier mapping per job
- Current model: free with key (rate-limited), throttled anon
- Why x402: zero monetisation today, heavy quant-bot traffic; per-call is found money.
- Competitor charging: Bloomberg symbology (terminal bundle); CUSIP Global (license)

### 21. Football-Data.org
- URL: https://football-data.org
- Sells: fixtures/scores/standings per request
- Current model: freemium (10 req/min free, paid tiers to lift limits)
- Why x402: indie dev favourite, no clean paid path for small agent apps. Micro-payments fit the community.
- Competitor charging: API-Football (#11); Sportmonks ($19+/mo sub)

### 22. ScreenshotOne / URLBox
- URL: https://screenshotone.com / https://urlbox.com
- Sells: URL → screenshot per render
- Current model: freemium (100 free/mo, then $9–$199/mo)
- Why x402: QA/monitoring agents screenshot on failure — spiky, unpredictable, allergic to subs.
- Competitor charging: Browserless ($0.0005/screenshot PAYG-ish); Microlink (freemium)

### 23. Deepgram (self-serve long tail)
- URL: https://deepgram.com
- Sells: speech-to-text per minute
- Current model: PAYG credits BUT requires account + $200 free then prepay balance
- Why x402: already usage-based, but account+prepay blocks agents. x402 = same meter, zero signup.
- Competitor charging: AssemblyAI ($0.37/hr PAYG); OpenAI Whisper ($0.006/min API)

### 24. IPinfo (long-tail abuse case)
- URL: https://ipinfo.io
- Sells: IP enrichment per lookup
- Current model: freemium (50K free/mo, then $49–$499/mo)
- Why x402: 50K free tier is bot-farmed relentlessly; per-call converts abusers to payers at fractions of a cent.
- Competitor charging: MaxMind minFraud/GeoIP (PAYG credits); ipapi (#4)

---

## Outreach angle (same for all)
"Your API sells individual calls but you bill monthly seats. AI agents can't sign up — they need to pay $0.003 per call from a wallet and move on. NanoTab adds x402 per-call billing to your existing API in one deploy, no key management, no free-tier farming. [Competitor] already meters usage; we let you do it without subscriptions."
