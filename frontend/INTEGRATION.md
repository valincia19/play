# Frontend - Backend Integration

The frontend has been updated to communicate with the backend authentication API.

## Environment Configuration

### Environment Variables (.env)

Create `.env` file from `.env.example`:

```bash
# Backend API URL
VITE_API_BASE_URL=http://localhost:4000

# Application URL (for email verification links)
VITE_APP_URL=http://localhost:3000

# Frontend URL (for CORS)
VITE_FRONTEND_URL=http://localhost:5173
```

### Environment Variables in Code

The API client uses `import.meta.env.VITE_API_BASE_URL` to get the backend URL.

**Fallback:** If `VITE_API_BASE_URL` is not set, it defaults to `http://localhost:4000`

This means the frontend works even without `.env` file for local development.

## Changes Made

### 1. Created API Client (`src/lib/api.ts`)

A TypeScript API client with:
- Type-safe interfaces for all request/response types
- Centralized error handling with `ApiError` class
- Proper response parsing and validation
- Support for all auth endpoints: register, login, verify
- **Environment variable support** with fallback

### 2. Updated Login Page (`src/pages/login.tsx`)

**Changes:**
- Removed mock API call
- Added real API call to `/auth/login`
- Token storage in localStorage (accessToken, refreshToken)
- Redirect to dashboard on successful login
- Error display with user-friendly messages

### 3. Updated Register Page (`src/pages/register.tsx`)

**Changes:**
- Removed mock API call
- Added real API call to `/auth/register`
- Success message with alert on registration
- Redirect to verify info page with success message

### 4. Updated Auth Form Component (`src/components/auth/auth-form.tsx`)

**Changes:**
- Added `error` prop to display validation errors
- Added error message display with Badge component
- Enhanced form with visual feedback for errors

### 5. Created Verify Pages

**New Pages:**
- `src/pages/verify.tsx` - Email verification page
  - Reads token from URL query parameter
  - Calls API to verify
  - Displays loading, success, and error states
  - User-friendly error messages
  - Navigation buttons

- `src/pages/verify-info.tsx` - Verification info page (shown after registration)
  - Displays instructions to check email
  - Clean, user-friendly design
  - "Go to Login" button

**Modified Files:**
- `src/App.tsx` - Added `/auth/verify` and `/verify-info` routes

### API Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/auth/register` | POST | User registration with email verification |
| `/auth/verify?token=xxx` | Verify email address |
| `/auth/login` | POST | User login (requires verified email) |

## Configuration

**Backend URL:** Configured via `VITE_API_BASE_URL` (default: `http://localhost:4000`)

**Note:** The API client automatically falls back to `http://localhost:4000` if `VITE_API_BASE_URL` is not set.

## Error Codes

The API returns specific error codes that are displayed to users:

| Code | Meaning |
|------|---------|
| `INVALID_NAME` | Name must be between 2 and 100 characters |
| `INVALID_EMAIL` | Invalid email address |
| `INVALID_PASSWORD` | Password must be at least 8 characters |
| `DISPOSABLE_EMAIL` | Disposable email addresses are not allowed |
| `EMAIL_EXISTS` | Email address already registered |
| `INVALID_CREDENTIALS` | Invalid email or password |
| `USER_NOT_VERIFIED` | Please verify your email before logging in |
| `INVALID_TOKEN` | Invalid verification token |
| `TOKEN_EXPIRED` | Verification token has expired |

## Token Storage

After successful login, tokens are stored in localStorage:
- `accessToken` - Used for API authentication
- `refreshToken` - Used for obtaining new access tokens

## Development Servers

**Frontend:** http://localhost:5173 (Vite dev server)
**Backend:** http://localhost:4000 (Bun + Elysia)
**Database:** postgres://localhost:5432 (PostgreSQL in Docker)
**Cache:** redis://localhost:6379 (Redis in Docker)

## Testing Flow

1. Navigate to http://localhost:5173/register
2. Fill in registration form with valid data
3. Check backend console for email verification link
4. Copy the verification link from the console
5. Visit: http://localhost:3000/auth/verify?token=xxx (or open the link directly)
6. Navigate to http://localhost:5173/login
7. Login with verified credentials
8. Successfully redirected to Dashboard

## Files Modified

```
frontend/
├── src/
│   ├── lib/
│   │   ├── api.ts          # API client with env support
│   │   └── api.test.ts      # Integration tests
│   ├── components/
│   │   └── auth/
│   │       ├── auth-form.tsx   # Added error display
│   │       └── auth-card.tsx
│   ├── pages/
│   │   ├── login.tsx             # Real API integration
│   │   ├── register.tsx          # Real API integration
│   │   ├── verify.tsx            # [NEW] Verification page
│   │   └── verify-info.tsx        # [NEW] Verification info page
│   └── App.tsx               # Added new routes
├── .env                 # Environment variables
├── .env.example          # Environment template
└── .gitignore            # Added .env exclusions
```

## Next Steps (Optional)

1. **Add token refresh logic** - Implement automatic token refresh when access token expires
2. **Add protected routes** - Create middleware to check authentication status
3. **Add logout functionality** - Clear tokens and redirect to login
4. **Add forgot password flow** - Implement password reset email flow
5. **Add loading states** - Show loading skeleton for better UX
