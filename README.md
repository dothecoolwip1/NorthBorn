# Northborn

Northborn is a cross platform field operations platform for trucking, hydrovac, vacuum, steaming, water hauling, environmental, construction, oilfield and industrial service companies.

## Foundation 0.2

- React + TypeScript + Vite
- Supabase backend
- Multi tenant organization model
- Role based permissions
- Row level security on all current public tables
- Audit logging foundation
- Customers, employees, fleet, jobs and dispatch operational slice
- Live schema synchronized TypeScript database definitions
- Git tracked database migrations
- Automated GitHub Actions build verification
- Responsive desktop and mobile shell
- Capacitor ready native wrapper configuration
- Vercel ready SPA routing
- PowerSync selected for the future offline synchronization layer

See `docs/TECHNICAL_FOUNDATION.md` for the architecture baseline, migration rules and remaining external setup.

## Functional test workspace

Northborn uses dedicated Supabase Auth test identities connected only to an isolated functional test workspace. The manager, operator and client test personas are never intended for real operational use.

Functional test workspace repair and internal role switching are restricted to those dedicated test identities. Production and pull request QA use the same isolated workspace to verify authentication, navigation, role boundaries and core field flows.
