# Implementation Backlog

**Product:** ShelfSignal  
**Version:** 1.0.0  
**Last Updated:** 2026-10-01

---

## Status Snapshot (2026-10-01)

Done in the vertical-slice rebuild (see [CHANGELOG.md](../CHANGELOG.md)):
- [x] Backend project setup (Express, health, request IDs, rate limiting, docker-compose)
- [x] Database schema for users, products, product_barcodes, retailer_products,
      price_observations, watch_items, signal_rules, signal_events + runner and seeds
- [x] Email/password auth with account deletion (privacy foundation)
- [x] Barcode validation + resolve-barcode + unknown-barcode submission
- [x] Watchlist CRUD + signal rules (target/discount/near-low/any-drop)
- [x] Signal evaluation engine (pure, unit-tested) + fixture ingestion + signals feed
- [x] Signals actions: dismiss / snooze / mark-bought
- [x] Mobile shell: Riverpod, GoRouter shell, design tokens, demo mode, all five tabs
- [x] Camera barcode scanning (mobile_scanner 7): opt-in permission timing (spec 9.2),
      GTIN-only detection + GS1 check-digit gate, haptic/visual confirmation, duplicate
      suppression, torch control, manual-entry fallback; Android/iOS camera declarations
- [x] Unit tests backend (52) + mobile (7); flutter analyze clean

Not started (unchanged):
- [ ] Sign in with Apple / Google (Firebase)
- [ ] Push pipeline (FCM send path; device-token registration exists)
- [ ] Household sharing, shopping list, admin portal, retailer adapters

---

## P0 - Critical Path (MVP)

### Mobile Foundation
- [ ] **Design System**
  - [ ] Create design tokens (colors, typography, spacing)
  - [ ] Implement deep charcoal dark mode
  - [ ] Implement warm off-white light mode
  - [ ] Signal green/teal for verified positive signals
  - [ ] Amber for conditional/near-target states
  - [ ] WCAG 2.2 AA contrast ratios

- [ ] **Navigation**
  - [ ] Set up GoRouter configuration
  - [ ] Create app shell layout
  - [ ] Implement bottom navigation (Home, Scan, Watchlist, Profile)
  - [ ] Add loading and error states

- [ ] **Authentication**
  - [ ] Sign in with Apple integration
  - [ ] Sign in with Google integration
  - [ ] Email/password authentication
  - [ ] Secure token storage
  - [ ] Account creation flow
  - [ ] Age confirmation before alcohol features

### Backend Foundation
- [ ] **Project Setup**
  - [ ] FastAPI application structure
  - [ ] Docker Compose configuration (PostgreSQL, Caddy)
  - [ ] Environment variable management
  - [ ] Health check endpoint
  - [ ] Request logging with request IDs

- [ ] **Database Schema**
  - [ ] User table
  - [ ] Household table
  - [ ] Product table
  - [ ] ProductBarcode table
  - [ ] Retailer table
  - [ ] RetailerProduct table
  - [ ] PriceObservation table
  - [ ] WatchItem table
  - [ ] SignalRule table
  - [ ] Migration scripts

- [ ] **Authentication API**
  - [ ] POST /v1/auth/session
  - [ ] DELETE /v1/auth/session
  - [ ] GET /v1/me
  - [ ] DELETE /v1/me

### Product & Barcode
- [ ] **Barcode Scanning**
  - [x] Camera permission request (opt-in timing: prompt fires on "Start camera", spec 9.2)
  - [x] Barcode detection (EAN-8, EAN-13, UPC-A — GTIN-only format filter + GS1 check digit)
  - [x] Haptic and visual confirmation (mediumImpact + reticle + resolved card)
  - [x] Duplicate detection (same code suppressed for 4s / while resolving)
  - [x] Torch control
  - [x] Manual entry fallback (always available, accessible alternative)
  - [ ] Offline queueing

- [ ] **Product Resolution**
  - [ ] POST /v1/products/resolve-barcode
  - [ ] Exact barcode matching
  - [ ] Retailer mapping lookup
  - [ ] Open database fallback
  - [ ] Unknown barcode submission
  - [ ] Confidence scoring

- [ ] **Product Catalogue**
  - [ ] GET /v1/products/search
  - [ ] GET /v1/products/{id}
  - [ ] Product normalisation (currency, units, pack)
  - [ ] Category and family classification

### Watchlist & Rules
- [ ] **Watchlist CRUD**
  - [ ] GET /v1/watch-items
  - [ ] POST /v1/watch-items
  - [ ] PATCH /v1/watch-items/{id}
  - [ ] DELETE /v1/watch-items/{id}
  - [ ] Local-first caching with Drift
  - [ ] Sync conflict resolution

- [ ] **Signal Rules**
  - [ ] POST /v1/watch-items/{id}/rules
  - [ ] PATCH /v1/signal-rules/{id}
  - [ ] DELETE /v1/signal-rules/{id}
  - [ ] Rule types: target price, discount %, historical low, half-price
  - [ ] Per-product rule configuration
  - [ ] Rule recommendations

### Signal Evaluation
- [ ] **Offer Qualification**
  - [ ] Match confidence threshold check
  - [ ] Freshness validation
  - [ ] Availability check
  - [ ] Retailer/location filter application
  - [ ] Member/multi-buy eligibility

- [ ] **Signal Generation**
  - [ ] Rule evaluation logic
  - [ ] Cooldown and deduplication
  - [ ] Explainable signal building
  - [ ] Baseline calculation (observed usual price)
  - [ ] Historical low comparison

- [ ] **Signal Display**
  - [ ] GET /v1/signals
  - [ ] Active signals list
  - [ ] Signal card UI (product, retailer, price, baseline, difference)
  - [ ] Conditions display (member-only, multi-buy)
  - [ ] Confidence indicator
  - [ ] Last checked timestamp

### Notifications
- [ ] **Push Setup**
  - [ ] Firebase Cloud Messaging configuration
  - [ ] APNs configuration
  - [ ] Device registration API
  - [ ] DELETE /v1/devices/{id}

- [ ] **Notification Delivery**
  - [ ] Signal notification payload
  - [ ] Deduplication logic
  - [ ] Cooldown enforcement
  - [ ] Quiet hours respect
  - [ ] Test push endpoint

### Household
- [ ] **Household Management**
  - [ ] POST /v1/households
  - [ ] GET /v1/households/{id}
  - [ ] POST /v1/households/{id}/invites
  - [ ] POST /v1/household-invites/{token}/accept
  - [ ] DELETE /v1/households/{id}/members/{userId}
  - [ ] Owner/member role separation
  - [ ] Shared vs private items

- [ ] **Shared Actions**
  - [ ] Mark as bought (household sync)
  - [ ] Snooze (household sync)
  - [ ] Purchase notes
  - [ ] Activity feed

### Shopping List
- [ ] **List Management**
  - [ ] GET /v1/shopping-list
  - [ ] POST /v1/shopping-list/items
  - [ ] PATCH /v1/shopping-list/items/{id}
  - [ ] DELETE /v1/shopping-list/items/{id}
  - [ ] Add from signals
  - [ ] Manual entry
  - [ ] Quantity tracking
  - [ ] Retailer grouping
  - [ ] Purchase completion

### Privacy & Deletion
- [ ] **Data Export**
  - [ ] User data export endpoint
  - [ ] GDPR-compliant export format

- [ ] **Account Deletion**
  - [ ] DELETE /v1/me (full deletion)
  - [ ] Data purge workflow
  - [ ] Grace period handling
  - [ ] Audit log entry

### Admin Moderation
- [ ] **Moderation Queue**
  - [ ] Unresolved barcodes view
  - [ ] Product merge/split tools
  - [ ] Barcode mapping review
  - [ ] Liquor metadata review
  - [ ] Retailer mapping review

- [ ] **Admin Authentication**
  - [ ] Role-based access control
  - [ ] Admin MFA
  - [ ] Audit logging

### Testing
- [ ] **Unit Tests**
  - [ ] Barcode validation
  - [ ] Unit calculations
  - [ ] Signal evaluation logic
  - [ ] Baseline calculations
  - [ ] Cooldown logic
  - [ ] Household permissions

- [ ] **Integration Tests**
  - [ ] Adapter normalisation
  - [ ] Barcode resolution
  - [ ] Watch item to signal flow
  - [ ] Push payload construction
  - [ ] Invitation lifecycle

- [ ] **End-to-End Tests**
  - [ ] Create account → scan → confirm → set rule → receive signal → mark bought → sync to household

### Accessibility
- [ ] **Screen Reader Support**
  - [ ] Semantic labels
  - [ ] Dynamic text scaling
  - [ ] TalkBack/VoiceOver testing

- [ ] **Visual Accessibility**
  - [ ] Colour-independent states
  - [ ] Visible focus indicators
  - [ ] Minimum touch targets
  - [ ] Reduced motion support

### Monitoring & Backups
- [ ] **Observability**
  - [ ] Structured logging
  - [ ] Request ID tracking
  - [ ] Latency metrics
  - [ ] Error tracking
  - [ ] Crash reporting (mobile)

- [ ] **Backups**
  - [ ] Automated encrypted backups
  - [ ] Backup verification tests
  - [ ] Restore procedure documentation

---

## P1 - Core Features (Beta)

### Retailer Integration
- [ ] **Adapter Framework**
  - [ ] RetailerAdapter interface
  - [ ] Health check endpoint
  - [ ] Circuit breaker pattern
  - [ ] Rate limiting
  - [ ] Caching strategy

- [ ] **First Retailer Integration**
  - [ ] Coles or Woolworths (whichever has authorised access)
  - [ ] Product search
  - [ ] Offer fetching
  - [ ] Price normalisation
  - [ ] Store context capture

- [ ] **Price History**
  - [ ] GET /v1/products/{id}/price-history
  - [ ] Append-only observations
  - [ ] Retailer-specific history
  - [ ] Observed usual price calculation
  - [ ] Lowest observed price
  - [ ] Unit price tracking

- [ ] **Deal Confidence**
  - [ ] Confidence labels (Verified, High, Needs Review, Unverified)
  - [ ] Deal quality scoring
  - [ ] Baseline vs current price
  - [ ] Historical context display

### Advanced Features
- [ ] **Unknown Barcode Submission**
  - [ ] Product photo upload
  - [ ] Essential field entry
  - [ ] Temporary local tracking
  - [ ] Moderation submission
  - [ ] Verification notification

- [ ] **Mismatch Reporting**
  - [ ] Report incorrect product match
  - [ ] Submit correct product details
  - [ ] Moderator review workflow

- [ ] **Alcohol Features**
  - [ ] Adult opt-in flow
  - [ ] Alcohol category toggle (disable fully)
  - [ ] Exact volume, ABV, vintage handling
  - [ ] Member price disclosure
  - [ ] Responsible service messaging

- [ ] **Notification Preferences**
  - [ ] GET /v1/notification-preferences
  - [ ] PATCH /v1/notification-preferences
  - [ ] Global switch
  - [ ] Quiet hours
  - [ ] Category controls
  - [ ] Retailer controls
  - [ ] Per-product cooldown
  - [ ] Digest mode
  - [ ] Immediate high-value signals

### Operations
- [ ] **Admin Dashboard**
  - [ ] Ingestion dashboard
  - [ ] Stale retailer detection
  - [ ] Unresolved barcode queue
  - [ ] Matching queue
  - [ ] Notification failures
  - [ ] Privacy-preserving metrics
  - [ ] Schema warnings
  - [ ] Support tools

### Analytics
- [ ] **Event Tracking**
  - [ ] Onboarding completion
  - [ ] First scan success
  - [ ] Unknown barcode rate
  - [ ] Time to first watch item
  - [ ] Rule creation
  - [ ] Notification opt-in
  - [ ] Signal opens
  - [ ] Mark as bought
  - [ ] Mismatch reports
  - [ ] Household conversion
  - [ ] Retention
  - [ ] Crashes
  - [ ] Adapter freshness
  - [ ] Delivery success

---

## P2 - Enhancements (Post-Beta)

### Mobile Experience
- [ ] **Continuous Scan Mode**
  - [ ] Rapid multi-product scanning
  - [ ] Background scan queue
  - [ ] Scan history

- [ ] **Rich Household Coordination**
  - [ ] Shopping list sync improvements
  - [ ] Purchase quantity tracking
  - [ ] Retailer notes
  - [ ] Activity timeline
  - [ ] Ownership transfer
  - [ ] Household leave/removal

- [ ] **Advanced Multi-Buy**
  - [ ] Multi-buy rule support
  - [ ] Unit price comparison
  - [ ] Economic evaluation

- [ ] **Radius Controls**
  - [ ] Maximum distance for offers
  - [ ] Store-specific preferences
  - [ ] Location services (opt-in)

### Admin Tools
- [ ] **Product Management**
  - [ ] Product merge/split
  - [ ] Barcode mapping
  - [ ] Category management
  - [ ] Liquor metadata review
  - [ ] Retailer diagnostics

- [ ] **Signal Diagnostics**
  - [ ] Failed signal analysis
  - [ ] False positive detection
  - [ ] Rule tuning tools
  - [ ] Baseline adjustment

### Premium Features
- [ ] **Member Program Integration**
  - [ ] Membership eligibility check
  - [ ] Member price comparison
  - [ ] Membership rule support

- [ ] **Advanced Analytics**
  - [ ] Cost per active user
  - [ ] Savings tracking
  - [ ] Shopping behaviour insights

- [ ] **TestFlight Pipeline**
  - [ ] iOS TestFlight distribution
  - [ ] Android closed testing
  - [ ] Beta feedback collection
  - [ ] Crash reporting

### International (Future)
- [ ] **Multi-Currency Support**
- [ ] **International Retailers**
- [ ] **Localisation**

---

## Definition of Done

Each task is complete when:
- [ ] Implementation is finished
- [ ] Unit tests written and passing
- [ ] Integration tests written and passing
- [ ] Linting passes
- [ ] Formatting is correct
- [ ] Loading states implemented
- [ ] Error states implemented
- [ ] Privacy-safe telemetry added
- [ ] Documentation updated
- [ ] Regression tests added
- [ ] Accessibility verified
- [ ] Mobile: offline safety verified

---

## Sprint Planning

### Sprint 1 (Week 1-2): Foundation
- Design system
- Authentication
- Database schema
- Mobile shell
- CI/CD setup

### Sprint 2 (Week 3-4): Vertical Slice
- Barcode scanning
- Product resolution
- Watchlist
- Signal rules
- Mock signal flow

### Sprint 3 (Week 5-6): Retailers & History
- Adapter framework
- First retailer integration
- Price history
- Deal confidence

### Sprint 4 (Week 7-8): Household & Polish
- Household invites
- Shared lists
- Notification preferences
- Accessibility
- Dark mode polish

### Sprint 5 (Week 9-10): Beta Prep
- Unknown barcode submission
- Mismatch reporting
- Alcohol features
- Admin dashboard
- Security review

### Sprint 6 (Week 11-12): Closed Beta
- Testing pipeline
- Cost measurement
- Support tools
- Backup restore exercise
- Launch preparation
