# Repository Assessment

**Date:** 2026-09-30  
**Purpose:** Initial baseline assessment for ShelfSignal implementation

## Current State

### Repository Structure
- Single `Docs/` folder with Master Prompt
- No existing codebase
- Clean slate for new implementation

### Key Findings

1. **No Legacy Code to Preserve**
   - No StapleWatch or PricePilot code found
   - Clean migration path
   - Can implement from specification

2. **Specification Completeness**
   - Master Prompt is comprehensive (31 sections)
   - Clear MVP scope defined
   - Technical architecture specified
   - Data model documented
   - API outline provided

3. **Market Positioning**
   - Trade mark search required before commercial release
   - No existing ShelfSignal code in workspace
   - Clear differentiation from competitors established

## Recommended Next Steps

### Phase 1: Foundation (Week 1-2)
1. Establish repository boundaries and CI/CD
2. Create design tokens and theme system
3. Implement authentication (Sign in with Apple, Google, email)
4. Set up PostgreSQL schema for core entities
5. Create Flutter mobile shell (iOS + Android)
6. Implement basic navigation with GoRouter

### Phase 2: Vertical Slice (Week 3-4)
1. Barcode scanning with mobile_scanner
2. Product resolution and canonical matching
3. Watchlist CRUD operations
4. Signal rule configuration
5. Mock offer ingestion and signal evaluation
6. Test push notification delivery

### Phase 3: Retailer Integration (Week 5-6)
1. Implement retailer adapter framework
2. Integrate first validated retailer (Coles or Woolworths)
3. Implement price history storage
4. Add observed baseline calculation
5. Implement deal-confidence labels

## Technical Decisions Made

### Mobile
- **Flutter** with Riverpod for state management
- **GoRouter** for navigation
- **Drift/SQLite** for local caching
- **mobile_scanner** for barcode capture
- **firebase_messaging** for push notifications

### Backend
- **FastAPI** for Python backend
- **PostgreSQL** for primary database
- **Docker Compose** for local development
- **Caddy** for reverse proxy and TLS
- **GitHub Actions** for CI/CD

### Admin
- **Next.js** with TypeScript
- Role-based access control
- Product moderation queue
- Signal diagnostics dashboard

## Open Questions

1. **Retailer Data Access**
   - Need to validate authorised API access for at least 2 retailers
   - Scrape vs authorised feed decision pending
   - Terms of service review required

2. **Cloudflare Usage**
   - DNS and CDN only for MVP
   - Avoid Durable Objects and Browser Run (usage-billed)
   - Keep within free-tier allowances

3. **Alcohol Features**
   - Adult opt-in flow required
   - Age verification before alcohol category access
   - Responsible service messaging mandatory

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Retailer data access blocked | High | Modular adapter design, prefer authorised sources |
| Barcode coverage gaps | Medium | Unknown barcode submission flow, open databases |
| Notification fatigue | Medium | Cooldowns, meaningful defaults, digest mode |
| One-time revenue sustainability | Medium | Batch ingestion, shared observations, cost telemetry |
| Trade mark conflict | High | Professional search before commercial release |

## Success Metrics (Phase 1)

- [ ] Repository builds locally on Windows
- [ ] CI pipeline passes formatting, linting, tests
- [ ] Authentication flow works (email + Apple + Google)
- [ ] PostgreSQL migrations apply successfully
- [ ] Flutter app launches on iOS simulator and Android emulator
- [ ] Design tokens implemented in both light and dark modes
