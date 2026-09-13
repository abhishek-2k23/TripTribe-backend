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

> Current implementation note: `POST /users/sync` expects a valid Clerk identity but does not use the `protect` middleware. Calling it without a token currently produces `500` instead of `401`.

### Content types

- JSON routes: `Content-Type: application/json`
- Raw file upload: `Content-Type: multipart/form-data`; the field name must be `file`.
- No current route accepts query parameters.

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
| `500` | Unexpected server/controller error |

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
| `url` | URI string | Yes | Cloudinary URL |
| `public_id` | string | Yes | Cloudinary public ID |
| `originalName` | string | Yes | Original client filename |
| `mimetype` | string | Yes | Uploaded MIME type |
| `size` | integer | Yes | Bytes |

### `TripFile`

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `_id` | `MongoId` | Yes | File record ID |
| `tripId` | `MongoId` | Yes | Associated trip |
| `uploadedBy` | `MongoId \| UserSummary` | Yes | Usually populated with `name` and `imageUrl` |
| `name` | string | Yes | User-facing filename |
| `category` | `FileCategory` | Yes | Defaults to `General` |
| `notes` | string | No | Defaults to empty string |
| `url` | URI string | Yes | Cloudinary URL |
| `public_id` | string | Yes | Cloudinary public ID |
| `fileType` | string | No | Usually MIME type |
| `fileExtension` | string | No | Derived from text after the last `.` in `name` |
| `size` | number | No | Bytes |
| `createdAt` | `DateTime` | Yes | Mongoose timestamp |
| `updatedAt` | `DateTime` | Yes | Mongoose timestamp |

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
| POST | `/itinerary/addActivity` | Authenticated | `201 Itinerary` |
| GET | `/itinerary/getTripItinerary/:tripId` | Authenticated | `200 itinerary data` |
| POST | `/itinerary/activity/status` | Authenticated | `200 Itinerary` |
| POST | `/itinerary/activity/comment` | Authenticated | `200 Itinerary` |
| DELETE | `/itinerary/activity/:itineraryId/:activityId/:tripId` | Authenticated | `200 Itinerary` |
| POST | `/expenses/add/:tripId` | Owner or editor | `201 Expense` |
| GET | `/expenses/debts/:tripId` | Trip member | `200 DebtSummary` |
| GET | `/expenses/trip/:tripId/debts` | Trip member; deprecated alias | `200 DebtSummary` |
| POST | `/expenses/settle` | Authenticated | `200 message` |
| GET | `/expenses/budgetDashBoard/:tripId` | Authenticated | `200 BudgetDashboard` |
| POST | `/checklist/addItems/:tripId` | Owner or editor | `200 Checklist` |
| GET | `/checklist/fetchLists/:tripId` | Public | `200 Checklist` |
| POST | `/checklist/:tripId/checklist/:categoryId/items/:itemId` | Authenticated | `200 ChecklistItem` |
| POST | `/files/upload-raw` | Authenticated | `200 RawUpload` |
| POST | `/files/finalize` | Authenticated | `201 TripFile` |
| GET | `/files/:tripId` | Authenticated | `200 TripFile[]` |
| GET | `/discussion/:tripId` | Authenticated | `200 Message[]` |
| POST | `/discussion/send` | Authenticated | `201 Message` |

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

| Field | Type | Required in practice | Notes |
| --- | --- | --- | --- |
| `tripName` | string | Yes for renaming | Stored in `Trip.name` |
| `description` | string | No | Falsy values fall back to existing description |
| `startDate` | `DateTime` | Yes | Controller always calls `new Date(startDate)` |
| `endDate` | `DateTime` | Yes | Controller always calls `new Date(endDate)` |
| `coverImage` | `TripImage` | Yes | Controller directly reads `coverImage.url`; `public_id` is not updated |
| `members` | `{ _id: MongoId, role: TripRole }[]` | No | Replaces the complete members array when non-empty |

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

Send the complete edit form. Although some values have fallbacks, omitting `coverImage`, `startDate`, or `endDate` can cause invalid behavior in the current controller.

- `200`: `{ success: true, message: "Trip updated successfully", data: Trip }`.
- `403`: not a member or role is not owner/editor.
- `404`: trip not found.
- Other errors: `400`, `401`, `500`.

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
| `date` | `DateTime` | Yes | Exact stored date matching is used |
| `title` | string | Yes | Activity title |
| `time` | string | No | Convention: `HH:mm` |
| `location` | string | No | Free text |
| `type` | `ActivityType` | No | Defaults to `Activity` |
| `notes` | string | No | Free text |
| `attachment` | URI string or `null` | No | Defaults to `null` |

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
- Errors: `400`, `401`, `404`, `500`.

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

- `200`: `{ success: true, data: Itinerary | null }`.
- Errors: `400`, `401`, `404`, `500`.

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
| Path `tripId` | `MongoId` | Yes | Used by role middleware |
| Body `selectedTripId` | `MongoId` | Yes | Used by the controller as the stored trip ID; send the same value as path `tripId` |
| Body `title` | string | Yes | Expense title |
| Body `description` | string | No | Free text |
| Body `amount` | number > 0 | Yes | Divided equally for `equally` and `selected` |
| Body `category` | `ExpenseCategory` | Yes | Stored category |
| Body `splitType` | `SplitType` | Yes | `none` produces no split details |
| Body `participants` | `MongoId[]` | No | Defaults to `[]`; payer is always added |
| Body `paidBy` | `MongoId` | No | Defaults to current user |

```json
{
  "selectedTripId": "64b64c7f0f1e2d3c4b5a6978",
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
- `403`: caller lacks membership/role for path trip.
- `404`: body `selectedTripId` trip not found.
- Other errors: `400`, `401`, `500`.

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

- `200`: `{ success: true, message: "Debt settled" }`.
- `404`: split not found.
- Other errors: `400`, `401`, `500`.

Current access-control note: this route requires authentication but does not verify that the caller belongs to the expense's trip or is authorized to settle the specified user's split.

### `GET /expenses/budgetDashBoard/:tripId`

Returns budget analytics. The `budgetDashBoard` casing must be used exactly as shown.

| Path parameter | Type | Required |
| --- | --- | --- |
| `tripId` | `MongoId` | Yes |

- `200`: `{ success: true, data: BudgetDashboard }`.
- `404`: trip not found.
- Other errors: `400`, `401`, `500`.

Current access-control note: authentication is required, but the controller does not check trip membership.

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
- `200`: `{ success: true, data: ChecklistItem }` with populated `completedBy` users.
- Errors: `400`, `401`, `404`, `500`.

Current access-control note: authentication is required, but this route does not run the trip-role/member middleware.

## File routes

File creation is a two-step process: upload bytes with `/files/upload-raw`, then send the returned provider values plus editable metadata to `/files/finalize`.

### `POST /files/upload-raw`

Uploads one file to Cloudinary folder `TripTribe` using `resource_type: auto`.

- Authentication: required.
- Content type: `multipart/form-data`.
- Multipart field: `file` containing one binary file.
- No explicit file type or size limit is configured in the current Multer middleware.

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
| `url` | URI string | Yes | From raw upload response |
| `public_id` | string | Yes | From raw upload response |
| `fileType` | string | No | Usually the upload `mimetype` |
| `size` | integer >= 0 | No | Bytes from raw upload response |

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
- Errors: `400`, `401`, `404`, `500`.

Current access-control note: this route does not verify that the user belongs to `tripId`.

### `GET /files/:tripId`

Returns files sorted by `createdAt` descending.

| Path parameter | Type | Required |
| --- | --- | --- |
| `tripId` | `MongoId` | Yes |

- `200`: `{ success: true, count: integer, data: TripFile[] }`.
- `uploadedBy` is populated with `name` and `imageUrl`.
- Errors: `400`, `401`, `404`, `500`.

Current access-control note: this route does not verify trip membership.

## Discussion routes

### `GET /discussion/:tripId`

Returns trip messages sorted chronologically by `createdAt` ascending.

| Path parameter | Type | Required |
| --- | --- | --- |
| `tripId` | `MongoId` | Yes |

- `200`: `{ success: true, data: Message[] }`.
- Each `sender` is populated with `name` and `imageUrl`.
- Errors: `400`, `401`, `404`, `500`.

Current access-control note: authentication is required, but trip membership is not checked.

### `POST /discussion/send`

Creates a message and emits `new_discussion_message` to the trip's Socket.IO room.

| Body field | Type | Required |
| --- | --- | --- |
| `tripId` | `MongoId` | Yes |
| `text` | non-empty trimmed string | Yes |

```json
{
  "tripId": "64b64c7f0f1e2d3c4b5a6978",
  "text": "Meet in the lobby at 8:45."
}
```

- `201`: `{ success: true, data: Message }` with populated sender.
- Errors: `400`, `401`, `404`, `500`.

Current access-control note: authentication is required, but trip membership is not checked.

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

## Known contract and implementation cautions

1. `POST /users/sync` currently returns `500` without a Clerk identity instead of a clean `401`.
2. `GET /checklist/fetchLists/:tripId` is public, so checklist data can currently be read without authentication.
3. Several authenticated itinerary, file, discussion, checklist-toggle, expense-settlement, and budget-dashboard routes do not independently verify trip membership.
4. `PUT /trips/:tripId` should receive a complete edit form, especially `coverImage`, `startDate`, and `endDate`.
5. Expense creation uses the path `tripId` for role authorization but body `selectedTripId` for creation. Clients must send the same ID in both locations.
6. `GET /expenses/trip/:tripId/debts` is deprecated; use `GET /expenses/debts/:tripId`.
7. The budget dashboard route uses the unusual case-sensitive spelling `budgetDashBoard`.
8. The expense model defaults `currency` to `USD`, while trip budgets default to `INR`.
9. Raw file upload currently has no explicit MIME-type allowlist or size limit.

