# Creator Withdraw Button Feature

## Overview
This feature adds a visible "💰 Retirar dinero" (Withdraw money) button for approved creators in their dashboard, connected to the existing payout request system.

## Implementation

### Frontend Changes (`frontend/app/dashboard/creator/page.jsx`)

1. **Button Text**: Updated from "Solicitar retiro" to "💰 Retirar dinero"
2. **API Endpoint**: Updated to use `/api/creator/request-payout`
3. **Success Message**: Changed to "Solicitud de retiro enviada"
4. **Minimum Withdrawal Message**: Simplified to "Mínimo para retiro: 100 monedas"

### Backend Changes (`backend/src/routes/creator.routes.js`)

1. **Route Alias**: Added `/api/creator/request-payout` as an alias to the existing `/api/creator/payout` endpoint
   - Both routes point to the same `requestPayout` controller function
   - Both require approved creator status via `requireApprovedCreator` middleware

## Access Control

### Who Can See the Withdrawal Section?

✅ **Approved Creators**: Users with `role === "creator"` AND `creatorStatus === "approved"`
✅ **Approved Sub-Creators**: Users with `role === "subCreator"` AND `creatorStatus === "approved"`

❌ **Normal Users**: Users with `role === "user"` (no creator status)
❌ **Pending Creators**: Users with `creatorStatus === "pending"` or `creatorStatus === "rejected"`
❌ **Suspended Creators**: Creators whose accounts have been suspended

### How Access Control Works

1. **Page Access**: The page itself is not protected - anyone can navigate to `/dashboard/creator`
2. **Backend Protection**: The `/api/creator/dashboard` endpoint requires the `requireApprovedCreator` middleware
3. **Error Handling**: Non-approved users receive a 403 error, which displays an error message with a link back to the main dashboard

## Withdrawal Features

### Balance Display
- Shows `earningsCoins` (available balance in coins)
- Shows estimated USD value (1 coin = $0.10 USD)
- Icon: 💵

### Withdrawal Button
- Text: "💰 Retirar dinero"
- Disabled if balance < 100 coins
- Changes to "Cancelar" when form is open

### Minimum Withdrawal
- Minimum: 100 coins
- Warning message shown when balance is insufficient

### Withdrawal Form Fields
1. **Payment Method** (required):
   - PayPal
   - Zelle
   - Bank Transfer (Transferencia bancaria)
   - Stripe Connect
   - Other (Otro)

2. **Payment Details** (optional):
   - Text area for email, account number, etc.
   - Min 5 characters if provided
   - Max 500 characters

### States Handled
- ✅ **Loading**: Shows "Procesando..." on submit button
- ✅ **Success**: Green banner with "Solicitud de retiro enviada"
- ✅ **Error**: Red banner with backend error message
- ✅ **Insufficient Balance**: Button disabled with opacity
- ✅ **Pending Payout**: Backend returns 409 conflict with existing payout details

### After Successful Submission
1. Form closes automatically
2. Dashboard data refreshes (new balance = 0)
3. Payout history updates with new request
4. Success message displays

## Payout History

Shows the last 5 payouts with:
- Amount in coins
- Date and payment method
- Status badge (color-coded):
  - 🟢 **Pagado** (Paid) - Green
  - 🔵 **Aprobado** (Approved) - Blue
  - 🔴 **Rechazado** (Rejected) - Red with rejection reason
  - 🟡 **Pendiente** (Pending) - Yellow

## Validation

### Frontend Validation
- Button disabled if balance < 100 coins
- Payment method required (dropdown)
- Payment details optional, but must be 5+ chars if provided

### Backend Validation (Zod Schema)
```javascript
{
  method: enum ["zelle", "paypal", "bank", "stripe", "other"] (default: "stripe"),
  paymentDetails: string (optional, min 5 chars if provided)
}
```

### Backend Business Logic
1. Checks user is approved creator (middleware)
2. Checks minimum 100 coins available
3. Checks no pending/approved payout exists
4. Atomically reserves coins (sets `earningsCoins` to 0)
5. Creates payout record with status "pending"
6. Returns success with payout details

### Backend Error Responses
- **403**: Not an approved creator
- **400**: Insufficient balance (< 100 coins)
- **409**: Pending payout already exists
- **409**: Balance changed during reservation (race condition)
- **500**: Server error

## Testing Checklist

### Manual Tests
- [ ] Approved creator sees withdrawal section
- [ ] Normal user gets 403 error when accessing page
- [ ] Pending creator gets 403 error when accessing page
- [ ] Button disabled when balance < 100 coins
- [ ] Button enabled when balance >= 100 coins
- [ ] Form opens on button click
- [ ] Form closes on "Cancelar" click
- [ ] Can select payment method
- [ ] Can enter payment details (optional)
- [ ] Submit shows loading state
- [ ] Success shows green banner "Solicitud de retiro enviada"
- [ ] Dashboard refreshes after success
- [ ] Payout appears in history after success
- [ ] Cannot submit another payout while one is pending
- [ ] Error messages display for backend errors

### Build Test
```bash
cd frontend && npm run build
```
✅ **Status**: Build passes successfully

## API Endpoints

### GET `/api/creator/dashboard`
- **Auth**: Required (Bearer token)
- **Middleware**: `verifyToken`, `requireApprovedCreator`
- **Returns**: Dashboard data including `earningsCoins`

### POST `/api/creator/request-payout`
- **Auth**: Required (Bearer token)
- **Middleware**: `verifyToken`, `requireApprovedCreator`, `validate(payoutRequestSchema)`
- **Body**: `{ method: string, paymentDetails?: string }`
- **Returns**: Success message and payout details

### GET `/api/creator/payout-history`
- **Auth**: Required (Bearer token)
- **Middleware**: `verifyToken`, `requireApprovedCreator`
- **Query Params**: `page` (default 1), `limit` (default 20, max 50)
- **Returns**: Array of payout records with pagination

## Files Modified

1. `backend/src/routes/creator.routes.js` - Added route alias for `/api/creator/request-payout`
2. `frontend/app/dashboard/creator/page.jsx` - Updated button text, endpoint, and success message
3. `frontend/app/creator/page.jsx` - Updated endpoint to `/api/creator/request-payout` and success message
4. `frontend/components/creator/CreatorQuickActions.jsx` - Updated button text to "💰 Retirar dinero"

## Files Already Present (No Changes Needed)

1. `backend/src/models/Payout.js` - Payout model with proper schema
2. `backend/src/controllers/creator.controller.js` - Payout request logic
3. `backend/src/middlewares/creator.middleware.js` - Access control
4. `backend/src/middlewares/validate.middleware.js` - Request validation
5. `frontend/lib/creatorUtils.js` - `isApprovedCreator` helper function

## Notes

### What Was NOT Touched (As Required)
- ❌ Stripe integration
- ❌ Gift money logic
- ❌ Payout calculation logic
- ❌ Agency commission
- ❌ Auth core
- ❌ Live core

### Existing Features Preserved
- All existing payout logic remains unchanged
- Commission splits still work via agency service
- Platform 40% fee still applies
- Atomic coin reservation prevents race conditions
- Payout approval/rejection by admin still works

## Future Enhancements (Out of Scope)

- Email notifications on payout status changes
- Automatic Stripe Connect payouts
- Partial withdrawals (currently withdraws full balance)
- Withdrawal limits/frequency restrictions
- Multi-currency support
