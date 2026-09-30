# ShelfSignal
## Master Product Specification, Competitive Differentiation Strategy and AI Agent Implementation Prompt

**Status:** Concept validation and implementation baseline  
**Product:** Premium paid iOS and Android application  
**Initial market:** Australia  
**Working model:** A$4.99 one-time purchase, subject to validation  
**Primary experience:** Barcode-first personal product watchlist with meaningful price alerts  
**Tagline:** **Scan what you buy. Get the signal when the price is right.**

---

# 1. Purpose

This file is both the complete product and technical specification for ShelfSignal and the master onboarding prompt for an AI coding agent.

It supersedes StapleWatch and PricePilot. ShelfSignal is not limited to pantry staples. It monitors exact products households regularly buy across groceries, cleaning, toiletries, baby, pet, beer, wine, spirits, and compatible future categories.

Where code conflicts with this specification, preserve functioning behaviour first, document the conflict, add tests, and migrate incrementally rather than rewriting destructively.

# 2. Product Vision

ShelfSignal is a personal buying-timing assistant for physical consumer products.

A user scans products already present in their pantry, bathroom, laundry, garage, pet cupboard, refrigerator, or drinks cabinet. ShelfSignal identifies the exact item and variant, adds it to a personal or shared watchlist, monitors supported Australian retailers, and issues a clear signal when that product reaches a genuinely worthwhile price.

ShelfSignal is not primarily:

- a catalogue browser;
- a generic shopping-list app;
- an affiliate-link directory;
- a coupon feed;
- a retailer-link bookmarker;
- a demanding stock-count inventory system;
- a generic e-commerce comparison engine; or
- a feed of irrelevant promotions.

It should answer one question exceptionally well:

> **Is one of the exact products I already buy worth purchasing now?**

# 3. Core Product Promise

> Scan what you buy once. ShelfSignal watches the price and tells you when it is genuinely worth buying again.

Non-negotiable principles:

1. **Physical-product first:** Start with something in the home, not a URL.
2. **Exact matching:** Variant, flavour, pack size, quantity, and format matter.
3. **Personal relevance:** Alerts relate to selected products, not generic promotions.
4. **Meaningful timing:** A routine discount is different from an exceptional price.
5. **Low effort:** Once configured, ShelfSignal works quietly.
6. **Transparency:** Every signal explains why it was sent.

# 4. Market Learnings

The market validates demand for price comparison, watchlists, histories, and alerts. ShelfSignal must therefore win through its distinctive workflow, trusted matching, household collaboration, and premium execution.

## 4.1 PricePilot Naming Conflict

PricePilot must not be used publicly. Multiple products already use the name for grocery comparison, barcode-based comparison, marketplace comparison, and pricing software. An Australian App Store app called **PricePilot: Grocery Deals** overlaps directly with grocery comparison, nearby deals, lists, and basket comparison.

Actions:

- Use ShelfSignal in all visible strings, package names, repositories, analytics, and documentation.
- Remove visible StapleWatch and PricePilot references.
- Retain old names only in migration history.
- Complete an Australian trade mark search before commercial release.

## 4.2 TrolleyChecker

Observed strengths include supermarket comparison, saved products and lists, price-drop alerts, histories, and broad retailer coverage.

Learnings:

- Comparison alone is no longer distinctive.
- Alerts and price histories are expected.
- Broad but unreliable coverage damages trust.

ShelfSignal response:

- Begin with products physically owned by the user.
- Build a persistent exact-product watchlist.
- Provide personalised buy signals rather than generic drops.
- Treat liquor and other high-savings categories as first-class.
- Show confidence, recency, and provenance.

## 4.3 Weekly Shop

Observed strengths include exact Coles and Woolworths products, histories, adjustable discount thresholds, and email alerts.

Learnings:

- Threshold alerts are understandable.
- Exact pack matching matters.
- Weekly checking may miss short promotions.

ShelfSignal response:

- Native app and barcode onboarding.
- Timely push notifications.
- Target price, discount percentage, historical low, and confidence-based rules.
- Shared household coordination.
- Broader categories than supermarket groceries.

## 4.4 ShopHop

Observed strengths include histories, supermarket comparison, and a focus on genuine versus weak specials.

Learnings:

- Users need help determining whether a promotion is genuinely good.
- Historical context is more useful than a crossed-out price.

ShelfSignal response:

- Apply deal-quality logic only to watched products.
- Explain the trigger.
- Show lowest observed price, observed usual price, freshness, and conditions.
- Do not use a retailer promotional label as proof of value.

## 4.5 Whisprice and WorthSignal

Observed strengths include URL-based tracking, wishlists, histories, and alerts across many retailers.

Learnings:

- URLs offer broad coverage.
- URL entry creates setup work and variant ambiguity.

ShelfSignal response:

- Barcode-first setup for repeat household products.
- One canonical product mapped across retailers.
- URL tracking may exist later as an advanced secondary path.

## 4.6 Liquor Collection Apps

Apps such as iCollect Alcohol show that bottle scanning and rich liquor metadata are useful.

Learnings:

- Barcode scanning is natural for bottles and cartons.
- Liquor needs expression, volume, vintage, ABV, and pack details.

ShelfSignal response:

- Focus on buying timing, not cellar cataloguing.
- Match exact expression, size, vintage where relevant, and pack quantity.
- Never silently equate bottles, six-packs, cases, or cartons.

# 5. Defensible Position

ShelfSignal must not compete by claiming to have the most stores. It should compete through a distinctive workflow and trusted interpretation.

## 5.1 The Shelf-to-Signal Loop

1. **Scan the shelf:** Scan a product already used by the household.
2. **Confirm the match:** Verify brand, variant, size, and pack.
3. **Set the signal:** Decide what makes it worth buying.
4. **ShelfSignal watches:** Monitor supported offers and history.
5. **Receive a meaningful alert:** See where, why, and how strong it is.
6. **Act or snooze:** Buy, dismiss, snooze, or adjust.
7. **Coordinate:** Household members avoid duplicate purchases.

## 5.2 Seven Set-Apart Pillars

### 1. Scan What You Already Buy

Continuous Scan mode lets users walk through the home and add multiple products rapidly without returning to the home screen each time.

### 2. Exact Product Identity

Model:

- GTIN, EAN, or UPC;
- brand and canonical product name;
- variant or flavour;
- net quantity and unit;
- pack count and packaging;
- category and product family;
- alcohol volume, ABV, and vintage where applicable;
- model or subtype for future categories.

### 3. A Signal, Not Just a Drop

A signal may trigger when:

- price falls below a target;
- discount exceeds a threshold;
- price reaches or approaches an observed low;
- unit price beats a configured alternative;
- multi-buy economics are worthwhile;
- an eligible member price qualifies;
- deal confidence reaches a configured level.

### 4. One Household, One Shared Watchlist

Household members can share products, shopping items, purchase status, and snoozes while retaining private items.

### 5. Grocery and Liquor as Equal First-Class Experiences

Liquor requires exact matching, adult-user controls, member-price disclosure, and pack-aware comparison.

### 6. Transparent Deal Intelligence

Every alert answers:

- What exact product is this?
- Which retailer and store context apply?
- What is the current price?
- What is the observed usual price?
- What is the dollar and percentage difference?
- When was it checked?
- Is it conditional, member-only, or multi-buy?
- Why was the signal sent?
- How confident is the match?

### 7. Premium Calm

Avoid flashing coupons, crowded grids, fake urgency, and excessive red. Reserve strong visual emphasis for relevant signals.

# 6. Target Users

## Primary: Repeat-Product Household

Needs rapid scanning, exact tracking, a shared watchlist, trustworthy signals, and simple purchase acknowledgement.

## Secondary: Selective Enthusiast

A whisky, wine, coffee, pet-food, skincare, or specialist-product buyer waiting for a specific item to reach a suitable price.

## Secondary: Budget-Conscious Planner

A user shopping across multiple retailers who wants unit-price comparisons, grouped opportunities, and control over distance and eligibility.

# 7. Brand Language

**Name:** ShelfSignal  
**Tagline:** Scan what you buy. Get the signal when the price is right.  
**Descriptor:** Personal price alerts for the products you actually buy.

Preferred terms:

- My Watchlist
- Watched Products
- Signals
- Active Signals
- Signal Rules
- Price History
- Household
- Continuous Scan
- Deal Confidence
- Last Checked
- Snooze
- Mark as Bought

Avoid:

- My Staples
- Guaranteed cheapest
- Always lowest
- Live price unless genuinely live
- Unsupported savings claims

Voice should be concise, calm, transparent, and Australian without forced slang.

Example:

> **Strong signal at Dan Murphy’s**  
> Starward Two-Fold 700 mL is $49.90, down from an observed usual price of $62.00. This meets your target. Member conditions may apply. Checked 18 minutes ago.

# 8. Commercial Model

Working assumption: **A$4.99 one-time purchase**.

Core purchase should include account creation, barcode scanning, watchlists, standard signals, household sharing, supported prices, and economically sustainable history.

A one-time purchase creates recurring infrastructure obligations. Build:

- batched ingestion;
- shared observations across users;
- rate limits;
- retention controls;
- notification deduplication;
- cost telemetry;
- remotely configurable limits;
- a future-ready entitlement model.

Do not introduce a subscription during prototype work unless directed, but avoid an account model that prevents optional future premium services.

# 9. Functional Scope

## 9.1 Authentication

Support Sign in with Apple, Google sign-in, secure email authentication, recovery, deletion, privacy acknowledgement, and age confirmation before alcohol features.

Allow limited guest exploration where practical. Require an account for cloud watchlists and notifications.

## 9.2 Onboarding

1. Brand promise.
2. Country and postcode.
3. Explain the difference from catalogue apps.
4. Choose interests.
5. Demonstrate notification value.
6. Start Continuous Scan or search.
7. Configure first signal.
8. Preview My Watchlist.

Request camera permission when scanning begins and notification permission after the user understands the benefit.

## 9.3 Barcode Scanning

Requirements:

- EAN-8, EAN-13, UPC-A, and compatible GTINs;
- rapid continuous scanning;
- haptic and visual confirmation;
- duplicate detection;
- torch control;
- manual entry;
- offline queueing;
- accessible alternatives;
- no camera-frame storage unless necessary and disclosed.

### Unknown Barcode

1. Preserve barcode.
2. Allow front and back label photographs.
3. Request essential fields.
4. Attempt retailer or open-database matching.
5. Submit for moderation.
6. Allow temporary local tracking as unverified.
7. Notify after verification.

## 9.4 Search

Search by name, brand, barcode, category, retailer listing, liquor expression, abbreviation, and spelling variation.

Prioritise canonical products over retailer offers. A product and a retailer listing are different entities.

## 9.5 My Watchlist

Show product image, exact identity, pack format, best qualifying offer, signal state, trend, retailer, last checked, conditions, and household state.

Filters:

- active signals;
- price dropped;
- near target;
- no current match;
- bought recently;
- snoozed;
- category;
- retailer;
- household member;
- confidence.

## 9.6 Signal Rules

Per-product rules:

- target price;
- percentage discount;
- historical low;
- proximity to historical low;
- half-price;
- any price drop;
- member-price inclusion;
- multi-buy inclusion;
- travel radius;
- retailer inclusion or exclusion;
- cooldown;
- quantity wanted.

Recommendations must be editable and explainable.

## 9.7 History

Display chronological observations, retailer-specific history, observed usual price, lowest observed price, unit price, conditions, data gaps, and freshness.

Never imply continuous monitoring if observations are periodic.

## 9.8 Active Signals

Each card includes exact product, retailer context, current price, baseline, difference, triggered rule, conditions, checked time, known expiry, confidence, and actions.

Actions:

- View offer
- Add to shopping list
- Mark as bought
- Snooze
- Change rule
- Report mismatch
- Dismiss offer

## 9.9 Household Sharing

Support creation, secure invites, owner/member roles, shared/private items, shopping list, purchase notes, activity, leaving, removal, ownership transfer, and safe deletion.

Private items remain private unless explicitly shared.

## 9.10 Shopping List

A supporting feature, not the core product. Allow adding from signals, manual entry, quantity, retailer grouping, purchase completion, and household sharing.

## 9.11 Notifications

Types:

- target reached;
- unusually strong price;
- observed historical low;
- household purchase;
- barcode verification;
- reliable expiry reminder;
- security event.

Controls:

- global switch;
- quiet hours;
- category and retailer controls;
- per-product cooldown;
- digest mode;
- immediate high-value signals;
- household activity controls.

## 9.12 Alcohol

- Explicit adult opt-in.
- Ability to disable alcohol fully.
- Neutral wording.
- Responsible-service messaging.
- Exact volume, ABV, vintage, and pack handling.
- Member conditions.
- Store-availability qualification.
- No silent substitutions.

# 10. Premium UX

ShelfSignal should feel like a trusted high-quality utility, not a supermarket catalogue.

Working direction:

- deep charcoal dark mode;
- warm off-white light mode;
- signal green or teal for verified positive signals;
- amber for conditional or near-target states;
- red only for genuine errors;
- strong typography and spacious hierarchy;
- restrained cards;
- subtle pulse, beacon, and status-ring motion;
- excellent light and dark modes;
- WCAG 2.2 AA-oriented contrast.

Home priorities:

1. Active Signals
2. Quick Scan
3. Near-target products
4. Household activity
5. Data issues requiring action

Do not lead with a generic catalogue of specials.

Accessibility:

- screen-reader labels;
- dynamic text;
- minimum touch targets;
- colour-independent states;
- reduced motion;
- keyboard navigation in admin;
- visible focus;
- plain-language errors;
- non-camera scan alternatives.

# 11. Technical Architecture

## 11.1 Stack

### Mobile

- Flutter stable
- Dart
- Riverpod
- GoRouter
- Drift/SQLite
- Dio or maintained equivalent
- Freezed and json_serializable where useful
- Firebase Cloud Messaging
- secure platform storage
- mobile_scanner or maintained equivalent

### Backend

Recommended prototype and beta platform:

- low-cost Ubuntu LTS VPS;
- Docker Compose;
- PostgreSQL;
- Redis only where justified;
- FastAPI or NestJS;
- background worker;
- scheduler;
- Caddy or Nginx;
- automated TLS;
- encrypted backups;
- GitHub Actions.

Cloudflare may support DNS, CDN, rate limiting, or static assets. Do not force stateful jobs into serverless infrastructure when it harms reliability or debugability.

### Admin

- Next.js or similarly mature TypeScript framework;
- role-based access;
- product and barcode moderation;
- retailer mapping review;
- signal diagnostics;
- audited support tools;
- health dashboard.

## 11.2 Components

```text
Flutter App
  |-- Drift Local Database
  |-- Barcode Scanner
  |-- Notification Handler
  |-- Watchlist and Household UI
  v
ShelfSignal API
  |-- Authentication
  |-- Product Catalogue
  |-- Watchlist
  |-- Household
  |-- Price Query
  |-- Signal Rules
  |-- Notification Preferences
  +--> PostgreSQL
  +--> Background Queue
  +--> Object Storage
  v
Price Intelligence Pipeline
  |-- Retailer Adapters
  |-- Normalisation
  |-- Product Matching
  |-- Offer Qualification
  |-- Price History
  |-- Signal Evaluation
  v
Notification Dispatcher
  |-- FCM/APNs pathway
  |-- Deduplication
  |-- Cooldowns
  |-- Delivery Audit
```

## 11.3 Local-First Behaviour

Cache user summary, watchlist, scan queue, products, recent signals, shopping list, preferences, and pending edits.

Sync must use idempotent mutations, client operation IDs, documented conflict policy, separate server/client timestamps, visible retry, and no silent loss.

# 12. Data Model

Core entities:

```text
User
Household
HouseholdMember
Product
ProductBarcode
ProductImage
Retailer
RetailerStore
RetailerProduct
RetailerOffer
PriceObservation
WatchItem
SignalRule
SignalEvent
NotificationDelivery
ShoppingListItem
ProductSubmission
ModerationDecision
MembershipProgram
UserMembership
AuditEvent
```

Canonical product and retailer listing must be separate.

```text
Product
  id
  canonical_name
  brand
  variant
  category
  net_quantity
  unit
  pack_count
  packaging
  alcohol_abv
  alcohol_vintage
  verification_status

RetailerProduct
  id
  retailer_id
  retailer_external_id
  retailer_title
  retailer_url
  product_id
  match_confidence
  match_method
  store_scope
  last_seen_at
```

Price observations are append-only:

```text
PriceObservation
  id
  retailer_product_id
  store_id nullable
  observed_price
  unit_price nullable
  comparison_price nullable
  member_price nullable
  promotion_type
  multi_buy_quantity nullable
  multi_buy_total nullable
  availability_status
  valid_from nullable
  valid_to nullable
  observed_at
  source_method
  source_reference
  confidence
```

Watch items and rules:

```text
WatchItem
  id
  owner_user_id
  household_id nullable
  product_id
  visibility
  desired_quantity nullable
  status
  snoozed_until nullable
  last_bought_at nullable

SignalRule
  id
  watch_item_id
  rule_type
  target_price nullable
  minimum_discount_percent nullable
  near_low_percent nullable
  include_member_prices
  include_multi_buy
  allowed_retailers
  excluded_retailers
  maximum_distance_km nullable
  cooldown_hours
  enabled
```

# 13. Matching and Data Quality

Priority:

1. exact barcode;
2. verified retailer mapping;
3. deterministic brand, variant, size, and pack match;
4. candidate requiring moderation;
5. user-confirmed temporary match;
6. no match.

Confidence states:

- Verified
- High confidence
- Needs review
- Unverified
- Mismatch reported

Only Verified and High Confidence offers should normally generate push alerts.

Normalise currency, units, pack quantities, identifiers, conditions, memberships, timezone, and store context while retaining raw source fields.

# 14. Signal Intelligence

A signal must pass:

1. match confidence;
2. freshness;
3. availability;
4. retailer and location filters;
5. member/multi-buy eligibility;
6. threshold;
7. cooldown and deduplication;
8. anomaly checks.

Do not blindly rely on retailer “was” prices. Use a configurable robust observed baseline, separate member and non-member prices, avoid mixing pack formats, and label it **observed usual price**.

User-facing labels:

- Strong signal
- Good price
- Near your target
- Conditional offer
- Price needs verification

```python
def evaluate_signal(watch_item, rule, offer, history, now):
    if offer.match_confidence < CONFIG.minimum_push_match_confidence:
        return None
    if not is_fresh(offer.observed_at, now, offer.retailer_id):
        return None
    if not is_eligible_for_user(offer, watch_item.owner):
        return None

    baseline = calculate_observed_baseline(history, offer.conditions)
    historical_low = calculate_comparable_low(history, offer.conditions)
    evaluation = evaluate_rule(rule, offer.effective_price, baseline, historical_low)

    if not evaluation.triggered:
        return None
    if is_duplicate_or_in_cooldown(watch_item, offer, now):
        return None

    return build_explainable_signal(
        watch_item, offer, evaluation, baseline, historical_low
    )
```

# 15. Retailer Integration

Principles:

- Prefer authorised APIs, feeds, partnerships, or affiliate data.
- Review relevant terms before automated collection.
- Keep every adapter isolated.
- Never scrape from the mobile app.
- Rate-limit and cache.
- Record provenance, time, and store context.
- Degrade gracefully.
- Never overstate coverage.

```typescript
export interface RetailerAdapter {
  retailerId: string;
  searchProducts(query: ProductQuery): Promise<RetailerCandidate[]>;
  fetchProduct(externalId: string, context: StoreContext): Promise<RetailerSnapshot>;
  fetchChangedOffers(cursor?: string): Promise<OfferBatch>;
  healthCheck(): Promise<AdapterHealth>;
}
```

Expose last success, processed items, errors, throttling, parser version, schema warnings, stale threshold, and circuit-breaker state. Stale offers must not remain silently current.

# 16. API Outline

```text
POST   /v1/auth/session
GET    /v1/me
DELETE /v1/me
GET    /v1/products/search
GET    /v1/products/{id}
POST   /v1/products/resolve-barcode
POST   /v1/products/submissions
GET    /v1/watch-items
POST   /v1/watch-items
PATCH  /v1/watch-items/{id}
DELETE /v1/watch-items/{id}
POST   /v1/watch-items/{id}/rules
PATCH  /v1/signal-rules/{id}
DELETE /v1/signal-rules/{id}
GET    /v1/signals
POST   /v1/signals/{id}/dismiss
POST   /v1/signals/{id}/mark-bought
POST   /v1/signals/{id}/snooze
GET    /v1/products/{id}/price-history
POST   /v1/households
GET    /v1/households/{id}
POST   /v1/households/{id}/invites
POST   /v1/household-invites/{token}/accept
DELETE /v1/households/{id}/members/{userId}
GET    /v1/shopping-list
POST   /v1/shopping-list/items
PATCH  /v1/shopping-list/items/{id}
DELETE /v1/shopping-list/items/{id}
GET    /v1/notification-preferences
PATCH  /v1/notification-preferences
POST   /v1/devices
DELETE /v1/devices/{id}
```

Require OpenAPI, versioning, cursor pagination, consistent errors, idempotency, request IDs, strict validation, rate limiting, and privileged-action audits.

# 17. Security, Privacy, and Trust

Minimum controls:

- TLS;
- encryption at rest where supported;
- secure token storage;
- short-lived access tokens and refresh rotation;
- least privilege;
- environment-specific secrets;
- secret and dependency scanning;
- backups and restore tests;
- admin MFA;
- audit logs;
- rate limiting;
- deletion and export workflows;
- incident response runbook.

Minimise collection. Prefer postcode or selected store over precise location. Do not retain camera frames unnecessarily, access contacts unnecessarily, sell watchlist data, or use household data for unrelated advertising.

Explain freshness, conditions, gaps, confidence, affiliate relationships, and notification triggers.

# 18. Administration Portal

Modules:

- ingestion and infrastructure dashboard;
- stale retailers;
- unresolved barcodes;
- matching queue;
- notification failures;
- privacy-preserving aggregate use metrics;
- product merge/split and barcode mapping;
- liquor metadata review;
- retailer diagnostics;
- schema-change warnings;
- audited user support.

Support staff must not browse private watchlists without a legitimate, logged reason.

# 19. Analytics

Measure onboarding completion, first-scan success, unknown barcode rate, time to first watch item, rule creation, notification opt-in, signal opens, mark-as-bought, mismatch reports, household conversion, retention, crashes, adapter freshness, delivery success, and cost per active user.

Do not optimise for notification volume.

North-star candidate:

> **Monthly users who act on at least one trusted ShelfSignal for an exact watched product.**

# 20. Testing

Unit test barcode validation, normalisation, unit calculations, signal evaluation, baselines, historical lows, cooldowns, deduplication, memberships, and household permissions.

Integration test adapter normalisation, barcode resolution, watch item to signal, push payloads, invitation lifecycle, deletion, and offline replay.

Use legally permissible captured fixtures for retailer contracts and regression detection.

Critical end-to-end flow:

1. Create account.
2. Scan known barcode.
3. Confirm product.
4. Set target.
5. Receive simulated qualifying offer.
6. Open signal.
7. Add to shopping list.
8. Mark as bought.
9. Sync to household member.

Also test accessibility, performance, offline recovery, notification bursts, migrations, backup restore, abuse protection, large watchlists, and timezone handling.

# 21. Development Environment

Windows PC:

- Git and GitHub CLI
- Visual Studio Code
- Flutter stable
- Android Studio and SDK
- Docker Desktop with WSL2
- Node.js LTS and pnpm
- PostgreSQL client tools
- Claude Code or selected agent
- project formatters and linters

```bash
flutter doctor -v
node --version
pnpm --version
docker --version
git --version
```

Physical iPhone testing requires a Mac with current Xcode and an appropriate Apple developer workflow. Keep source cross-platform in GitHub, validate Android and shared Flutter logic on Windows, clone on Mac, configure signing outside source control, run on device, and use TestFlight for controlled beta distribution.

# 22. Deployment and Operations

Environments: local, development, staging, production. Separate credentials and databases.

CI should run formatting, linting, unit/integration tests, Flutter tests, dependency audit, secret scan, container build, migration validation, staging deployment, and protected production release.

VPS baseline:

```text
Caddy or Nginx
ShelfSignal API
ShelfSignal Worker
PostgreSQL
Optional Redis
Backup Agent
Metrics and Logs
```

Do not expose PostgreSQL publicly. Use firewall rules, SSH keys, monitored backups, and secure update practices.

Observe structured logs, request IDs, latency, errors, queues, ingestion, adapters, notification outcomes, database performance, backup status, and mobile crashes without logging private product data unnecessarily.

# 23. MVP

Included:

- ShelfSignal design system;
- Flutter iOS and Android app;
- accounts;
- Australian postcode/store context;
- barcode scan and search;
- canonical product catalogue;
- My Watchlist;
- signal rules;
- qualifying offers;
- basic history;
- push pipeline;
- household invitation;
- shared shopping list;
- admin moderation;
- two reliable retailer integrations, subject to lawful sustainable access;
- exact matching and mismatch reports;
- privacy/deletion foundations;
- monitoring and backups.

Excluded initially:

- retailer checkout;
- international support;
- meal planning;
- production-grade receipt OCR;
- loyalty-card storage;
- financial or credit features;
- detailed stock-count inventory;
- automatic consumption prediction;
- claims of universal coverage;
- unverified AI substitutions.

# 24. Delivery Phases

## Phase 0: Feasibility

- Check ShelfSignal trade marks, stores, domains, and handles.
- Validate retailer data rights and methods.
- Test barcode coverage.
- Interview target households.
- Validate willingness to pay.
- Define privacy and alcohol obligations.

Exit only when at least two retailer pathways are credible and the brand has no obvious conflict.

## Phase 1: Foundation

Repository, CI, mobile shell, backend shell, migrations, authentication, design tokens, observability, Product, and ProductBarcode.

## Phase 2: Shelf-to-Signal Vertical Slice

Scan, resolve, watch, set rule, ingest fixture offer, evaluate, notify, and mark bought.

## Phase 3: Retailers and History

Adapter framework, two integrations, append-only observations, history, confidence, stale-data controls, and diagnostics.

## Phase 4: Household and Premium UX

Invites, shared lists, privacy, motion, accessibility, dark mode, notification controls, and polished states.

## Phase 5: Closed Beta

TestFlight and Android closed testing, monitoring, mismatch review, alert tuning, cost measurement, support, security review, and restore exercise.

# 25. Beta Acceptance Criteria

- Exact product scan and confirmation works.
- Local and remote storage avoids duplication.
- Signal rules work.
- Qualifying observations create one explainable Signal.
- Duplicate notifications are suppressed.
- Freshness and conditions are visible.
- Incorrect matches can be reported.
- Shared items can be marked bought.
- Account deletion works.
- Core flows support screen readers and large text.
- Monitoring and verified backups exist.
- No production secrets are in source control.
- Failed ingestion cannot display stale data as current.
- No visible StapleWatch or PricePilot branding remains.

# 26. Risks and Mitigations

## Retailer Data Access

Validate rights before scale, prefer authorised sources, modularise adapters, retain provenance, and avoid unsupported promises.

## False Matching

Use barcode-first identity, conservative thresholds, moderation, explicit pack details, and reporting.

## One-Time Revenue

Batch ingestion, share observations, control retention, measure cost, and keep entitlements flexible.

## Notification Fatigue

Use meaningful defaults, cooldowns, explanations, digests, and action-based metrics.

## Misleading Savings

Use observed baselines, disclose conditions and windows, preserve provenance, and avoid guarantees.

## Alcohol Sensitivity

Use adult opt-in, disable controls, neutral wording, and responsible messaging.

## Brand Conflict

Complete Australian Trade Mark Search and professional review before costly rollout.

# 27. AI Agent Instructions

You are the senior implementation agent for ShelfSignal.

First actions:

1. Read this file fully.
2. Inspect the complete repository.
3. Identify architecture, packages, tests, CI, and deployment.
4. Search for StapleWatch and PricePilot references.
5. Preserve working behaviour.
6. Create `docs/repository-assessment.md`.
7. Create `docs/implementation-backlog.md`.
8. Repair or establish tests before risky refactors.
9. Implement the smallest complete Shelf-to-Signal vertical slice.
10. Keep each branch buildable.

Repository assessment must cover mobile, backend, database, auth, retailer status, tests, security, privacy, accessibility, design, deployment, debt, and the next ten tasks.

Engineering rules:

- Use maintainable typed tested solutions.
- Do not invent retailer APIs.
- Do not bypass authentication.
- Do not commit secrets.
- Do not implement uncontrolled scraping.
- Do not call prices live without evidence.
- Do not notify on low-confidence matches.
- Use migrations.
- Add regression tests.
- Preserve accessibility and offline safety.
- Record architectural decisions.

A task is done only when implementation, tests, linting, formatting, accessibility, loading/error states, privacy-safe telemetry, documentation, and regression protection are complete.

# 28. Initial Backlog

## P0

- Rebrand all visible surfaces to ShelfSignal.
- Create design tokens.
- Establish clear repository boundaries.
- Configure CI and environments.
- Implement authentication.
- Define Product and ProductBarcode migrations.
- Implement scan and resolution.
- Implement My Watchlist and SignalRule.
- Add fixture offer ingestion.
- Implement explainable Signals.
- Send a test push.
- Create moderation queue.
- Add privacy and deletion foundations.

## P1

- Retailer adapter contract.
- First validated retailer integration.
- Price history and observed baseline.
- Deal-confidence labels.
- Household invites and shared list.
- Notification preferences.
- Unknown barcode submission.
- Mismatch reporting.
- Alcohol metadata and opt-in.
- Operational dashboard.

## P2

- Second retailer integration.
- Continuous Scan.
- Richer household coordination.
- Member-program preferences.
- Advanced multi-buy comparison.
- Near-low rules.
- Radius controls.
- TestFlight pipeline.
- Product merge/split.
- Cost-per-active-user reporting.

# 29. User Stories

## Scan

> As a user, I want to scan the tomato sauce in my pantry so that I can track the exact brand, flavour, and size without typing it.

Acceptance: supported barcode, exact details, duplicate prevention, immediate rule creation, offline queue.

## Meaningful Signal

> As a user, I want an alert only when my watched product reaches a worthwhile price.

Acceptance: target and threshold support, trigger explanation, checked time, conditions, and cooldown.

## Household Purchase

> As a household member, I want to mark an item as bought so nobody unnecessarily buys it again.

Acceptance: household sync, actor recorded, quantity and retailer note, optional snooze, privacy respected.

## Liquor

> As an adult user, I want to track a specific whisky and be alerted when that exact expression and bottle size meets my target.

Acceptance: adult opt-in, exact expression and size, no format confusion, member conditions, neutral language.

# 30. Reference Register

These informed the competitive analysis. They do not grant permission to copy branding, content, code, or proprietary data.

- PricePilot barcode comparison: https://pricepilot-marketing.vercel.app/index.html
- PricePilot Grocery Deals: https://apps.apple.com/au/app/pricepilot-grocery-deals/id6806509065
- PricePilot Android: https://play.google.com/store/apps/details?id=shop.pricecompare.pricepilot&hl=en-US
- PricePilot Shopify: https://apps.shopify.com/pricepilot
- Australian Price Pilot: https://pricepilot.com.au/
- Australian Price Pilot tracker: https://pricepilotdeals.com.au/dashboard
- TrolleyChecker: https://trolleychecker.com.au/
- Weekly Shop: https://weeklyshop.au/price-tracker
- ShopHop: https://shophop.au/
- Whisprice: https://www.whisprice.com/au
- WorthSignal: https://worthsignal.com.au/
- iCollect Alcohol: https://www.icollecteverything.com/alcohol/
- Australian Trade Mark Search: https://search.ipaustralia.gov.au/trademarks/search/quick
- IP Australia guidance: https://www.ipaustralia.gov.au/trade-marks/search-existing-trade-marks

# 31. Final Principle

ShelfSignal should not try to become the biggest collection of specials. It should become the most trusted and convenient way for an Australian household to monitor the exact products it already buys.

> **Scan the shelf. Set the signal. Buy when it is genuinely worth it.**
