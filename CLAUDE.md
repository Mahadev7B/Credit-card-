# GeoRewards — Ground Truth for Claude

## What This App Does
One SmartCard (Stripe Issuing Visa) that automatically routes each transaction to the user's best-performing linked credit card when mathematically beneficial.

## Core Business Model — DO NOT CONTRADICT THIS

### SmartCard Cashback
- SmartCard earns ~1.5% interchange from Visa on every transaction
- GeoRewards passes the full 1.5% to the user as cashback
- Source: merchant processing fees → Visa → GeoRewards → user

### Routing Economics (on a $120 restaurant bill, Chase 5% dining)
- GeoRewards charges Chase Freedom $120 via Stripe PaymentIntent
- Chase gives user $6.00 rewards (5%)
- Stripe routing fee: 2.9% × $120 + $0.30 = $3.78 (deducted from user's rewards balance)
- SmartCard cashback: $1.80 still posted (interchange still earned)
- User nets: $6.00 + $1.80 - $3.78 = $4.02 (vs $1.80 without routing)
- GeoRewards nets: $1.80 interchange either way — routing is neutral for us

### Who Pays What
- Routing fee ($3.78) comes from the USER's rewards balance — NOT from GeoRewards
- GeoRewards always earns the same $1.80 interchange regardless of routing
- Users only net more when routing fires — algorithm never routes at a loss

### Stripe Issuing Balance (Float)
- GeoRewards maintains a Stripe Issuing balance funded from routing PaymentIntent revenue
- When Chase is charged via PaymentIntent, that money lands in GeoRewards' Stripe payments balance, which feeds the Issuing balance automatically — Stripe supports this natively
- USERS NEVER DO ACH — USERS NEVER LOAD MONEY — no user-facing funding step ever
- GeoRewards seeds the Issuing balance once as an operational setup (invisible to users)
- After that, routing PaymentIntents keep the balance self-sustaining
- Users just get the card and use it. Done.

### Amex
- Amex cards CANNOT be used for routing — network rules prohibit it
- Amex cards can still be connected via Plaid for recommendations and statement analysis

## Revenue Streams
1. Subscription: $9.99/month per user
2. Interchange: 1.5% on SmartCard transactions (all passed to user as cashback — kept at $0 by GeoRewards intentionally to drive card usage)
3. Affiliate commissions: $100-300 per approved card application

## Card Connection Methods
- **Plaid OAuth**: connects existing cards for transaction history, spending analysis, benefit tracking. User authenticates on bank's own domain — we never see credentials.
- **Stripe Elements + SetupIntent**: collects card payment method for ROUTING (charging the card). Stored as Stripe PaymentMethod (pm_xxx). Card number never touches our servers.

## Key Features
- $1,007 moment: analyze 12 months of Plaid data, show exactly what rewards were left on the table
- Location alerts: iOS Core Location geofencing (cell tower, low battery) — alerts when near benefit-eligible merchants
- Consolidated PDF statements across all cards
- Card recommendations based on real spending (not generic)
- Benefits tracker: unused annual credits with expiry alerts

## Tech Stack
- Stripe Issuing: SmartCard issuance
- Plaid OAuth: card/bank connection (Plaid production approval pending)
- MongoDB + geospatial index: merchant matching
- OpenStreetMap / Overpass API: free merchant location database
- iOS Core Location: background geofencing
- Node.js / Express / Render: backend
- Claude API: statement parsing, recommendations

## Open Questions (Not Yet Resolved)
- Does Chase categorize a GeoRewards PaymentIntent as the original merchant category (dining/travel) for rewards purposes? Only a live transaction test can answer this.
- Stripe consumer issuing is private preview — need to apply via Stripe sales team
- Celtic Bank terms say business use only — need consumer issuing program for production

## Branch
All development on: `claude/smart-card-ios-app-NSTHP`
