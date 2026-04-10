# Vercelplay Admin Studio

The Admin Studio is a highly-privileged, internal management panel for regulating platform resources, managing users, and overseeing financial transactions.

## Architecture & Permissions

**Access Level:** 
All API paths under `/admin/*` and frontend paths under `/studio/*` are strictly protected by Role-Based Access Control (RBAC).
- `User.role === 'admin'` check is verified securely against the active JWT token via the `authService.verifyJwtToken` backend middleware.

## Core Modules & Capabilities

### 1. Plan Management (`/studio/plans`)
- **Capabilities:** Displays global billing tiers and packages.
- **Actions:** 
  - Create, Modify, and Delete plans dynamically.
  - Active toggle configuration without touching database schemas directly.
- **Backend Flow:** Requests hit `GET/POST/PUT/DELETE /admin/plans` which are mapped internally to `BillingService` template controllers, instantly causing Redis cache invalidation (`invalidatePlansCache()`).

### 2. User Management (`/studio/users`)
- **Capabilities:** Lists all accounts on the platform. Exposes high-level administrative functions directly to individual targets.
- **Actions:**
  - **Edit User**: Alter roles between `user` and `admin`. Suspend uncooperative users via `status`.
  - **Give Plan**: Bypasses the payment gateway and forcefully seeds an active subscription matrix into a target user's account. This executes an instant snapshot payload of the Plan into the `subscriptions` table.
- **Backend Flow:** 
  - `adminService.givePlan` seeds new snapshot and logs a `give` payload into the Transactions table.

### 3. Transactions Board (`/studio/transactions`)
- **Capabilities:** Global audit layer tracking all subscription events.
- **Scope:** Logs `type='purchase'`, `type='renew'`, and `type='give'`. Essential for finance/support.

## API Endpoints Reference

| Route | Method | Payload | Function |
|-------|--------|---------|----------|
| `/admin/users` | GET | None | Fetch all registered accounts and statuses |
| `/admin/users/:id` | PUT | `{ role, status, planId }` | Manipulate user state |
| `/admin/give-plan` | POST | `{ userId, planId, durationDaysOverride }` | Forces manual subscription snapshot injection |
| `/admin/transactions` | GET | None | Fetch general history with associated user emails |
| `/admin/plans` | GET/POST | Plan Object | Create or inspect current templates |
| `/admin/plans/:id` | PUT/DELETE | Plan Object | Manipulate core templates |

## Important Edge Cases
- When an administrator issues a "Give Plan" invocation, a mock Transaction (`type='give'`, `amount=0`) is safely forged to retain historic continuity.
- Plans modified in `/admin/plans` DO NOT disrupt current users. Due to out "snapshot" architecture adopted previously, changes only impact future clients, whereas current subscribers possess a frozen instance of limits.
