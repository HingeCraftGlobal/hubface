# Bot Room token pricing spec

Status: DRAFT, spec only. Nothing here is wired into billing, balances or the live meter yet.
Source: Dan, voice call cf4b3242, Oct 26 2026.

## Pricing rule (Bot Room tokens)

| Tier | Price | Tokens | Price per token | Voice minutes (2 tokens/min) | Text-only minutes (1 token/min) |
|------|-------|--------|-----------------|------------------------------|---------------------------------|
| $5 plan  | $5.00  | 500   | $0.01 | about 250   | about 500   |
| $20 tier | $20.00 | 2,000 | $0.01 | about 1,000 | about 2,000 |
| $50 tier | $50.00 | 5,000 (confirmed by Dan) | $0.01 | about 2,500 | about 5,000 |
| $100 tier | $100.00 | 10,000 at 1¢ (OPEN: per seat or per account; not offered yet) | $0.01 | about 5,000 | about 10,000 |

Price rule: every monthly token purchase is full price at one penny (1¢) per token. NO volume discounts on any tier ($5, $20, $50, $100, custom).

Custom amount: any whole-dollar amount from $5 upward, in $1 steps, at 1¢ per token with no discount
($5 = 500 tokens; each extra $1 = 100 tokens). No business upper limit; input validation caps it at 7 digits ($9,999,999) as a
technical limit only. Whole dollars only, minimum $5.

Usage rates:
- Text-only Bot Room use: 1 token per minute.
- Voice in use: 2 tokens per minute.

## Layering: on top of the existing plans

Bot Room tokens sit ON TOP of the current HingeHub and HubFace plans. They do NOT replace them.
The existing HingeHub / HubFace plans stay monthly subscriptions for using HubFace. Bot Room tokens
are an additional purchase for Bot Room usage.

## Open questions

1. $100 tier (10,000 tokens at 1¢): per seat or per account? Stays off the buy screen until answered. ($50 = 5,000 tokens is confirmed.)
2. Unit overlap: the existing HingeHub token is a different unit (1 token = 15 minutes of room time,
   $6 per extra token; balances are stored in minutes in room_time). How do Bot Room tokens (1 cent,
   1 or 2 per minute) relate to it? Separate balance, or converted into the same minute balance?
   Today the Bot Room meter draws from the HingeHub minute balance (BOTMETER_UNIT_MIN = 1 balance
   minute per metered minute). Unchanged by this spec.

## Buy screen (Bot Room)
Shows $5, $20, $50 and a custom amount; $100 muted "coming soon". Checkout is NOT connected: buttons show "Checkout isn't connected yet", log the intent, charge nothing and change no balance.

## Not changed by this spec
- Live meter rate (BOTMETER_UNIT_MIN), balances, plans, prices, Stripe/billing code.

## Mock checkout (test mode) - added 2026-10-26

- Switch: `BUY_MODE` at the top of `/var/www/botroom/br-buy-20261026a.js`. `'mock'` = TEST MODE mock checkout; `'off'` = the old "Checkout isn't connected yet" notice plus intent log.
- Two paths, picked on the Buy tokens screen: **One-time extra tokens** (`kind: one_time`) and **Monthly token plan** (`kind: monthly`, 1¢/token, same tiers and custom amount; mock only, "would renew in 30 days", no recurring billing).
- The checkout step has a "TEST MODE - no real money moves" banner, fields for card number, expiry, CVC and ZIP, a **Fill test card** button (4242 4242 4242 4242, a future expiry, 123, 12345) and a Pay (test) button. Any other card number is rejected and cleared. No card data is sent or stored, only last4 4242.
- Pay posts to `POST /api/account/botmeter/buy-test-order` (signed-in, same-origin, 20/min). The endpoint only appends a test record to `/var/lib/hubface/buy-test-orders.jsonl` (uid, room, kind, tier, dollars, tokens, test:true, balance_change:0, renews). It does not call Stripe, add tokens, or change any balance, plan or BOTMETER_UNIT_MIN.
- Real Stripe later would need: Stripe account and keys (none exist yet), a server endpoint that creates a Checkout Session (payment mode for one-time, subscription mode with Prices for monthly), a signed webhook (`checkout.session.completed`, `invoice.paid`) that is the only thing that credits tokens, idempotency on the session id, and a decision on the $100 tier. Replace `mockPay()` with a redirect to the Session URL, and set `BUY_MODE` to `'stripe'`.
