# Trip Planner API Route Reference

This document describes the request and response contract implemented by the Trip Planner Express backend.

## URLs

| Purpose | Local URL |
| --- | --- |
| Server | `http://localhost:3000` | `https://triptribe-backend-mgl2.onrender.com`
| API base | `http://localhost:3000/api` | https://triptribe-backend-mgl2.onrender.com/api
| Interactive API documentation | `http://localhost:3000/api-docs` | https://triptribe-backend-mgl2.onrender.com/api-docs 
| OpenAPI 3.1 JSON | `http://localhost:3000/api-docs/openapi.json` | https://triptribe-backend-mgl2.onrender.com/api-docs/openapi.json

In a deployed environment, replace `http://localhost:3000` with the deployed backend origin. All route paths below are relative to `/api`.

## Common request rules

### Authentication

Unless a route is explicitly marked **Public**, send a Clerk session JWT:

```http
Authorization: Bearer <clerk-session-jwt>
```

Authenticated handlers resolve the Clerk identity to a local MongoDB `User`. After the first Clerk sign-in, call `POST /users/sync`. If the Clerk identity is valid but no matching local user exists, protected routes return `404` with `{"message":"User not found in DB"}`.

`POST /users/sync` is the one route that deliberately runs without `protect` — it is what creates the local user that `protect` looks up — so it checks the Clerk session directly instead. Without a valid session it returns `401`.

Every route that names a trip also requires the caller to be a member of that trip. The trip is resolved from the URL, or from the itinerary day when a request names one, so pairing another trip's id with a day you can reach does not work. A non-member gets `403`.

### Content types

- JSON routes: `Content-Type: application/json`
- Raw file upload: `Content-Type: multipart/form-data`; the field name must be `file`.
- `POST /files/upload-raw` takes one query parameter, `scope`. Everything else is path or body.

### Primitive formats

| Type | Wire representation |
| --- | --- |
| `MongoId` | String matching `^[a-fA-F0-9]{24}$` |
| `DateTime` | ISO 8601 string, for example `2026-10-02T00:00:00.000Z` |
| `URI` | Absolute URL string |
| `Money` | JSON number; no automatic smallest-unit conversion |
| `FileSize` | Integer number of bytes |

### Enums

| Type | Accepted values |
| --- | --- |
| `TripRole` | `owner`, `editor`, `viewer` |
| `ActivityType` | `Flight`, `Hotel`, `Food`, `Sightseeing`, `Activity`, `Shopping`, `Transport`, `Other` |
| `ExpenseCategory` | `Food`, `Transport`, `Activities`, `Shopping`, `Hotel`, `Other` |
| `SplitType` | `equally`, `selected`, `none` |
| `FileCategory` | `Bookings`, `Tickets`, `Photos`, `Guides`, `General` |

Enum values and route casing are case-sensitive.

## Common response rules

Most successful object responses use:

```json
{
  "success": true,
  "data": {}
}
```

List responses may also include `count`:

```json
{
  "success": true,
  "count": 2,
  "data": []
}
```

Errors can have either shape because middleware and controllers do not all use the same error formatter:

```json
{
  "success": false,
  "message": "Readable error message"
}
```

```json
{
  "success": false,
  "error": "Readable error message",
  "stack": "Development environment only"
}
```

Authentication middleware can return only:

```json
{
  "message": "Unauthorized"
}
```

Common status codes are:

| Status | Meaning |
| --- | --- |
| `200` | Successful read, update, action, or raw upload |
| `201` | Resource created |
| `400` | Invalid input, validation failure, duplicate, or invalid state |
| `401` | Missing or invalid Clerk authentication |
| `403` | Not a trip member or insufficient trip role |
| `404` | Resource or local user not found |
| `429` | Rate limit exceeded |
| `500` | Unexpected server/controller error |

### Rate limits

Authenticated requests are counted **per user**, not per IP: Indian carriers put many subscribers behind one CGNAT address, and counting by IP meant strangers exhausted each other's budget. Unauthenticated routes are still counted per IP. `GET /sync/:tripId/rev` and AI job polling each have their own bucket, because both are meant to arrive in bursts.

Over the limit:

```json
{
  "success": false,
  "message": "You're doing that too often. Give it a minute and try again.",
  "retryAfterSeconds": 143
}
```

`RateLimit-Limit`, `RateLimit-Remaining` and `RateLimit-Reset` headers come with it. Every limit is a server environment variable (`RATE_LIMIT_MAX`, `RATE_LIMIT_PUBLIC_MAX`, `RATE_LIMIT_SYNC_MAX`, `RATE_LIMIT_JOB_MAX`, `RATE_LIMIT_WINDOW_MS`), and development defaults are far looser than production ones.

### Idempotent creates

`POST /itinerary/addActivity`, `/expenses/add/:tripId`, `/discussion/send` and `/files/finalize` accept a `clientRef`: a key generated **when the user acted**, not when the request was sent. Replaying a create with a key the server has already seen returns the document that exists, with `200` instead of `201`, and emits no second socket event.

This is what makes an offline queue safe. A request can succeed on the server while the response is lost, and the client cannot tell that apart from a genuine failure.

### Staying in sync

Every write bumps a counter for the section it changed and emits one generic `trip_changed` event carrying `{ tripId, section, rev }`. On socket reconnect and on app foreground, call `GET /sync/:tripId/rev` once and refetch only the sections whose number moved.

Do not poll on a timer: it does nothing while the app is backgrounded, where iOS suspends the timer, and it spends the request budget for no benefit.

### File delivery

Trip documents are stored as authenticated Cloudinary assets and have **no permanent URL**. A `TripFile.url` is a signed link valid for ten minutes, minted fresh on every read; `GET /files/:fileId/url` produces another. Do not cache one or write it into a record.

Images the UI renders straight from a URL — trip covers, activity photos, profile pictures — must be uploaded with `?scope=public`, which keeps them on a durable public URL.

## Returned data types

Fields marked “optional” may be absent. Populated reference fields can be either a `MongoId` or the indicated summary object depending on the endpoint.

### `UserSummary`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `_id` | `MongoId` | Yes | Local MongoDB user ID |
| `name` | string | No | Display name |
| `email` | email string | No | Present only when selected by the controller |
| `imageUrl` | URI string | No | Profile image |

### `User`

Includes all `UserSummary` fields.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `clerkId` | string | Yes | Clerk user identifier |
| `isActive` | boolean | Yes | Defaults to `true` |
| `createdAt` | `DateTime` | Yes | Mongoose timestamp |
| `updatedAt` | `DateTime` | Yes | Mongoose timestamp |

### `TripImage`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `url` | URI string | Yes for API requests | Stored image URL |
| `public_id` | string | No | Provider asset identifier |

### `TripMember`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `user` | `MongoId \| UserSummary` | Yes | Usually populated in trip responses |
| `role` | `TripRole` | Yes | Defaults to `viewer` |
| `joinedAt` | `DateTime` | Yes | Defaults to creation time |

### `BudgetCategories`

All fields are numbers greater than or equal to zero.

| Field | Type | Required on budget update |
| --- | --- | --- |
| `Food` | number | Yes |
| `Transport` | number | Yes |
| `Activities` | number | Yes |
| `Hotel` | number | Yes |
| `Shopping` | number | Yes |
| `Other` | number | Yes |

### `Budget`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `total` | number | Yes | Default `6000` |
| `currency` | string | Yes | Default `INR` |
| `categories` | `BudgetCategories` | Yes | Each stored category defaults to `1000` |

### `Trip`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `_id` | `MongoId` | Yes | Trip ID |
| `name` | string | Yes | Trimmed |
| `location` | string | Yes | Trip destination/location |
| `description` | string | No | Free text |
| `image` | `TripImage` | Yes in create/update contract | Cover image |
| `inviteCode` | string | Yes | Automatically generated 8-character lowercase hexadecimal code |
| `members` | `TripMember[]` | Yes | Creator is inserted as owner |
| `startDate` | `DateTime` | Yes | Must not be after `endDate` |
| `endDate` | `DateTime` | Yes | Must not be before `startDate` |
| `budget` | `Budget` | Yes | Uses model defaults until changed |
| `createdBy` | `MongoId \| UserSummary` | Yes | Usually populated |
| `createdAt` | `DateTime` | Yes | Mongoose timestamp |
| `updatedAt` | `DateTime` | Yes | Mongoose timestamp |

### `ActivityComment`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `_id` | `MongoId` | Usually | Embedded comment ID |
| `user` | `MongoId \| UserSummary` | No | Current authenticated user; often populated with `name` and `imageUrl` |
| `text` | string | No at model level | API contract requires non-empty text |
| `createdAt` | `DateTime` | Yes | Defaults to current time |

### `Activity`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `_id` | `MongoId` | Yes | Embedded activity ID |
| `title` | string | Yes | Activity name |
| `time` | string | No | No strict format validation; convention is `HH:mm` |
| `location` | string | No | Free text |
| `type` | `ActivityType` | Yes | Defaults to `Activity` |
| `notes` | string | No | Free text |
| `attachment` | string or `null` | No | Defaults to `null`; normally a URI |
| `isDone` | boolean | Yes | Defaults to `false` |
| `comments` | `ActivityComment[]` | Yes | Defaults to an empty array |
| `createdAt` | `DateTime` | Yes | Embedded schema timestamp |
| `updatedAt` | `DateTime` | Yes | Embedded schema timestamp |

### `ItinerarySection`

| Field | Type | Required |
| --- | --- | --- |
| `_id` | `MongoId` | Yes |
| `section` | string | Yes |
| `activities` | `Activity[]` | Yes |

### `Itinerary`

| Field | Type | Required |
| --- | --- | --- |
| `_id` | `MongoId` | Yes |
| `trip` | `MongoId` | Yes |
| `date` | `DateTime` | Yes |
| `sections` | `ItinerarySection[]` | Yes |
| `createdAt` | `DateTime` | Yes |
| `updatedAt` | `DateTime` | Yes |

### `SplitDetail`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `user` | `MongoId \| UserSummary` | Yes | Debtor |
| `share` | number | Yes | Amount owed to the payer |
| `isSettled` | boolean | Yes | Defaults to `false` |

### `Expense`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `_id` | `MongoId` | Yes | Expense ID |
| `trip` | `MongoId` | Yes | Associated trip |
| `title` | string | Yes | Expense name |
| `description` | string | No | Free text |
| `amount` | number | Yes | Creation contract requires greater than zero |
| `currency` | string | Yes | Model default is `USD` |
| `category` | `ExpenseCategory` | Yes | Defaults to `Other` |
| `paidBy` | `MongoId \| UserSummary` | Yes | Payer |
| `recordedBy` | `MongoId \| UserSummary` | Yes | Current authenticated user |
| `splitType` | `SplitType` | Yes | Defaults to `none` |
| `participants` | `(MongoId \| UserSummary)[]` | Yes | Payer is automatically included |
| `splitDetails` | `SplitDetail[]` | Yes | Excludes payer; empty for `none` |
| `expenseDate` | `DateTime` | Yes | Defaults to current time |
| `createdAt` | `DateTime` | Yes | Mongoose timestamp |
| `updatedAt` | `DateTime` | Yes | Mongoose timestamp |

### `DebtSummary`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `totalDebt` | number | Yes | Sum of unsettled debt entries |
| `yourBalance` | number | Yes | Positive means the current user is owed money; negative means they owe money |
| `debts` | `Debt[]` | Yes | Unsettled, non-zero entries |
| `travelerBalances` | `{ user: UserSummary, balance: number }[]` | Yes | Net balance per traveler |

Each `Debt` contains `from: UserSummary`, `to: UserSummary`, `amount: number`, `title: string`, `recordedBy: MongoId | UserSummary`, and `expenseId: MongoId`.

### `BudgetDashboard`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `totalBudget` | number | Yes | Trip budget total |
| `totalSpent` | number | Yes | Sum of all expense categories |
| `remaining` | number | Yes | Clamped to a minimum of zero |
| `utilization` | number | Yes | Percentage; can exceed 100 |
| `categories` | `BudgetCategoryStat[]` | Yes | One entry per budget category |
| `recentExpenses` | `Expense[]` | Yes | At most five, newest expense date first |

Each `BudgetCategoryStat` contains `category: ExpenseCategory`, `spent: number`, `limit: number`, and `percentage: number`. Category percentage is clamped to `0..100`.

### `ChecklistItem`

| Field | Type | Required |
| --- | --- | --- |
| `_id` | `MongoId` | Yes |
| `title` | string | Yes |
| `completedBy` | `(MongoId \| UserSummary)[]` | Yes |

### `ChecklistCategory`

| Field | Type | Required |
| --- | --- | --- |
| `_id` | `MongoId` | Yes |
| `name` | string | Yes |
| `items` | `ChecklistItem[]` | Yes |

### `Checklist`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `_id` | `MongoId` | No | Absent in the synthetic empty-checklist response |
| `tripId` | string | Yes | The checklist model currently stores this as a string |
| `categories` | `ChecklistCategory[]` | Yes | Empty if no checklist exists |
| `createdAt` | `DateTime` | No | Mongoose timestamp |
| `updatedAt` | `DateTime` | No | Mongoose timestamp |

### `RawUpload`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `url` | URI string | Yes | Only durable for a `scope=public` upload. For a document this URL will not load on its own |
| `public_id` | string | Yes | Cloudinary public ID |
| `originalName` | string | Yes | Original client filename |
| `mimetype` | string | Yes | Uploaded MIME type |
| `size` | integer | Yes | Bytes |
| `resourceType` | `image` \| `video` \| `raw` | No | Cloudinary's classification. PDFs are filed under `image`, not `raw` |
| `deliveryType` | `upload` \| `authenticated` \| `private` | No | `authenticated` for documents |
| `format` | string | No | e.g. `pdf` |

Pass `resourceType`, `deliveryType` and `format` through to `/files/finalize` unchanged.

### `TripFile`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `_id` | `MongoId` | Yes | File record ID |
| `tripId` | `MongoId` | Yes | Associated trip |
| `uploadedBy` | `MongoId \| UserSummary` | Yes | Usually populated with `name` and `imageUrl` |
| `name` | string | Yes | User-facing filename |
| `category` | `FileCategory` | Yes | Defaults to `General` |
| `notes` | string | No | Defaults to empty string |
| `url` | URI string | Yes | A signed URL valid for ten minutes, minted fresh on every read. Do not cache it or store it |
| `urlExpiresAt` | `DateTime` | No | When `url` stops working. Absent on legacy public files |
| `public_id` | string | Yes | Cloudinary public ID |
| `resourceType` | `image` \| `video` \| `raw` | No | |
| `deliveryType` | `upload` \| `authenticated` \| `private` | No | |
| `format` | string | No | |
| `fileType` | string | No | Usually MIME type |
| `fileExtension` | string | No | Derived from text after the last `.` in `name` |
| `size` | number | No | Bytes |
| `createdAt` | `DateTime` | Yes | Mongoose timestamp |
| `updatedAt` | `DateTime` | Yes | Mongoose timestamp |

### `TripRevisions`

| Field | Type | Notes |
| --- | --- | --- |
| `tripId` | `MongoId` | |
| `sections` | object | One integer counter per section: `trip`, `members`, `itinerary`, `expenses`, `budget`, `checklist`, `discussion`, `files`. Monotonically increasing; `0` means never changed |

### `Device`

| Field | Type | Notes |
| --- | --- | --- |
| `_id` | `MongoId` | Pass to `DELETE /devices/:deviceId` |
| `user` | `MongoId` | Owner |
| `token` | string | Expo push token |
| `platform` | `ios` \| `android` \| `web` | |
| `deviceName` | string | Optional |
| `lastSeenAt` | `DateTime` | Updated on every register call |

### `Message`

| Field | Type | Required |
| --- | --- | --- |
| `_id` | `MongoId` | Yes |
| `trip` | `MongoId` | Yes |
| `sender` | `MongoId \| UserSummary` | Yes |
| `text` | string | Yes |
| `createdAt` | `DateTime` | Yes |
| `updatedAt` | `DateTime` | Usually present |

## Route index

| Method | Route | Authentication/role | Success |
| --- | --- | --- | --- |
| GET | `/health` | Public | `200 Health` |
| GET | `/health/detailed` | Public | `200 DetailedHealth` |
| POST | `/users/sync` | Clerk identity required | `200/201 User` |
| GET | `/users/me` | Authenticated | `200 User` |
| PUT | `/users/update` | Authenticated | `200 User` |
| DELETE | `/users/me` | Authenticated | `200 deletion summary` |
| GET | `/users/me/export` | Authenticated | `200 data export` |
| POST | `/trips/create` | Authenticated | `201 Trip` |
| POST | `/trips/join` | Authenticated | `200 Trip` |
| GET | `/trips/my-trips` | Authenticated | `200 Trip[]` |
| GET | `/trips/:tripId` | Trip member | `200 Trip` |
| PUT | `/trips/:tripId` | Owner or editor | `200 Trip` |
| PATCH | `/trips/:tripId/role` | Owner | `200 Trip` |
| PATCH | `/trips/:tripId/budget` | Owner or editor | `200 Budget` |
| POST | `/itinerary/addActivity` | Trip member | `201 Itinerary` (`200` on replay) |
| GET | `/itinerary/getTripItinerary/:tripId` | Trip member | `200 itinerary data` |
| POST | `/itinerary/activity/status` | Trip member | `200 Itinerary` |
| POST | `/itinerary/activity/comment` | Trip member | `200 Itinerary` |
| DELETE | `/itinerary/activity/:itineraryId/:activityId/:tripId` | Trip member | `200 Itinerary` |
| POST | `/expenses/add/:tripId` | Owner or editor | `201 Expense` (`200` on replay) |
| GET | `/expenses/debts/:tripId` | Trip member | `200 DebtSummary` |
| GET | `/expenses/trip/:tripId/debts` | Trip member; deprecated alias | `200 DebtSummary` |
| POST | `/expenses/settle` | The expense's payer only | `200 message` |
| GET | `/expenses/budgetDashBoard/:tripId` | Trip member | `200 BudgetDashboard` |
| POST | `/checklist/addItems/:tripId` | Owner or editor | `200 Checklist` |
| GET | `/checklist/fetchLists/:tripId` | Trip member | `200 Checklist` |
| POST | `/checklist/:tripId/checklist/:categoryId/items/:itemId` | Trip member | `200 ChecklistItem` |
| POST | `/files/upload-raw` | Authenticated | `200 RawUpload` |
| POST | `/files/finalize` | Trip member | `201 TripFile` (`200` on replay) |
| GET | `/files/:fileId/url` | Trip member | `200 signed URL` |
| GET | `/files/:tripId` | Trip member | `200 TripFile[]` |
| GET | `/discussion/:tripId` | Trip member | `200 Message[]` |
| POST | `/discussion/send` | Trip member | `201 Message` (`200` on replay) |
| GET | `/sync/:tripId/rev` | Trip member | `200 TripRevisions` |
| POST | `/devices/register` | Authenticated | `200 Device` |
| DELETE | `/devices/:deviceId` | Authenticated | `200 message` |

## Health routes

### `GET /health`

Public health snapshot. No parameters or request body.

**`200` response:**

| Field | Type |
| --- | --- |
| `success` | literal `true` |
| `message` | string |
| `timestamp` | `DateTime` |
| `uptime` | number in seconds |
| `environment` | string |
| `database.status` | `connected \| disconnected` |
| `database.host` | string |
| `memory.used` | string such as `42 MB` |
| `memory.total` | string such as `64 MB` |

Errors: `500`.

### `GET /health/detailed`

Public runtime health snapshot. No parameters or request body.

**`200` response:** all general health fields except `message`, plus:

| Field | Type |
| --- | --- |
| `version` | string; Node.js version |
| `platform` | string |
| `database.name` | string |
| `memory.external` | string such as `8 MB` |
| `cpu.usage.user` | integer microseconds |
| `cpu.usage.system` | integer microseconds |

Errors: `500`.

## User routes

### `POST /users/sync`

Creates the local MongoDB user from the current Clerk user, or returns the existing local user.

- Authentication: valid Clerk identity required.
- Parameters: none.
- Request body: none.
- `200`: `{ success: true, data: User }` when the user exists.
- `201`: `{ success: true, data: User }` when created.
- Errors: `400`, `401`, `404`, `500`.

The created `email`, `name`, and `imageUrl` are read directly from Clerk. See the authentication warning near the top of this file for current unauthenticated behavior.

### `GET /users/me`

Returns the authenticated local user.

- Authentication: required.
- Parameters/body: none.
- `200`: `{ success: true, data: User }`.
- Errors: `401`, `404`, `500`.

### `PUT /users/update`

Updates the authenticated local user's editable profile.

**JSON body:**

| Field | Type | Required |
| --- | --- | --- |
| `name` | string | No |
| `imageUrl` | URI string | No |

```json
{
  "name": "Aarav Sharma",
  "imageUrl": "https://example.com/avatar.jpg"
}
```

- `200`: `{ success: true, data: User }`.
- Errors: `400`, `401`, `404`, `500`.

### `DELETE /users/me`

Deletes the authenticated user's account. Required for App Store and Play Store listing.

- Authentication: required.
- Parameters/body: none.

What happens, in order:

1. **Trips.** Trips where the user is the only member are deleted with their itinerary, expenses, checklist, files, messages and Cloudinary assets. In a shared trip the user owns (with no other owner), ownership passes to the longest-standing editor, or the longest-standing member if there are no editors. The user is removed from every trip's `members`.
2. **Own content.** Their discussion messages, activity comments, checklist ticks (`completedBy`) and uploaded files (record and Cloudinary asset) are deleted.
3. **Shared expenses are kept.** Other members' balances depend on them, so they stay, attributed to the anonymized user.
4. **Anonymization.** The `User` document is kept so every reference stays valid: `name` becomes `Deleted user`, `email` becomes `deleted+<id>@deleted.invalid`, `clerkId` becomes `deleted:<id>`, `imageUrl` is removed and `isActive` is `false`.
5. **Clerk.** The Clerk user is deleted.

**`200` response:** `{ success: true, message: "Account deleted", data }` where `data` is:

| Field | Type |
| --- | --- |
| `tripsDeleted` | `{ _id, name }[]` |
| `ownershipTransferred` | `{ _id, name, newOwner }[]` (`newOwner` is a Mongo `_id`) |
| `tripsLeft` | `{ _id, name }[]` |
| `messagesDeleted` | integer |
| `filesDeleted` | integer |
| `expensesKept` | integer |
| `assetsDestroyed` | integer; Cloudinary cleanup is best effort |
| `signInAccountDeleted` | boolean |

- `502`: the data steps finished but deleting the Clerk user failed; same `data` shape with `signInAccountDeleted: false`. Signing in again creates a fresh empty local user, and calling this route again finishes the deletion.
- Errors: `401`, `404`, `500`, `502`.

### `GET /users/me/export`

Returns a copy of the authenticated user's own data.

- Authentication: required.
- Parameters/body: none.
- `200`: `{ success: true, data }` with `exportedAt`, `profile`, `trips` (each with the user's own `role` and `joinedAt`, not the roster), `messages`, `activityComments`, `checklistItemsCompleted`, `expenses` (with `youPaid` and the user's own `yourShare` only) and `files`.
- Errors: `401`, `404`, `500`.

## Trip routes

### `POST /trips/create`

Creates a trip. The current user becomes its owner and an invite code is generated automatically.

**JSON body:**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `name` | string | Yes | Non-empty |
| `location` | string | Yes | Non-empty |
| `description` | string | No | Free text |
| `image` | `TripImage` | Yes | Controller checks object presence |
| `startDate` | `DateTime` | Yes | Start of trip |
| `endDate` | `DateTime` | Yes | Must be on/after start date |

```json
{
  "name": "Goa Getaway",
  "location": "Goa, India",
  "description": "A long weekend by the sea.",
  "image": {
    "url": "https://example.com/goa.jpg",
    "public_id": "trips/goa"
  },
  "startDate": "2026-10-02T00:00:00.000Z",
  "endDate": "2026-10-05T00:00:00.000Z"
}
```

- `201`: `{ success: true, data: Trip }`.
- `400`: missing required field, invalid date order, or model validation error.
- Other errors: `401`, `404`, `500`.

### `POST /trips/join`

Joins an existing trip as a `viewer` and emits Socket.IO event `member_joined`.

**JSON body:**

| Field | Type | Required |
| --- | --- | --- |
| `inviteCode` | string | Yes |

```json
{ "inviteCode": "a1b2c3d4" }
```

- `200`: `{ success: true, data: Trip }` with populated creator and members.
- `400`: user already belongs to the trip.
- `404`: invalid invite code.
- Other errors: `401`, `500`.

### `GET /trips/my-trips`

Returns trips containing the current user, sorted by `createdAt` descending.

- Parameters/body: none.
- `200`: `{ success: true, count: integer, data: Trip[] }`.
- Authentication errors: `401`, `404`; server errors: `500`.

### `GET /trips/:tripId`

Returns one trip only if the current user is a member.

| Path parameter | Type | Required |
| --- | --- | --- |
| `tripId` | `MongoId` | Yes |

- `200`: `{ success: true, data: Trip }` with populated creator and members.
- `404`: trip not found or access denied.
- Other errors: `401`, `500`.

### `PUT /trips/:tripId`

Updates a trip. Requires the `owner` or `editor` role.

| Path parameter | Type | Required |
| --- | --- | --- |
| `tripId` | `MongoId` | Yes |

**JSON body:**

Only the fields present in the body are written. Send what changed.

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `tripName` | string | No | Stored in `Trip.name`. `name` is accepted as an alias |
| `description` | string | No | Written as sent, including an empty string |
| `startDate` | `DateTime` | No | |
| `endDate` | `DateTime` | No | Rejected with `400` if it falls before the start date |
| `coverImage` | `TripImage` | No | `url` and `public_id` are each updated only when present |
| `members` | `{ _id: MongoId, role: TripRole }[]` | No | Replaces the complete members array, but only when a non-empty one is sent |
| `place` | `Place` | No | Structured destination, normally written by the AI planner |
| `theme` | string | No | Trip archetype, normally written by the AI planner |

```json
{
  "tripName": "Goa Getaway 2026",
  "description": "Updated itinerary and dates.",
  "startDate": "2026-10-02T00:00:00.000Z",
  "endDate": "2026-10-06T00:00:00.000Z",
  "coverImage": {
    "url": "https://example.com/goa-new.jpg",
    "public_id": "trips/goa-new"
  }
}
```

This used to be a full replace, which meant a rename had to re-send the members array or lose it, and omitting `coverImage` threw. Both are fixed: a background job writing `place` cannot revert someone's role change, and partial forms are safe.

- `200`: `{ success: true, message: "Trip updated successfully", data: Trip }`.
- `400`: nothing to update, or the end date precedes the start date.
- `403`: not a member, or role is not owner/editor.
- Other errors: `401`, `404`, `429`, `500`.

### `PATCH /trips/:tripId/role`

Changes one member's role. Requires the `owner` role.

| Input | Type | Required |
| --- | --- | --- |
| Path `tripId` | `MongoId` | Yes |
| Body `userId` | `MongoId` | Yes |
| Body `role` | `TripRole` | Yes |

```json
{
  "userId": "64b64c7f0f1e2d3c4b5a6978",
  "role": "editor"
}
```

- `200`: `{ success: true, data: Trip }`.
- `403`: caller is not a trip owner/member.
- `404`: trip or target member not found.
- Other errors: `400`, `401`, `500`.

### `PATCH /trips/:tripId/budget`

Replaces the trip budget total and complete category object. Requires `owner` or `editor`.

| Input | Type | Required |
| --- | --- | --- |
| Path `tripId` | `MongoId` | Yes |
| Body `total` | number >= 0 | Yes |
| Body `categories` | `BudgetCategories` | Yes |

```json
{
  "total": 60000,
  "categories": {
    "Food": 10000,
    "Transport": 10000,
    "Activities": 10000,
    "Hotel": 20000,
    "Shopping": 5000,
    "Other": 5000
  }
}
```

- `200`: `{ success: true, message: "Budget updated successfully", data: Budget }`.
- Errors: `400`, `401`, `403`, `404`, `500`.

## Itinerary routes

All itinerary routes require authentication, but the current controllers do not independently verify trip membership or a trip role.

### `POST /itinerary/addActivity`

Creates the dated itinerary and/or named section if needed, adds an activity, and emits `activity_added`.

**JSON body:**

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `tripId` | `MongoId` | Yes | Socket room and stored trip reference |
| `section` | string | Yes | Exact matching is used to reuse a section |
| `date` | `DateTime` | Yes | Normalized to the nearest UTC midnight; an existing day anywhere in the surrounding 24 hours is reused |
| `title` | string | Yes | Activity title |
| `time` | string | No | Convention: `HH:mm` |
| `location` | string | No | Free text |
| `type` | `ActivityType` | No | Defaults to `Activity` |
| `notes` | string | No | Free text |
| `attachment` | URI string or `null` | No | Defaults to `null` |
| `clientRef` | string | No | Idempotency key; a replay returns the existing day with `200` and emits nothing |

```json
{
  "tripId": "64b64c7f0f1e2d3c4b5a6978",
  "section": "Morning",
  "date": "2026-10-03T00:00:00.000Z",
  "title": "Visit Basilica of Bom Jesus",
  "time": "09:30",
  "location": "Old Goa",
  "type": "Sightseeing",
  "notes": "Carry water.",
  "attachment": null
}
```

- `201`: `{ success: true, message: "Activity added successfully", data: Itinerary }`.
- `200`: `{ success: true, message: "Activity was already added", data: Itinerary }` when this `clientRef` already exists on the trip.
- Errors: `400`, `401`, `403`, `404`, `429`, `500`.

### `GET /itinerary/getTripItinerary/:tripId`

Returns all dated itineraries sorted by date ascending and the unique section names.

| Path parameter | Type | Required |
| --- | --- | --- |
| `tripId` | `MongoId` | Yes |

**`200` response:**

```text
{
  success: true,
  count: integer,
  data: {
    itinerary: Itinerary[],
    existingSections: string[]
  }
}
```

Activity comment users are populated with `name` and `imageUrl`. An empty database result normally returns `count: 0` with empty arrays.

Errors: `400`, `401`, `404`, `500`.

### `POST /itinerary/activity/status`

Sets one activity's `isDone` value and emits `activity_updated` to the supplied trip room.

| Body field | Type | Required |
| --- | --- | --- |
| `itineraryId` | `MongoId` | Yes |
| `activityId` | `MongoId` | Yes |
| `isDone` | boolean | Yes |
| `tripId` | `MongoId` | Yes |

```json
{
  "itineraryId": "64b64c7f0f1e2d3c4b5a6978",
  "activityId": "64b64c7f0f1e2d3c4b5a6979",
  "isDone": true,
  "tripId": "64b64c7f0f1e2d3c4b5a697a"
}
```

`isDone` is a target state, not a flip: send `true` or `false` explicitly. A flip replayed twice from an offline queue undoes itself, so a missing or non-boolean value is rejected instead of being written through.

- `200`: `{ success: true, data: Itinerary | null }`.
- `400`: `isDone` missing or not a boolean.
- Other errors: `401`, `403`, `404`, `429`, `500`.

### `POST /itinerary/activity/comment`

Adds a comment by the current user to an activity.

| Body field | Type | Required |
| --- | --- | --- |
| `itineraryId` | `MongoId` | Yes |
| `activityId` | `MongoId` | Yes |
| `text` | non-empty string | Yes |

```json
{
  "itineraryId": "64b64c7f0f1e2d3c4b5a6978",
  "activityId": "64b64c7f0f1e2d3c4b5a6979",
  "text": "Let's arrive 15 minutes early."
}
```

- `200`: `{ success: true, data: Itinerary | null }` with populated comment users.
- Errors: `400`, `401`, `404`, `500`.

### `DELETE /itinerary/activity/:itineraryId/:activityId/:tripId`

Deletes an embedded activity and emits `activity_deleted` with `{ itineraryId, activityId }`.

| Path parameter | Type | Required |
| --- | --- | --- |
| `itineraryId` | `MongoId` | Yes |
| `activityId` | `MongoId` | Yes |
| `tripId` | `MongoId` | Yes; used as the Socket.IO room |

- Request body: none.
- `200`: `{ success: true, data: Itinerary }`.
- `404`: `{ success: false }` if itinerary does not exist.
- Other errors: `400`, `401`, `500`.

## Expense routes

### `POST /expenses/add/:tripId`

Adds an expense and emits `expense_added`. Requires `owner` or `editor` according to the URL trip.

| Input | Type | Required | Notes |
| --- | --- | --- | --- |
| Path `tripId` | `MongoId` | Yes | The trip the expense is stored against. Authoritative |
| Body `selectedTripId` | `MongoId` | No | Ignored. Kept only so older clients don't break |
| Body `title` | string | Yes | Expense title |
| Body `description` | string | No | Free text |
| Body `amount` | number > 0 | Yes | Divided equally for `equally` and `selected` |
| Body `category` | `ExpenseCategory` | Yes | Stored category |
| Body `splitType` | `SplitType` | Yes | `none` produces no split details |
| Body `participants` | `MongoId[]` | No | Defaults to `[]`; payer is always added |
| Body `paidBy` | `MongoId` | No | Defaults to current user |
| Body `clientRef` | string | No | Idempotency key; a replay returns the existing expense with `200` |

```json
{
  "title": "Dinner",
  "description": "First-night group dinner",
  "amount": 4200,
  "category": "Food",
  "splitType": "equally",
  "participants": ["64b64c7f0f1e2d3c4b5a6979"],
  "paidBy": "64b64c7f0f1e2d3c4b5a697a"
}
```

Both `equally` and `selected` currently calculate equal shares across the unique participants plus payer. The payer is omitted from `splitDetails`.

- `201`: `{ success: true, data: Expense }`.
- `200`: the same, when this `clientRef` was already recorded.
- `403`: caller is not an owner or editor of the trip.
- Other errors: `400`, `401`, `404`, `429`, `500`.

### `GET /expenses/debts/:tripId`

Returns unsettled debt and net balances. The controller verifies that the current user is a trip member.

| Path parameter | Type | Required |
| --- | --- | --- |
| `tripId` | `MongoId` | Yes |

- `200`: `{ success: true, data: DebtSummary }`.
- `403`: trip not found for the user or access denied.
- Other errors: `400`, `401`, `404`, `500`.

### `GET /expenses/trip/:tripId/debts`

Deprecated compatibility alias for `GET /expenses/debts/:tripId`. It accepts and returns exactly the same data. New clients should use the canonical route.

### `POST /expenses/settle`

Marks a single debtor split on an expense as settled.

| Body field | Type | Required | Notes |
| --- | --- | --- | --- |
| `expenseId` | `MongoId` | Yes | Expense containing the split |
| `userId` | `MongoId` | Yes | Debtor whose split is settled |

```json
{
  "expenseId": "64b64c7f0f1e2d3c4b5a6978",
  "userId": "64b64c7f0f1e2d3c4b5a6979"
}
```

Only the person who paid the expense can settle it against a debtor: they are the one who knows the money arrived.

- `200`: `{ success: true, message: "Debt settled" }`.
- `403`: the caller did not pay this expense.
- `404`: expense or split not found.
- Other errors: `400`, `401`, `429`, `500`.

### `GET /expenses/budgetDashBoard/:tripId`

Returns budget analytics. The `budgetDashBoard` casing must be used exactly as shown.

| Path parameter | Type | Required |
| --- | --- | --- |
| `tripId` | `MongoId` | Yes |

- `200`: `{ success: true, data: BudgetDashboard }`.
- `403`: caller is not a member of the trip.
- Other errors: `400`, `401`, `404`, `429`, `500`.

## Checklist routes

### `POST /checklist/addItems/:tripId`

Adds multiple items to an existing or new checklist category. Requires `owner` or `editor` and emits `checklist_updated`.

| Input | Type | Required | Notes |
| --- | --- | --- | --- |
| Path `tripId` | `MongoId` | Yes | Checklist stores it as a string |
| Body `categoryName` | string | Yes | Category matching is case-insensitive |
| Body `itemNames` | non-empty string array | Yes | Duplicate titles are filtered case-insensitively |

```json
{
  "categoryName": "Essentials",
  "itemNames": ["Passport", "Sunscreen", "Power bank"]
}
```

- `200`: `{ success: true, data: Checklist }`.
- `400`: no non-empty items array, or every requested item already exists.
- Other errors: `401`, `403`, `404`, `500`.

### `GET /checklist/fetchLists/:tripId`

**Public route.** Returns a trip checklist with `completedBy` users populated with `name` and `imageUrl`.

| Path parameter | Type | Required |
| --- | --- | --- |
| `tripId` | `MongoId` by contract; stored/query value is string | Yes |

- `200` when found: `{ success: true, data: Checklist }`.
- `200` when absent: `{ success: true, data: { tripId: string, categories: [] } }`.
- Errors: `500`.

### `POST /checklist/:tripId/checklist/:categoryId/items/:itemId`

Adds or removes the current user in the item's `completedBy` array and emits `task_toggled`.

| Input | Type | Required |
| --- | --- | --- |
| Path `tripId` | `MongoId` | Yes |
| Path `categoryId` | `MongoId` | Yes |
| Path `itemId` | `MongoId` | Yes |
| Body `isChecked` | boolean | Yes |

```json
{ "isChecked": true }
```

- `true`: uses `$addToSet` to add the current user.
- `false`: removes the current user.
- `isChecked` must be present and boolean. A target state replayed twice is harmless; a flip would undo itself, so a missing or non-boolean value is rejected rather than guessed at.
- `200`: `{ success: true, data: ChecklistItem }` with populated `completedBy` users.
- `400`: `isChecked` missing or not a boolean.
- Other errors: `401`, `403`, `404`, `429`, `500`.

## File routes

File creation is a two-step process: upload bytes with `/files/upload-raw`, then send the returned provider values plus editable metadata to `/files/finalize`.

### `POST /files/upload-raw`

Uploads one file to Cloudinary folder `TripTribe` using `resource_type: auto`.

- Authentication: required. No membership check is possible here — the same route uploads trip covers, which are chosen before the trip exists — so the trip is checked at `finalize`.
- Content type: `multipart/form-data`.
- Multipart field: `file` containing one binary file.
- Size limit: 25 MB, rejected locally with `413` before the Cloudinary round trip.

| Query parameter | Values | Default | Meaning |
| --- | --- | --- | --- |
| `scope` | `public`, `document` | `document` | `public` keeps a durable URL, for images rendered directly from one. Anything else stores an authenticated asset with no lasting URL |

**Getting this wrong is silent.** A cover image uploaded without `?scope=public` returns a URL that stops working ten minutes later, and by then it has been written onto the trip. Add `?scope=public` to the cURL call below for covers, activity photos and profile pictures.

Example with cURL:

```bash
curl -X POST "http://localhost:3000/api/files/upload-raw" \
  -H "Authorization: Bearer <clerk-session-jwt>" \
  -F "file=@flight-tickets.pdf"
```

- `200`: `{ success: true, data: RawUpload }`.
- `400`: `{ success: false, message: "No file uploaded" }`.
- Other errors: `401`, `404`, `500`.

### `POST /files/finalize`

Creates the MongoDB file record after raw upload.

| Body field | Type | Required | Notes |
| --- | --- | --- | --- |
| `tripId` | `MongoId` | Yes | Associated trip |
| `name` | string | Yes | Include an extension; controller derives `fileExtension` from text after the last `.` |
| `category` | `FileCategory` | No | Defaults to `General` |
| `notes` | string | No | Defaults to empty string |
| `url` | URI string | Yes | From raw upload response. Not stored for an authenticated document |
| `public_id` | string | Yes | From raw upload response |
| `resourceType` | `image`, `video`, `raw` | No | From raw upload response; needed to sign the file later |
| `deliveryType` | `upload`, `authenticated`, `private` | No | From raw upload response |
| `format` | string | No | From raw upload response, e.g. `pdf` |
| `fileType` | string | No | Usually the upload `mimetype` |
| `size` | integer >= 0 | No | Bytes from raw upload response |
| `clientRef` | string | No | Idempotency key; a replay returns the existing record with `200` |

```json
{
  "tripId": "64b64c7f0f1e2d3c4b5a6978",
  "name": "flight-tickets.pdf",
  "category": "Tickets",
  "notes": "Outbound and return tickets",
  "url": "https://res.cloudinary.com/example/raw/upload/tickets.pdf",
  "public_id": "TripTribe/1720000000000-tickets.pdf",
  "fileType": "application/pdf",
  "size": 245760
}
```

- `201`: `{ success: true, data: TripFile }` with `uploadedBy` populated.
- `200`: the same, when this `clientRef` was already finalized.
- Errors: `400`, `401`, `403`, `404`, `429`, `500`.

### `GET /files/:fileId/url`

A fresh signed URL for one file. Membership is resolved from the file's own trip.

| Path parameter | Type | Required |
| --- | --- | --- |
| `fileId` | `MongoId` | Yes |

```json
{
  "success": true,
  "data": {
    "url": "https://api.cloudinary.com/v1_1/<cloud>/image/download?...",
    "expiresAt": "2026-09-17T09:41:00.000Z"
  }
}
```

Call it immediately before previewing, downloading or sharing rather than caching the result. A legacy public file returns its permanent URL with `expiresAt: null`. Non-members get `403`.

### `GET /files/:tripId`

Returns files sorted by `createdAt` descending.

| Path parameter | Type | Required |
| --- | --- | --- |
| `tripId` | `MongoId` | Yes |

- `200`: `{ success: true, count: integer, data: TripFile[] }`.
- `uploadedBy` is populated with `name` and `imageUrl`.
- Each authenticated file carries a freshly signed `url` and a `urlExpiresAt`, so listing a trip's files is still one request.
- Errors: `400`, `401`, `403`, `404`, `429`, `500`.

## Discussion routes

### `GET /discussion/:tripId`

Returns trip messages sorted chronologically by `createdAt` ascending.

| Path parameter | Type | Required |
| --- | --- | --- |
| `tripId` | `MongoId` | Yes |

- `200`: `{ success: true, data: Message[] }`.
- Each `sender` is populated with `name` and `imageUrl`.
- Errors: `400`, `401`, `403`, `404`, `429`, `500`.

### `POST /discussion/send`

Creates a message and emits `new_discussion_message` to the trip's Socket.IO room.

| Body field | Type | Required |
| --- | --- | --- |
| `tripId` | `MongoId` | Yes |
| `text` | non-empty trimmed string | Yes |
| `clientRef` | string | No |

```json
{
  "tripId": "64b64c7f0f1e2d3c4b5a6978",
  "text": "Meet in the lobby at 8:45.",
  "clientRef": "msg-2026-09-17T09:12:03.114Z-a1b2"
}
```

- `201`: `{ success: true, data: Message }` with populated sender.
- `200`: the same message, when this `clientRef` was already sent. No second socket event is emitted.
- Errors: `400`, `401`, `403`, `404`, `429`, `500`.

## AI routes

Every action that calls Claude runs as a background job. The route validates the request, holds the job's credits, and answers `202` with a `jobId`. Poll `GET /ai/jobs/:jobId` until `status` is `succeeded`, `failed` or `cancelled`; `steps[]` drives a progress UI. A failed or cancelled job refunds its credits, and `error.message` is safe to show.

Credit costs: chat `1`, receipt `1`, packing list `2`, trip plan `20` for up to 5 days plus `4` per extra day (trips of up to 14 days). Every user gets 50 free credits a month; unused free credits don't roll over.

Who pays: on a trip with a credit pool, an owner's or editor's job is paid from the pool when the pool covers the whole cost; otherwise it's paid from the requester's own credits: free first, then subscription, then packs. Viewers always use their own. Every `202` below includes `fundedBy: "user" | "pool"`, and a refund goes back to wherever the credits came from.

Errors specific to AI routes:

| Status | `code` | Meaning |
| --- | --- | --- |
| `402` | `INSUFFICIENT_CREDITS` | Not enough credits; body includes `needed` and `available` |
| `409` | `REPLY_IN_PROGRESS` / `PLAN_IN_PROGRESS` | Wait for the running job |
| `503` | `AI_NOT_CONFIGURED` / `PLANNER_NOT_CONFIGURED` / `AI_UNAVAILABLE` | Missing server configuration, or the job couldn't start |

### `GET /ai/status`

Which AI features this server has, which job runner it uses (`inngest` or `inline`), and the credit costs.

### `POST /ai/threads` · `GET /ai/threads` · `GET /ai/threads/:threadId/messages` · `DELETE /ai/threads/:threadId`

Conversations with the assistant. A thread can be linked to a trip (`tripId`), which gives the assistant the trip's details; you must be a member. `GET /ai/threads` accepts an optional `?tripId=` filter. The messages response also carries `activeJob` — the reply still being written, or `null` — so a client that left mid-reply can resume polling.

`DELETE` removes your own conversation and its messages (`404` for anyone else's, `409` while a reply is still being written). Its jobs stay, for the credit ledger and cost tracking, with a chat job's question and reply erased (design.md D-088).

### `POST /ai/chat`

```json
{ "message": "What should we pack for Coorg in August?", "threadId": "optional", "tripId": "optional" }
```

- Omit `threadId` to start a new conversation (optionally about `tripId`).
- `202`: `{ jobId, threadId, messageId, cost, fundedBy }`. The job's `result` is `{ threadId, messageId, reply, suggestions }`, and the reply is also saved to the thread.

### `POST /ai/packing-list`

`{ "tripId": "…" }` — any member. Result: `{ tripId, categories: [{ name, items: [{ title, reason }] }], weather }`, excluding items already on the checklist. Nothing is added to the checklist; add chosen items with `POST /checklist/addItems/:tripId`.

### `POST /ai/receipt`

`multipart/form-data` with `image` (JPEG, PNG, WebP or GIF, up to 5 MB) and optional `tripId`. Result: `{ tripId, draft }` where `draft` has `title`, `amount`, `currency`, `tripCurrency`, `currencyMismatch`, `category`, `description`, `merchant`, `date`, `unreadable`. No expense is created, and the photo is deleted once read.

### `POST /ai/plan`

`{ "tripId": "…", "request": "Relaxed pace, beaches and seafood" }` — owner or editor. Requires `GOOGLE_MAPS_SERVER_KEY` on the server. The plan is grounded in Google Places: every activity is a real place, checked against opening hours and driving times. Result: `{ tripId, proposalId }`.

### `GET /ai/plans?tripId=`

Any member. `{ activeJob, proposals }`: the plan being built for the trip (the full job for whoever requested it, otherwise just `{ _id, kind, status, mine: false }`), and the 10 newest proposals with `status`, `summary`, `request`, `createdBy`, `createdAt`, `activityCount` and `acceptedCount`.

### `GET /ai/jobs/:jobId` · `POST /ai/jobs/:jobId/cancel`

Job progress and result for jobs you started. Cancelling stops the job at its next step and refunds its credits.

### `GET /ai/proposals/:proposalId`

A drafted plan for review — any trip member. `days[].activities[]` carry `_id`, `placeId`, `time`, `durationMin`, `estCostPerPerson`, `travelFromPreviousMin` and a `place` snapshot. `warnings[]` lists checks that still failed after repair; `gaps[]` lists what the candidate places couldn't cover; `budgetEstimate` is computed, not model-generated.

### `POST /ai/proposals/:proposalId/accept`

Owner or editor. `{ "activityIds": ["…"] }`, or an empty body to accept everything remaining. Activities are written through the normal add-activity path with `source: "ai"`; accepting twice never duplicates. Emits `activity_added` per affected day. `200`: `{ proposal, added }`.

### `POST /ai/proposals/:proposalId/reject`

Owner or editor. Marks the proposal dismissed.

## Credit routes

Buckets: `free` (monthly grant, expires at the next grant), `sub` (monthly subscription, rolls over up to 600), `paid` (credit packs, never expire) and `pool` (a trip's shared credits). Store prices live in App Store Connect / Play Console; what each product grants lives in `config/products.js`.

### `GET /credits/balance`

`{ free, subscription, paid, total, monthlyFreeCredits, freeResetsAt }`. Reading the balance writes this month's free grant if it hasn't been written yet. Pool credits aren't included; see `GET /trips/:tripId/credit-pool`.

### `GET /credits/ledger`

The latest 100 entries of your own buckets, newest first: `{ bucket, delta, reason, job, trip, productId, note, createdAt }`. Reasons are `grant`, `expire`, `hold`, `refund`, `purchase`, `revoke` (the store refunded a purchase), `pool_allocate`, `pool_withdraw` and `adjustment`.

### `POST /credits/grant`

RevenueCat's webhook, not a client route. It's authenticated by an `Authorization` header that must equal `REVENUECAT_WEBHOOK_AUTH` exactly (compared in constant time), not by Clerk, and the rate limiter skips it.

- `NON_RENEWING_PURCHASE`, `INITIAL_PURCHASE`, `RENEWAL`: grants the product's credits, keyed on `transaction_id`, so retries and one purchase arriving as two event types grant once. The user is `app_user_id` (the app logs RevenueCat in with the Mongo user id), falling back to `original_app_user_id` and `aliases`. Subscription renewals top up to the rollover cap and never go past it.
- `CANCELLATION` with `cancel_reason: "CUSTOMER_SUPPORT"` (a store refund): takes the credits back. The bucket can go negative if they were already spent.
- Everything else, unknown products and unknown users: `200` with `handled` saying why, so RevenueCat doesn't retry. Unknown users are logged loudly so support can grant by hand.
- `401` wrong header · `503` `REVENUECAT_WEBHOOK_AUTH` unset · `500` our failure (RevenueCat retries).

### `GET /trips/:tripId/credit-pool`

Trip member. `{ balance, canSpend, canManage, entries }`: `canSpend` for owners and editors, `canManage` for the owner, and the latest 30 movements `{ user: { name, imageUrl }, delta, reason, job, createdAt }`.

### `POST /trips/:tripId/credit-pool`

Owner only. `{ "action": "allocate" | "withdraw", "amount": 50, "requestId": "<uuid>" }` → `{ balance }`. `requestId` is required, and retrying with the same one moves the credits once.

- `allocate` moves purchased credits (subscription first, then packs) into the pool. Free monthly credits can't be pooled: `402` with a message saying how many purchased credits you have.
- `withdraw` moves unspent pool credits back to you as pack credits. More than the pool holds: `400`.
- Both bump the trip's `budget` revision.

## Sync routes

### `GET /sync/:tripId/rev`

Trip member. Returns one revision counter per independently refetchable section.

```json
{
  "success": true,
  "data": {
    "tripId": "64b64c7f0f1e2d3c4b5a6978",
    "sections": {
      "trip": 3,
      "members": 1,
      "itinerary": 12,
      "expenses": 7,
      "budget": 2,
      "checklist": 4,
      "discussion": 31,
      "files": 2
    }
  }
}
```

A counter only ever increases, and a section that has never changed reads `0`. Call this once on socket reconnect and once when the app returns to the foreground, then refetch only the sections whose number differs from the last one you saw.

## Device routes

### `POST /devices/register`

Authenticated. Registers this installation for push. Safe to call on every app start: it upserts on the token, which also moves the device to the account currently signed in.

```json
{
  "token": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
  "platform": "ios",
  "deviceName": "iPhone 14"
}
```

Returns `200` with the `Device`. An invalid Expo token or an unknown platform is `400`.

### `DELETE /devices/:deviceId`

Authenticated. Call on sign-out. `deviceId` may be the id returned by register or the push token itself. Only the owner's own devices can be removed; anything else is `404`.

Notifications are data-only messages that wake the app to run a revision catch-up. The person who made a change is never notified about it, writes to one trip within ten seconds collapse into a single send, and a token Expo reports as unregistered is deleted.

## Place routes

The Google Maps key never leaves the server; these routes proxy it. Each has a per-user **daily quota** on top of the rate limit (`config/quotas.js`), spent only when the server actually calls Google — cached answers are free. A spent quota is `429` with `code: "QUOTA_EXCEEDED"` and `retryAfterSeconds` until midnight UTC. Maps not configured, or the API switched off in the Google project, is `503` with `code: "PLACES_NOT_CONFIGURED"`; an unreachable Google is `502`.

### `GET /places/search?q=&near=lat,lng`

Authenticated. Place picker search: up to 8 `{ placeId, name, address, lat, lng, types, photoRef }`, biased toward `near` (usually the trip's `place`). `q` is 2–120 characters. Debounce on the client; identical queries are cached for 10 minutes.

### `GET /places/:placeId`

Authenticated. One place with `country`, `admin1` and up to three `photos: [{ ref, width, height, attributions }]`. Served from the place cache (30 days) when it can be.

### `GET /places/photo/:photoRef?w=`

Authenticated. `photoRef` is the photo's resource name, slashes included (`places/…/photos/…`). Redirects (`302`) to a short-lived image on Google's CDN; `w` snaps to 200, 400, 800 or 1200. Show the photo's attributions wherever it appears.

### `GET /places/static-map?stops=&w=&h=&theme=`

Authenticated. A PNG at 2× scale: `stops` is up to 12 `lat,lng` pairs joined by `|`, drawn as numbered markers (1–9, then A–Z) in order and joined by a line; one stop is a close-up. `w` and `h` are 80–640 (default 640×240); `theme=dark` gives a night basemap. Images are cached per stop-set, size and theme for a day. Image loaders must send the bearer token as a request header.

## Weather routes

### `GET /weather?tripId=` · `GET /weather?lat=&lng=&from=&to=`

Authenticated; a `tripId` requires membership. Returns `{ location: { name, lat, lng, source, elevation } | null, days: [...] }` with one entry per day (at most 31). Days inside the 16-day forecast are `source: "forecast"` with a rain chance; later ones are the same dates last year, `"typical"`. Each day carries `summary`, `tempMaxC`, `tempMinC`, `precipitationMm` and `severe`. A trip whose location can't be placed returns `location: null` and no days. Responses are cached for 3 hours.

## Template routes

Pre-made itineraries. Days are relative ("day 2") until cloned. Places were resolved against Google by the seed script, never typed in.

### `GET /templates?theme=&days=&maxDays=&budget=&month=&featured=&limit=`

Authenticated. Summaries without itineraries, featured first, then most cloned. `theme` is a trip theme; `budget` is `budget`, `mid` or `premium`; `month` (1–12) keeps templates recommended for that month. `limit` defaults to 20, at most 50.

### `GET /templates/:slug`

Authenticated. The whole template, with `itinerary: [{ day, title, activities: [{ section, time, title, type, place, durationMin, estCost, notes }] }]`.

### `POST /templates/:slug/clone`

Authenticated. `{ startDate: "YYYY-MM-DD", name?, clientRef? }`. Creates a trip owned by the caller, from `startDate` for the template's length, with every activity on its day (`source: "template"`), the template's destination `place` and `theme`, and no cover image. `201` with the populated trip; with a `clientRef` that already made a trip, `200` with that trip instead.

## Home routes

### `GET /home`

Authenticated. Everything the Home dashboard shows, cached for 60 seconds per user (`?fresh=1` skips the cache):
- `user`: name, photo and credit balance.
- `nextTrip`: the ongoing trip, otherwise the soonest upcoming one, or `null`. It carries `status`, `daysUntil`, `totalDays`, `plannedDays` and activity counts. `weather` covers its next five days: forecast, or `typical` beyond the forecast window.
- `activeTrips`: up to three more current trips.
- `balances`: `youAreOwed` and `youOwe` in the headline currency, the first names involved, and `otherCurrencies`.
- `recentActivity`: the five newest expenses, messages, activities and member joins across the caller's trips. `actor.name` is `"You"` for the caller, and activities have no actor.
- `featuredTemplates`: in-season templates first.
- `suggestion`: `seasonal` with a `templateSlug`, or `plan`.

### `GET /wallet`

Authenticated. `{ totals: [{ currency, youAreOwed, youOwe }], trips: [...], credits }`. Each trip entry has:
- `trip`: `status` is `upcoming`, `ongoing` or `past`, plus the caller's `role`.
- `currency`, `youAreOwed` and `youOwe`.
- `debts`: `direction` is `owed` (the counterpart owes the caller, who can settle it with `POST /expenses/settle`) or `owe`.
- `budget`: `{ total, spent, remaining, utilization }`.

Amounts are in each trip's budget currency, never converted.

## Push notifications

Two kinds, both carrying `data.type`:
- `trip_changed`: data-only, Android channel `sync`, `{ tripId, sections }`. Sent to members other than the person who made the change, debounced 10 s per trip.
- `job_done`: visible, channel `trip-updates`, `{ jobId, kind, status, tripId, proposalId }`. Sent to the requester when an AI **plan** succeeds or fails. Not sent on cancel.

## Trip places and themes

Trips carry a structured `place` beside the free-text `location`, and a `theme` (`monsoon`, `mountain`, `coast`, `desert`, `heritage`, `wild` or `city`). Neither is sent by clients. The server resolves `place` from `location` when a trip is created or first opened (a location Google can't match is retried at most weekly), derives `theme` from the destination, the travel months and the typical climate, and bumps the `trip` revision. An AI plan later refines `theme` from the places it gathered.

An activity may carry `place: { placeId, name, address, lat, lng, types, photoRef }` from the place search. When `placeId` is one the search returned, the server replaces the other fields with its own cached copy; a place without valid coordinates is dropped and the text `location` stays.

## Socket.IO contract

Connect Socket.IO to the same origin as the HTTP API.

### Client-to-server events

| Event | Payload |
| --- | --- |
| `join_trip` | `tripId: string` |
| `typing_start` | `{ tripId: string, userName: string }` |
| `typing_stop` | `{ tripId: string }` |

### Server-to-client events

| Event | Emitted by/meaning |
| --- | --- |
| `member_joined` | A user joined a trip |
| `activity_added` | An itinerary activity was added |
| `activity_updated` | An activity completion status changed |
| `activity_deleted` | An activity was removed |
| `expense_added` | An expense was created |
| `checklist_updated` | Checklist items were added |
| `task_toggled` | A checklist item's completion changed |
| `new_discussion_message` | A discussion message was created |
| `user_typing` | Typing state changed |
| `trip_changed` | Any write to the trip: `{ tripId, section, rev }`. One handler replaces the per-write events above for catch-up purposes |

## Known contract and implementation cautions

1. `GET /expenses/trip/:tripId/debts` is deprecated; use `GET /expenses/debts/:tripId`.
2. The budget dashboard route uses the unusual case-sensitive spelling `budgetDashBoard`.
3. The expense model defaults `currency` to `USD`, while trip budgets default to `INR`.
4. Raw file upload has a 25 MB limit but still no MIME-type allowlist.
5. `Checklist.tripId` is stored as a string while every other trip reference is an ObjectId.
6. A cover image uploaded without `?scope=public` gets a URL that expires in ten minutes, and nothing warns you at the time.

### Fixed in Phase 10

- `POST /users/sync` returns `401` without a Clerk session instead of `500`.
- `GET /checklist/fetchLists/:tripId` requires membership; it used to be readable by anyone signed in or not.
- File, discussion, checklist, expense and budget routes all verify trip membership.
- Only the person who paid an expense can settle it.
- Trip documents are no longer delivered from permanent public URLs. **Anything uploaded before this that has already leaked stays leaked — rotate genuinely sensitive documents.**
- `PUT /trips/:tripId` is a partial update: sending only the fields you changed no longer wipes the rest, and omitting `coverImage` no longer throws.
- Expense creation reads the trip from the URL only; body `selectedTripId` is ignored.
- `yourBalance` in the debt summary is no longer always `0`.
- Activity status and checklist toggles require an explicit boolean; a missing value is `400` rather than a silent write.

