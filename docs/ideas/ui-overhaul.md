# WrapVisualizer UI Overhaul

## Problem Statement
How might we transform WrapVisualizer's frontend from an AI-generated-looking prototype into a polished, conversion-optimized vehicle wrap visualization tool that feels like a premium Nairobi wrap shop's digital showroom?

## Recommended Direction
**"The Automotive Atelier"** — A cinematic, editorial-style redesign that borrows visual language from luxury automotive brands (Porsche Configurator, Tesla Design Studio) while maintaining the existing dark theme and orange/green brand palette.

### What's Wrong Now (Idea-Refine Analysis)
1. **AI Aesthetic**: Uniform card grids, generic hero, repetitive layouts across screens
2. **Fake imagery**: All images are Google Stitch AI-generated — no real vehicle wraps shown
3. **Flat hierarchy**: Everything looks the same importance — no clear visual flow guiding users toward WhatsApp conversion
4. **Dense text**: Too many uppercase tracking-widest labels competing for attention
5. **Mobile cramped**: Template cards are too small, upload zone too hidden
6. **No social proof**: No gallery, no testimonials, no before/after — nothing that says "real business"

### Design Principles (Frontend-UI-Engineering Applied)
1. **Content-first layouts** — Not card grids. Use full-width hero imagery, asymmetric layouts
2. **Real photography** — Unsplash vehicle photos to replace AI placeholders
3. **Breathing room** — Generous whitespace between sections, less visual noise
4. **Clear conversion funnel** — Every screen drives toward WhatsApp CTA
5. **Mobile-first polish** — Touch targets 48px+, thumb-friendly bottom actions
6. **Maintain theme** — Keep dark bg (#131313), orange (#FF6B00), green (#06C85D), Space Grotesk + Manrope

## Key Assumptions to Validate
- [ ] Real wrap shop photos will increase trust — test with user feedback
- [ ] Simplified hero messaging converts better than "BEYOND SURFACES"
- [ ] Before/after gallery section increases WhatsApp click-through

## MVP Scope
- Overhaul all 4 screens with improved layouts, real photos, better typography hierarchy
- Add portfolio/gallery showcase section on Screen 1
- Improve mobile responsiveness at 320px-768px breakpoints
- Maintain all existing JS functionality (sessionStorage flow, WhatsApp links, API calls)
- Keep the same file structure and Tailwind CDN approach

## Not Doing (and Why)
- **React/framework migration** — Adds complexity, the HTML+Tailwind approach works fine for 4 pages
- **Self-hosted Tailwind build** — Good optimization but separate concern from UI overhaul
- **Backend changes** — API layer is solid at 8.5/10, leave it alone
- **Real segmentation feature** — Needs Replicate credits, separate task
- **Payment integration** — Business model is WhatsApp-first, no payments needed
