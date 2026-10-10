# News Intelligence Platform — implementation handoff

Current agreed architecture documents (2026-10-10). Read in numbered order. The original versioned document filenames are included alongside these consistent numbered filenames in the ZIP.

- `001-data-model.md` — original `news-intelligence-architecture-v0.3.md`
- `002-infrastructure.md` — original `news-intelligence-infrastructure-v0.1.md`
- `003-application-stack.md` — original `news-intelligence-application-stack-v0.1.md`
- `004-frontend-platform.md` — original `news-intelligence-frontend-platform-v0.3.md`
- `005-prototype-specification.md` — original `news-intelligence-prototype-specification-v0.3.md`

Final visual decisions remain provisional. Use custom reusable UI components with Tailwind CSS v4, Base UI, semantic design tokens and Playroom; do not use shadcn/ui. The prototype is web-only, but HTTP API contracts must remain compatible with a later Expo/React Native app.
