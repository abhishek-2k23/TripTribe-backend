const schemaRef = (name) => ({ $ref: `#/components/schemas/${name}` });

const jsonResponse = (description, schema) => ({
  description,
  content: {
    "application/json": { schema },
  },
});

const jsonRequest = (schema, example) => ({
  required: true,
  content: {
    "application/json": {
      schema,
      ...(example ? { example } : {}),
    },
  },
});

const successEnvelope = (dataSchema, extraProperties = {}) => ({
  type: "object",
  required: ["success", "data"],
  properties: {
    success: { type: "boolean", const: true },
    ...extraProperties,
    data: dataSchema,
  },
});

const tripIdParameter = {
  name: "tripId",
  in: "path",
  required: true,
  description: "MongoDB ID of the trip.",
  schema: schemaRef("MongoId"),
};

const itineraryIdParameter = {
  name: "itineraryId",
  in: "path",
  required: true,
  schema: schemaRef("MongoId"),
};

const activityIdParameter = {
  name: "activityId",
  in: "path",
  required: true,
  schema: schemaRef("MongoId"),
};

const standardErrors = {
  400: { $ref: "#/components/responses/BadRequest" },
  401: { $ref: "#/components/responses/Unauthorized" },
  404: { $ref: "#/components/responses/NotFound" },
  500: { $ref: "#/components/responses/ServerError" },
};

const roleErrors = {
  ...standardErrors,
  403: { $ref: "#/components/responses/Forbidden" },
};

const threadIdParameter = {
  name: "threadId",
  in: "path",
  required: true,
  description: "MongoDB ID of the AI conversation.",
  schema: schemaRef("MongoId"),
};

const jobIdParameter = {
  name: "jobId",
  in: "path",
  required: true,
  description: "MongoDB ID of the AI job.",
  schema: schemaRef("MongoId"),
};

const proposalIdParameter = {
  name: "proposalId",
  in: "path",
  required: true,
  description: "MongoDB ID of the itinerary proposal.",
  schema: schemaRef("MongoId"),
};

const insufficientCredits = jsonResponse(
  "Not enough credits. The body carries `code: INSUFFICIENT_CREDITS`, `needed` and `available`.",
  schemaRef("Error"),
);

const aiUnavailable = jsonResponse(
  "AI features, or Google Maps for trip plans, aren't configured on this server, or the AI service couldn't start the job.",
  schemaRef("Error"),
);

const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Trip Planner API",
    version: "1.0.0",
    summary: "Frontend integration contract for the Trip Planner backend",
    description: `
This is the canonical frontend-facing contract for the Express API.

### Authentication flow

1. Sign the user in with Clerk and obtain the current session token.
2. Send \`Authorization: Bearer <Clerk session token>\` on authenticated requests.
3. Call \`POST /users/sync\` once after sign-in. Protected endpoints resolve the Clerk user to the local MongoDB user created by this call.

### Trip permissions

Trip members have one of three roles: \`owner\`, \`editor\`, or \`viewer\`. Owners can change member roles. Owners and editors can update trips and budgets, add expenses, and add checklist items. Endpoints not guarded by role middleware are identified individually below.

### Realtime client

Connect Socket.IO to the same origin as this API, then emit \`join_trip\` with the trip ID. Client-to-server events are \`join_trip(tripId)\`, \`typing_start({ tripId, userName })\`, and \`typing_stop({ tripId })\`. Server-to-client events are \`member_joined\`, \`activity_added\`, \`activity_updated\`, \`activity_deleted\`, \`expense_added\`, \`checklist_updated\`, \`task_toggled\`, \`new_discussion_message\`, and \`user_typing\`.

### Important integration details

- Dates are ISO 8601 strings. MongoDB IDs are 24-character hexadecimal strings.
- File creation is a two-step flow: upload multipart data to \`/files/upload-raw\`, let the user edit metadata, then save it with \`/files/finalize\`.
- Expense creation currently reads the trip from both the URL and \`selectedTripId\` in the JSON body. Send the same ID in both places.
- Error bodies produced directly by auth middleware can contain only \`message\`; centralized errors use \`success: false\` and \`error\`.
`,
  },
  tags: [
    { name: "Health", description: "Public service-health endpoints." },
    { name: "Users", description: "Clerk-to-database user synchronization and profile operations." },
    { name: "Trips", description: "Trip creation, membership, roles, details, and budgets." },
    { name: "Itinerary", description: "Dated itinerary sections, activities, status, and comments." },
    { name: "Expenses", description: "Expenses, balances, debt settlement, and budget analytics." },
    { name: "Checklist", description: "Trip checklist categories, items, and per-user completion." },
    { name: "Files", description: "Cloudinary upload and trip file metadata." },
    { name: "Discussion", description: "Persisted trip discussion messages." },
    { name: "AI", description: "Claude-powered chat, packing lists, receipt scanning and trip plans, run as background jobs." },
    { name: "Credits", description: "AI credit balance and ledger." },
  ],
  security: [{ ClerkBearerAuth: [] }],
  paths: {
    "/health": {
      get: {
        tags: ["Health"],
        operationId: "getHealth",
        summary: "Get service health",
        security: [],
        responses: {
          200: jsonResponse("The server health snapshot.", schemaRef("Health")),
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/health/detailed": {
      get: {
        tags: ["Health"],
        operationId: "getDetailedHealth",
        summary: "Get detailed service health",
        security: [],
        responses: {
          200: jsonResponse("Runtime, database, memory, and CPU health data.", schemaRef("DetailedHealth")),
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/users/sync": {
      post: {
        tags: ["Users"],
        operationId: "syncUser",
        summary: "Sync the signed-in Clerk user",
        description: "Creates the local MongoDB user on first call and otherwise returns the existing record. Send the Clerk session token; there is no request body.",
        responses: {
          200: jsonResponse("Existing user returned.", successEnvelope(schemaRef("User"))),
          201: jsonResponse("Local user created.", successEnvelope(schemaRef("User"))),
          ...standardErrors,
        },
      },
    },
    "/users/me": {
      get: {
        tags: ["Users"],
        operationId: "getCurrentUser",
        summary: "Get the current local user",
        responses: {
          200: jsonResponse("The authenticated local user.", successEnvelope(schemaRef("User"))),
          ...standardErrors,
        },
      },
      delete: {
        tags: ["Users"],
        operationId: "deleteMyAccount",
        summary: "Delete the current user's account",
        description:
          "Anonymizes the local user (name becomes \"Deleted user\"; email, photo and Clerk id are erased), deletes their messages, activity comments, checklist ticks and uploaded files, deletes trips where they are the only member, transfers ownership of shared trips to the longest-standing editor (or member), keeps shared expense records attributed to the anonymized user, then deletes the Clerk user. Responds 502 with the summary if only the Clerk deletion failed; signing in again and repeating the call finishes it.",
        responses: {
          200: jsonResponse("Account deleted.", {
            type: "object",
            properties: {
              success: { type: "boolean" },
              message: { type: "string" },
              data: {
                type: "object",
                properties: {
                  tripsDeleted: { type: "array", items: { type: "object" } },
                  ownershipTransferred: { type: "array", items: { type: "object" } },
                  tripsLeft: { type: "array", items: { type: "object" } },
                  messagesDeleted: { type: "integer" },
                  filesDeleted: { type: "integer" },
                  expensesKept: { type: "integer" },
                  assetsDestroyed: { type: "integer" },
                  signInAccountDeleted: { type: "boolean" },
                },
              },
            },
          }),
          502: jsonResponse("Data deleted but the Clerk user could not be removed.", {
            type: "object",
            properties: { success: { type: "boolean" }, message: { type: "string" }, data: { type: "object" } },
          }),
          ...standardErrors,
        },
      },
    },
    "/users/me/export": {
      get: {
        tags: ["Users"],
        operationId: "exportMyData",
        summary: "Export the current user's data",
        description:
          "Returns the user's profile, trip memberships (own role only), messages, activity comments, completed checklist items, expenses they paid or share in (own share only) and uploaded files.",
        responses: {
          200: jsonResponse("Data export.", successEnvelope({ type: "object" })),
          ...standardErrors,
        },
      },
    },
    "/users/update": {
      put: {
        tags: ["Users"],
        operationId: "updateProfile",
        summary: "Update the current user's profile",
        requestBody: jsonRequest(
          {
            type: "object",
            properties: {
              name: { type: "string" },
              imageUrl: { type: "string", format: "uri" },
            },
          },
          { name: "Aarav Sharma", imageUrl: "https://example.com/avatar.jpg" },
        ),
        responses: {
          200: jsonResponse("Updated user.", successEnvelope(schemaRef("User"))),
          ...standardErrors,
        },
      },
    },
    "/trips/create": {
      post: {
        tags: ["Trips"],
        operationId: "createTrip",
        summary: "Create a trip",
        description: "The authenticated user becomes the owner. An eight-character hexadecimal invite code is generated automatically.",
        requestBody: jsonRequest(
          {
            type: "object",
            required: ["name", "location", "image", "startDate", "endDate"],
            properties: {
              name: { type: "string" },
              location: { type: "string" },
              description: { type: "string" },
              image: schemaRef("TripImage"),
              startDate: { type: "string", format: "date-time" },
              endDate: { type: "string", format: "date-time" },
            },
          },
          {
            name: "Goa Getaway",
            location: "Goa, India",
            description: "A long weekend by the sea.",
            image: { url: "https://example.com/goa.jpg", public_id: "trips/goa" },
            startDate: "2026-10-02T00:00:00.000Z",
            endDate: "2026-10-05T00:00:00.000Z",
          },
        ),
        responses: {
          201: jsonResponse("Trip created.", successEnvelope(schemaRef("Trip"))),
          ...standardErrors,
        },
      },
    },
    "/trips/join": {
      post: {
        tags: ["Trips"],
        operationId: "joinTrip",
        summary: "Join a trip with an invite code",
        description: "New members receive the viewer role. Emits `member_joined` to the trip room.",
        requestBody: jsonRequest(
          {
            type: "object",
            required: ["inviteCode"],
            properties: { inviteCode: { type: "string", example: "a1b2c3d4" } },
          },
          { inviteCode: "a1b2c3d4" },
        ),
        responses: {
          200: jsonResponse("Joined trip.", successEnvelope(schemaRef("Trip"))),
          ...standardErrors,
        },
      },
    },
    "/trips/my-trips": {
      get: {
        tags: ["Trips"],
        operationId: "listMyTrips",
        summary: "List the current user's trips",
        responses: {
          200: jsonResponse(
            "Trips sorted newest first.",
            successEnvelope(
              { type: "array", items: schemaRef("Trip") },
              { count: { type: "integer", minimum: 0 } },
            ),
          ),
          ...standardErrors,
        },
      },
    },
    "/trips/{tripId}": {
      parameters: [tripIdParameter],
      get: {
        tags: ["Trips"],
        operationId: "getTrip",
        summary: "Get one trip",
        description: "Only a member of the trip can retrieve it.",
        responses: {
          200: jsonResponse("Trip with populated members.", successEnvelope(schemaRef("Trip"))),
          ...standardErrors,
        },
      },
      put: {
        tags: ["Trips"],
        operationId: "updateTrip",
        summary: "Update a trip",
        description: "Requires owner or editor. The current controller expects `coverImage`, `startDate`, and `endDate` even for an otherwise partial edit, so send the complete edit form.",
        requestBody: jsonRequest(
          {
            type: "object",
            required: ["tripName", "startDate", "endDate", "coverImage"],
            properties: {
              tripName: { type: "string" },
              description: { type: "string" },
              startDate: { type: "string", format: "date-time" },
              endDate: { type: "string", format: "date-time" },
              coverImage: schemaRef("TripImage"),
              members: {
                type: "array",
                description: "If supplied, each member uses `_id` for the user ID.",
                items: {
                  type: "object",
                  required: ["_id", "role"],
                  properties: {
                    _id: schemaRef("MongoId"),
                    role: schemaRef("TripRole"),
                  },
                },
              },
            },
          },
          {
            tripName: "Goa Getaway 2026",
            description: "Updated itinerary and dates.",
            startDate: "2026-10-02T00:00:00.000Z",
            endDate: "2026-10-06T00:00:00.000Z",
            coverImage: { url: "https://example.com/goa-new.jpg", public_id: "trips/goa-new" },
          },
        ),
        responses: {
          200: jsonResponse(
            "Updated trip.",
            successEnvelope(schemaRef("Trip"), { message: { type: "string" } }),
          ),
          ...roleErrors,
        },
      },
    },
    "/trips/{tripId}/role": {
      patch: {
        tags: ["Trips"],
        operationId: "updateTripMemberRole",
        summary: "Change a trip member's role",
        description: "Owner only.",
        parameters: [tripIdParameter],
        requestBody: jsonRequest(
          {
            type: "object",
            required: ["userId", "role"],
            properties: {
              userId: schemaRef("MongoId"),
              role: schemaRef("TripRole"),
            },
          },
          { userId: "64b64c7f0f1e2d3c4b5a6978", role: "editor" },
        ),
        responses: {
          200: jsonResponse("Role updated.", successEnvelope(schemaRef("Trip"))),
          ...roleErrors,
        },
      },
    },
    "/trips/{tripId}/budget": {
      patch: {
        tags: ["Trips"],
        operationId: "updateTripBudget",
        summary: "Update the trip budget",
        description: "Requires owner or editor.",
        parameters: [tripIdParameter],
        requestBody: jsonRequest(
          {
            type: "object",
            required: ["total", "categories"],
            properties: {
              total: { type: "number", minimum: 0 },
              categories: schemaRef("BudgetCategories"),
            },
          },
          {
            total: 60000,
            categories: {
              Food: 10000,
              Transport: 10000,
              Activities: 10000,
              Hotel: 20000,
              Shopping: 5000,
              Other: 5000,
            },
          },
        ),
        responses: {
          200: jsonResponse(
            "Updated budget.",
            successEnvelope(schemaRef("Budget"), { message: { type: "string" } }),
          ),
          ...roleErrors,
        },
      },
    },
    "/itinerary/addActivity": {
      post: {
        tags: ["Itinerary"],
        operationId: "addItineraryActivity",
        summary: "Add an activity",
        description: "Creates the dated itinerary and/or section when needed. Emits `activity_added`.",
        requestBody: jsonRequest(
          {
            type: "object",
            required: ["tripId", "section", "date", "title"],
            properties: {
              tripId: schemaRef("MongoId"),
              section: { type: "string" },
              date: { type: "string", format: "date-time" },
              title: { type: "string" },
              time: { type: "string", example: "09:30" },
              location: { type: "string" },
              type: schemaRef("ActivityType"),
              notes: { type: "string" },
              attachment: { type: ["string", "null"], format: "uri" },
            },
          },
          {
            tripId: "64b64c7f0f1e2d3c4b5a6978",
            section: "Morning",
            date: "2026-10-03T00:00:00.000Z",
            title: "Visit Basilica of Bom Jesus",
            time: "09:30",
            location: "Old Goa",
            type: "Sightseeing",
            notes: "Carry water.",
            attachment: null,
          },
        ),
        responses: {
          201: jsonResponse(
            "Activity added.",
            successEnvelope(schemaRef("Itinerary"), { message: { type: "string" } }),
          ),
          ...standardErrors,
        },
      },
    },
    "/itinerary/getTripItinerary/{tripId}": {
      get: {
        tags: ["Itinerary"],
        operationId: "getTripItinerary",
        summary: "Get a trip itinerary",
        parameters: [tripIdParameter],
        responses: {
          200: jsonResponse(
            "Dated itinerary and the unique existing section names.",
            successEnvelope(
              {
                type: "object",
                required: ["itinerary", "existingSections"],
                properties: {
                  itinerary: { type: "array", items: schemaRef("Itinerary") },
                  existingSections: { type: "array", items: { type: "string" } },
                },
              },
              { count: { type: "integer", minimum: 0 } },
            ),
          ),
          ...standardErrors,
        },
      },
    },
    "/itinerary/activity/status": {
      post: {
        tags: ["Itinerary"],
        operationId: "setActivityStatus",
        summary: "Set an activity's completion status",
        description: "Emits `activity_updated` to the supplied trip room.",
        requestBody: jsonRequest(
          {
            type: "object",
            required: ["itineraryId", "activityId", "isDone", "tripId"],
            properties: {
              itineraryId: schemaRef("MongoId"),
              activityId: schemaRef("MongoId"),
              isDone: { type: "boolean" },
              tripId: schemaRef("MongoId"),
            },
          },
          {
            itineraryId: "64b64c7f0f1e2d3c4b5a6978",
            activityId: "64b64c7f0f1e2d3c4b5a6979",
            isDone: true,
            tripId: "64b64c7f0f1e2d3c4b5a697a",
          },
        ),
        responses: {
          200: jsonResponse("Updated itinerary.", successEnvelope(schemaRef("Itinerary"))),
          ...standardErrors,
        },
      },
    },
    "/itinerary/activity/comment": {
      post: {
        tags: ["Itinerary"],
        operationId: "addActivityComment",
        summary: "Comment on an activity",
        requestBody: jsonRequest(
          {
            type: "object",
            required: ["itineraryId", "activityId", "text"],
            properties: {
              itineraryId: schemaRef("MongoId"),
              activityId: schemaRef("MongoId"),
              text: { type: "string", minLength: 1 },
            },
          },
          {
            itineraryId: "64b64c7f0f1e2d3c4b5a6978",
            activityId: "64b64c7f0f1e2d3c4b5a6979",
            text: "Let's arrive 15 minutes early.",
          },
        ),
        responses: {
          200: jsonResponse("Updated itinerary.", successEnvelope(schemaRef("Itinerary"))),
          ...standardErrors,
        },
      },
    },
    "/itinerary/activity/{itineraryId}/{activityId}/{tripId}": {
      delete: {
        tags: ["Itinerary"],
        operationId: "deleteActivity",
        summary: "Delete an activity",
        description: "Emits `activity_deleted` with `{ itineraryId, activityId }`.",
        parameters: [itineraryIdParameter, activityIdParameter, tripIdParameter],
        responses: {
          200: jsonResponse("Updated itinerary.", successEnvelope(schemaRef("Itinerary"))),
          ...standardErrors,
        },
      },
    },
    "/expenses/add/{tripId}": {
      post: {
        tags: ["Expenses"],
        operationId: "addExpense",
        summary: "Add an expense",
        description: "Requires owner or editor. `selectedTripId` must equal the URL `tripId`. The payer is automatically included in participants. Emits `expense_added`.",
        parameters: [tripIdParameter],
        requestBody: jsonRequest(
          {
            type: "object",
            required: ["selectedTripId", "title", "amount", "category", "splitType"],
            properties: {
              selectedTripId: schemaRef("MongoId"),
              title: { type: "string" },
              description: { type: "string" },
              amount: { type: "number", exclusiveMinimum: 0 },
              category: schemaRef("ExpenseCategory"),
              splitType: { type: "string", enum: ["equally", "selected", "none"] },
              participants: { type: "array", items: schemaRef("MongoId"), default: [] },
              paidBy: { ...schemaRef("MongoId"), description: "Defaults to the current user." },
            },
          },
          {
            selectedTripId: "64b64c7f0f1e2d3c4b5a6978",
            title: "Dinner",
            description: "First-night group dinner",
            amount: 4200,
            category: "Food",
            splitType: "equally",
            participants: ["64b64c7f0f1e2d3c4b5a6979"],
            paidBy: "64b64c7f0f1e2d3c4b5a697a",
          },
        ),
        responses: {
          201: jsonResponse("Expense added.", successEnvelope(schemaRef("Expense"))),
          ...roleErrors,
        },
      },
    },
    "/expenses/debts/{tripId}": {
      get: {
        tags: ["Expenses"],
        operationId: "getTripDebts",
        summary: "Get trip debts and balances",
        description: "Only trip members can retrieve balances.",
        parameters: [tripIdParameter],
        responses: {
          200: jsonResponse("Debt and balance summary.", successEnvelope(schemaRef("DebtSummary"))),
          ...roleErrors,
        },
      },
    },
    "/expenses/trip/{tripId}/debts": {
      get: {
        tags: ["Expenses"],
        operationId: "getTripDebtsAlias",
        summary: "Get trip debts and balances (alias)",
        description: "Compatibility alias for `/expenses/debts/{tripId}`. Prefer the canonical route for new frontend code.",
        deprecated: true,
        parameters: [tripIdParameter],
        responses: {
          200: jsonResponse("Debt and balance summary.", successEnvelope(schemaRef("DebtSummary"))),
          ...roleErrors,
        },
      },
    },
    "/expenses/settle": {
      post: {
        tags: ["Expenses"],
        operationId: "settleDebt",
        summary: "Mark one expense split as settled",
        requestBody: jsonRequest(
          {
            type: "object",
            required: ["expenseId", "userId"],
            properties: {
              expenseId: schemaRef("MongoId"),
              userId: { ...schemaRef("MongoId"), description: "Debtor whose split should be settled." },
            },
          },
          {
            expenseId: "64b64c7f0f1e2d3c4b5a6978",
            userId: "64b64c7f0f1e2d3c4b5a6979",
          },
        ),
        responses: {
          200: jsonResponse("Debt settled.", {
            type: "object",
            required: ["success", "message"],
            properties: {
              success: { type: "boolean", const: true },
              message: { type: "string", example: "Debt settled" },
            },
          }),
          ...standardErrors,
        },
      },
    },
    "/expenses/budgetDashBoard/{tripId}": {
      get: {
        tags: ["Expenses"],
        operationId: "getBudgetDashboard",
        summary: "Get budget analytics",
        description: "Route casing is significant: use `budgetDashBoard` exactly as shown.",
        parameters: [tripIdParameter],
        responses: {
          200: jsonResponse("Budget dashboard.", successEnvelope(schemaRef("BudgetDashboard"))),
          ...standardErrors,
        },
      },
    },
    "/checklist/addItems/{tripId}": {
      post: {
        tags: ["Checklist"],
        operationId: "bulkAddChecklistItems",
        summary: "Add checklist items to a category",
        description: "Requires owner or editor. Creates the checklist/category when needed, filters duplicate item names, and emits `checklist_updated`. If every requested item already exists, the endpoint returns 400.",
        parameters: [tripIdParameter],
        requestBody: jsonRequest(
          {
            type: "object",
            required: ["categoryName", "itemNames"],
            properties: {
              categoryName: { type: "string" },
              itemNames: {
                type: "array",
                minItems: 1,
                items: { type: "string", minLength: 1 },
              },
            },
          },
          { categoryName: "Essentials", itemNames: ["Passport", "Sunscreen", "Power bank"] },
        ),
        responses: {
          200: jsonResponse("Updated checklist.", successEnvelope(schemaRef("Checklist"))),
          ...roleErrors,
        },
      },
    },
    "/checklist/fetchLists/{tripId}": {
      get: {
        tags: ["Checklist"],
        operationId: "getTripChecklist",
        summary: "Get a trip checklist",
        description: "This route is currently public in the backend. An absent checklist returns the trip ID and an empty categories array.",
        security: [],
        parameters: [tripIdParameter],
        responses: {
          200: jsonResponse("Trip checklist.", successEnvelope(schemaRef("Checklist"))),
          500: { $ref: "#/components/responses/ServerError" },
        },
      },
    },
    "/checklist/{tripId}/checklist/{categoryId}/items/{itemId}": {
      post: {
        tags: ["Checklist"],
        operationId: "toggleChecklistItem",
        summary: "Set current user's completion on an item",
        description: "Adds or removes the current user from `completedBy`. Emits `task_toggled`.",
        parameters: [
          tripIdParameter,
          { name: "categoryId", in: "path", required: true, schema: schemaRef("MongoId") },
          { name: "itemId", in: "path", required: true, schema: schemaRef("MongoId") },
        ],
        requestBody: jsonRequest(
          {
            type: "object",
            required: ["isChecked"],
            properties: { isChecked: { type: "boolean" } },
          },
          { isChecked: true },
        ),
        responses: {
          200: jsonResponse("Updated checklist item.", successEnvelope(schemaRef("ChecklistItem"))),
          ...standardErrors,
        },
      },
    },
    "/files/upload-raw": {
      post: {
        tags: ["Files"],
        operationId: "uploadRawFile",
        summary: "Upload a physical file to Cloudinary",
        description: "Step 1 of file creation. Send exactly one multipart field named `file`, then pass the returned values into `/files/finalize` after metadata editing.",
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file"],
                properties: { file: { type: "string", format: "binary" } },
              },
            },
          },
        },
        responses: {
          200: jsonResponse("Cloudinary upload details.", successEnvelope(schemaRef("RawUpload"))),
          ...standardErrors,
        },
      },
    },
    "/files/finalize": {
      post: {
        tags: ["Files"],
        operationId: "finalizeFile",
        summary: "Save uploaded file metadata",
        description: "Step 2 of file creation. `url`, `public_id`, and `size` come from the raw upload response; `name`, `category`, and `notes` can be edited by the user.",
        requestBody: jsonRequest(
          {
            type: "object",
            required: ["tripId", "name", "url", "public_id"],
            properties: {
              tripId: schemaRef("MongoId"),
              name: { type: "string", description: "Include a file extension." },
              category: schemaRef("FileCategory"),
              notes: { type: "string" },
              url: { type: "string", format: "uri" },
              public_id: { type: "string" },
              fileType: { type: "string", example: "application/pdf" },
              size: { type: "integer", minimum: 0, description: "Bytes." },
            },
          },
          {
            tripId: "64b64c7f0f1e2d3c4b5a6978",
            name: "flight-tickets.pdf",
            category: "Tickets",
            notes: "Outbound and return tickets",
            url: "https://res.cloudinary.com/example/raw/upload/tickets.pdf",
            public_id: "TripTribe/1720000000000-tickets.pdf",
            fileType: "application/pdf",
            size: 245760,
          },
        ),
        responses: {
          201: jsonResponse("File record created.", successEnvelope(schemaRef("TripFile"))),
          ...standardErrors,
        },
      },
    },
    "/files/{tripId}": {
      get: {
        tags: ["Files"],
        operationId: "listTripFiles",
        summary: "List trip files",
        parameters: [tripIdParameter],
        responses: {
          200: jsonResponse(
            "Files sorted newest first.",
            successEnvelope(
              { type: "array", items: schemaRef("TripFile") },
              { count: { type: "integer", minimum: 0 } },
            ),
          ),
          ...standardErrors,
        },
      },
    },
    "/discussion/{tripId}": {
      get: {
        tags: ["Discussion"],
        operationId: "getTripMessages",
        summary: "List trip discussion messages",
        description: "Messages are returned in chronological order.",
        parameters: [tripIdParameter],
        responses: {
          200: jsonResponse(
            "Chronological messages.",
            successEnvelope({ type: "array", items: schemaRef("Message") }),
          ),
          ...standardErrors,
        },
      },
    },
    "/discussion/send": {
      post: {
        tags: ["Discussion"],
        operationId: "sendTripMessage",
        summary: "Send a trip discussion message",
        description: "Emits `new_discussion_message` with the populated message.",
        requestBody: jsonRequest(
          {
            type: "object",
            required: ["tripId", "text"],
            properties: {
              tripId: schemaRef("MongoId"),
              text: { type: "string", minLength: 1 },
            },
          },
          { tripId: "64b64c7f0f1e2d3c4b5a6978", text: "Meet in the lobby at 8:45." },
        ),
        responses: {
          201: jsonResponse("Message created.", successEnvelope(schemaRef("Message"))),
          ...standardErrors,
        },
      },
    },
    "/ai/status": {
      get: {
        tags: ["AI"],
        operationId: "getAiStatus",
        summary: "Which AI features are available, and what they cost",
        responses: {
          200: jsonResponse("AI availability.", successEnvelope(schemaRef("AiStatus"))),
          ...standardErrors,
        },
      },
    },
    "/ai/threads": {
      post: {
        tags: ["AI"],
        operationId: "createAiThread",
        summary: "Start a conversation, optionally about a trip",
        requestBody: jsonRequest(
          {
            type: "object",
            properties: { tripId: schemaRef("MongoId"), title: { type: "string" } },
          },
          { tripId: "64b64c7f0f1e2d3c4b5a6978" },
        ),
        responses: {
          201: jsonResponse("Conversation created.", successEnvelope(schemaRef("AiThread"))),
          ...roleErrors,
          503: aiUnavailable,
        },
      },
      get: {
        tags: ["AI"],
        operationId: "listAiThreads",
        summary: "List your conversations, newest first",
        parameters: [{ name: "tripId", in: "query", required: false, schema: schemaRef("MongoId") }],
        responses: {
          200: jsonResponse("Conversations.", successEnvelope({ type: "array", items: schemaRef("AiThread") })),
          ...standardErrors,
        },
      },
    },
    "/ai/threads/{threadId}/messages": {
      get: {
        tags: ["AI"],
        operationId: "getAiThreadMessages",
        summary: "A conversation and its messages",
        parameters: [threadIdParameter],
        responses: {
          200: jsonResponse(
            "Conversation with messages.",
            successEnvelope({
              type: "object",
              properties: {
                thread: schemaRef("AiThread"),
                messages: { type: "array", items: schemaRef("AiMessage") },
                activeJob: { anyOf: [schemaRef("AiJob"), { type: "null" }], description: "The reply still being written, if any." },
              },
            }),
          ),
          ...standardErrors,
        },
      },
    },
    "/ai/chat": {
      post: {
        tags: ["AI"],
        operationId: "sendAiChatMessage",
        summary: "Ask the assistant a question (1 credit)",
        description: "Saves the message and starts a chat job. Poll `GET /ai/jobs/{jobId}`; the reply is in `result.reply` and is also saved to the thread. Omit `threadId` to start a new conversation.",
        requestBody: jsonRequest(
          {
            type: "object",
            required: ["message"],
            properties: {
              message: { type: "string", minLength: 1, maxLength: 4000 },
              threadId: schemaRef("MongoId"),
              tripId: schemaRef("MongoId"),
            },
          },
          { message: "What should we pack for a monsoon trip to Coorg?", tripId: "64b64c7f0f1e2d3c4b5a6978" },
        ),
        responses: {
          202: jsonResponse(
            "Job started.",
            successEnvelope({
              type: "object",
              properties: {
                jobId: schemaRef("MongoId"),
                threadId: schemaRef("MongoId"),
                messageId: schemaRef("MongoId"),
                cost: { type: "integer" },
              },
            }),
          ),
          ...roleErrors,
          402: insufficientCredits,
          409: jsonResponse("A reply is still being written for this conversation.", schemaRef("Error")),
          503: aiUnavailable,
        },
      },
    },
    "/ai/packing-list": {
      post: {
        tags: ["AI"],
        operationId: "requestAiPackingList",
        summary: "Suggest packing items for a trip (2 credits)",
        description: "Result: `result.categories[]` of `{ name, items: [{ title, reason }] }`, excluding items already on the checklist. Nothing is added to the checklist automatically.",
        requestBody: jsonRequest(
          { type: "object", required: ["tripId"], properties: { tripId: schemaRef("MongoId") } },
          { tripId: "64b64c7f0f1e2d3c4b5a6978" },
        ),
        responses: {
          202: jsonResponse("Job started.", successEnvelope(schemaRef("AiJobStarted"))),
          ...roleErrors,
          402: insufficientCredits,
          503: aiUnavailable,
        },
      },
    },
    "/ai/receipt": {
      post: {
        tags: ["AI"],
        operationId: "requestAiReceiptScan",
        summary: "Read a receipt photo into a draft expense (1 credit)",
        description: "Result: `result.draft` with title, amount, currency, category and description for the Add Expense form. No expense is created, and the photo is deleted once read.",
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["image"],
                properties: {
                  image: { type: "string", format: "binary", description: "JPEG, PNG, WebP or GIF, up to 5 MB." },
                  tripId: schemaRef("MongoId"),
                },
              },
            },
          },
        },
        responses: {
          202: jsonResponse("Job started.", successEnvelope(schemaRef("AiJobStarted"))),
          ...roleErrors,
          402: insufficientCredits,
          413: jsonResponse("The photo is larger than 5 MB.", schemaRef("Error")),
          503: aiUnavailable,
        },
      },
    },
    "/ai/plan": {
      post: {
        tags: ["AI"],
        operationId: "requestAiTripPlan",
        summary: "Draft a day-by-day plan for a trip (owner or editor)",
        description: "Costs 20 credits for up to 5 days, plus 4 per extra day; trips of up to 14 days. Requires Google Maps on the server. Result: `result.proposalId` — review it with `GET /ai/proposals/{proposalId}`.",
        requestBody: jsonRequest(
          {
            type: "object",
            required: ["tripId"],
            properties: {
              tripId: schemaRef("MongoId"),
              request: { type: "string", maxLength: 2000 },
            },
          },
          { tripId: "64b64c7f0f1e2d3c4b5a6978", request: "Relaxed pace, lots of beaches and seafood, one day for Old Goa churches." },
        ),
        responses: {
          202: jsonResponse("Job started.", successEnvelope(schemaRef("AiJobStarted"))),
          ...roleErrors,
          402: insufficientCredits,
          409: jsonResponse("A plan for this trip is already being built.", schemaRef("Error")),
          503: aiUnavailable,
        },
      },
    },
    "/ai/plans": {
      get: {
        tags: ["AI"],
        operationId: "listTripPlans",
        summary: "A trip's recent AI plans and the plan being built, if any (any member)",
        description: "`activeJob` is the full job for the member who requested it; other members get only `{ _id, kind, status, mine: false }`.",
        parameters: [{ name: "tripId", in: "query", required: true, schema: schemaRef("MongoId") }],
        responses: {
          200: jsonResponse(
            "Plans.",
            successEnvelope({
              type: "object",
              properties: {
                activeJob: { type: ["object", "null"], additionalProperties: true },
                proposals: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      _id: schemaRef("MongoId"),
                      status: { type: "string", enum: ["pending", "partially_accepted", "accepted", "rejected"] },
                      summary: { type: "string" },
                      request: { type: "string" },
                      createdBy: schemaRef("MongoId"),
                      createdAt: { type: "string", format: "date-time" },
                      activityCount: { type: "integer" },
                      acceptedCount: { type: "integer" },
                    },
                  },
                },
              },
            }),
          ),
          ...roleErrors,
        },
      },
    },
    "/ai/jobs/{jobId}": {
      get: {
        tags: ["AI"],
        operationId: "getAiJob",
        summary: "Job progress and result",
        parameters: [jobIdParameter],
        responses: {
          200: jsonResponse("Job.", successEnvelope(schemaRef("AiJob"))),
          ...standardErrors,
        },
      },
    },
    "/ai/jobs/{jobId}/cancel": {
      post: {
        tags: ["AI"],
        operationId: "cancelAiJob",
        summary: "Cancel a running job",
        description: "The job stops at its next step and its credits are refunded.",
        parameters: [jobIdParameter],
        responses: {
          202: jsonResponse("Cancellation requested.", successEnvelope(schemaRef("AiJob"))),
          ...standardErrors,
          409: jsonResponse("The job has already finished.", schemaRef("Error")),
        },
      },
    },
    "/ai/proposals/{proposalId}": {
      get: {
        tags: ["AI"],
        operationId: "getItineraryProposal",
        summary: "An AI-drafted plan for review",
        parameters: [proposalIdParameter],
        responses: {
          200: jsonResponse("Proposal.", successEnvelope(schemaRef("ItineraryProposal"))),
          ...roleErrors,
        },
      },
    },
    "/ai/proposals/{proposalId}/accept": {
      post: {
        tags: ["AI"],
        operationId: "acceptItineraryProposal",
        summary: "Add proposed activities to the itinerary (owner or editor)",
        description: "Omit `activityIds` to accept every remaining activity. Accepting is idempotent: an activity already added isn't added again. Emits `activity_added` per affected day.",
        parameters: [proposalIdParameter],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: { activityIds: { type: "array", items: schemaRef("MongoId") } },
              },
            },
          },
        },
        responses: {
          200: jsonResponse(
            "Activities added.",
            successEnvelope({
              type: "object",
              properties: { proposal: schemaRef("ItineraryProposal"), added: { type: "integer" } },
            }),
          ),
          ...roleErrors,
          409: jsonResponse("The proposal was dismissed.", schemaRef("Error")),
        },
      },
    },
    "/ai/proposals/{proposalId}/reject": {
      post: {
        tags: ["AI"],
        operationId: "rejectItineraryProposal",
        summary: "Dismiss a proposal (owner or editor)",
        parameters: [proposalIdParameter],
        responses: {
          200: jsonResponse("Proposal dismissed.", successEnvelope(schemaRef("ItineraryProposal"))),
          ...roleErrors,
          409: jsonResponse("The proposal is already fully on the itinerary.", schemaRef("Error")),
        },
      },
    },
    "/credits/balance": {
      get: {
        tags: ["Credits"],
        operationId: "getCreditBalance",
        summary: "Your AI credit balance",
        description: "Free credits are granted each month and don't roll over. Reading the balance writes this month's grant if needed.",
        responses: {
          200: jsonResponse("Balance.", successEnvelope(schemaRef("CreditBalance"))),
          ...standardErrors,
        },
      },
    },
    "/credits/ledger": {
      get: {
        tags: ["Credits"],
        operationId: "getCreditLedger",
        summary: "Your latest 100 credit ledger entries, newest first",
        responses: {
          200: jsonResponse(
            "Ledger entries.",
            successEnvelope({ type: "array", items: schemaRef("CreditLedgerEntry") }),
          ),
          ...standardErrors,
        },
      },
    },
  },
  components: {
    securitySchemes: {
      ClerkBearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "Clerk session JWT",
        description: "Current Clerk session token from the frontend authentication SDK.",
      },
    },
    responses: {
      BadRequest: jsonResponse("Invalid input or request state.", schemaRef("Error")),
      Unauthorized: jsonResponse("Missing or invalid Clerk authentication.", schemaRef("Error")),
      Forbidden: jsonResponse("The user is not a trip member or lacks the required role.", schemaRef("Error")),
      NotFound: jsonResponse("Requested resource was not found.", schemaRef("Error")),
      ServerError: jsonResponse("Unexpected server error.", schemaRef("Error")),
    },
    schemas: {
      AiStatus: {
        type: "object",
        properties: {
          ai: { type: "boolean" },
          planner: {
            type: "object",
            properties: {
              available: { type: "boolean" },
              reason: { type: ["string", "null"] },
            },
          },
          jobRunner: { type: "string", enum: ["inngest", "inline"] },
          costs: { type: "object", additionalProperties: true },
        },
      },
      AiThread: {
        type: "object",
        properties: {
          _id: schemaRef("MongoId"),
          user: schemaRef("MongoId"),
          trip: { anyOf: [schemaRef("MongoId"), { type: "null" }] },
          title: { type: "string" },
          lastMessageAt: { type: "string", format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      AiMessage: {
        type: "object",
        properties: {
          _id: schemaRef("MongoId"),
          thread: schemaRef("MongoId"),
          user: schemaRef("MongoId"),
          role: { type: "string", enum: ["user", "assistant"] },
          content: { type: "string" },
          suggestions: { type: "array", items: { type: "string" } },
          job: { anyOf: [schemaRef("MongoId"), { type: "null" }] },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      AiJobStarted: {
        type: "object",
        properties: {
          jobId: schemaRef("MongoId"),
          cost: { type: "integer", description: "Credits held for this job; refunded if it fails." },
        },
      },
      AiJob: {
        type: "object",
        properties: {
          _id: schemaRef("MongoId"),
          kind: { type: "string", enum: ["chat", "packing", "receipt", "plan"] },
          status: { type: "string", enum: ["queued", "running", "succeeded", "failed", "cancelled"] },
          cost: { type: "integer" },
          trip: { anyOf: [schemaRef("MongoId"), { type: "null" }] },
          thread: { anyOf: [schemaRef("MongoId"), { type: "null" }] },
          proposal: { anyOf: [schemaRef("MongoId"), { type: "null" }] },
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                key: { type: "string" },
                label: { type: "string" },
                status: { type: "string", enum: ["pending", "running", "done", "skipped", "failed"] },
                startedAt: { type: "string", format: "date-time" },
                finishedAt: { type: "string", format: "date-time" },
              },
            },
          },
          result: {
            type: ["object", "null"],
            additionalProperties: true,
            description:
              "Set when succeeded. chat: `{ threadId, messageId, reply, suggestions }`; packing: `{ tripId, categories, weather }`; receipt: `{ tripId, draft }`; plan: `{ tripId, proposalId }`.",
          },
          error: {
            type: ["object", "null"],
            properties: { code: { type: "string" }, message: { type: "string" } },
          },
          cancelRequested: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
          startedAt: { type: ["string", "null"], format: "date-time" },
          finishedAt: { type: ["string", "null"], format: "date-time" },
        },
      },
      ItineraryProposal: {
        type: "object",
        properties: {
          _id: schemaRef("MongoId"),
          trip: schemaRef("MongoId"),
          job: schemaRef("MongoId"),
          createdBy: schemaRef("MongoId"),
          request: { type: "string" },
          summary: { type: "string" },
          pace: { type: "string", enum: ["relaxed", "balanced", "packed"] },
          days: {
            type: "array",
            items: {
              type: "object",
              properties: {
                date: { type: "string", format: "date" },
                title: { type: "string" },
                activities: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      _id: schemaRef("MongoId"),
                      placeId: { type: "string" },
                      title: { type: "string" },
                      section: { type: "string" },
                      time: { type: ["string", "null"], description: "24-hour HH:MM" },
                      type: schemaRef("ActivityType"),
                      estCostPerPerson: { type: "number" },
                      durationMin: { type: "integer" },
                      notes: { type: "string" },
                      travelFromPreviousMin: { type: ["integer", "null"] },
                      place: {
                        type: "object",
                        properties: {
                          placeId: { type: "string" },
                          name: { type: "string" },
                          address: { type: "string" },
                          lat: { type: "number" },
                          lng: { type: "number" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          gaps: { type: "array", items: { type: "string" } },
          warnings: {
            type: "array",
            items: {
              type: "object",
              properties: {
                date: { type: "string", format: "date" },
                messages: { type: "array", items: { type: "string" } },
              },
            },
          },
          weather: { type: "array", items: { type: "object", additionalProperties: true } },
          budgetEstimate: { type: ["object", "null"], additionalProperties: true },
          status: { type: "string", enum: ["pending", "partially_accepted", "accepted", "rejected"] },
          acceptedActivityIds: { type: "array", items: schemaRef("MongoId") },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      CreditBalance: {
        type: "object",
        properties: {
          free: { type: "integer" },
          paid: { type: "integer" },
          total: { type: "integer" },
          monthlyFreeCredits: { type: "integer" },
          freeResetsAt: { type: "string", format: "date-time" },
        },
      },
      CreditLedgerEntry: {
        type: "object",
        properties: {
          _id: schemaRef("MongoId"),
          bucket: { type: "string", enum: ["free", "paid"] },
          delta: { type: "number" },
          reason: { type: "string", enum: ["grant", "expire", "hold", "refund", "purchase", "adjustment"] },
          job: { anyOf: [schemaRef("MongoId"), { type: "null" }] },
          note: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      MongoId: {
        type: "string",
        pattern: "^[a-fA-F0-9]{24}$",
        example: "64b64c7f0f1e2d3c4b5a6978",
      },
      TripRole: {
        type: "string",
        enum: ["owner", "editor", "viewer"],
      },
      ActivityType: {
        type: "string",
        enum: ["Flight", "Hotel", "Food", "Sightseeing", "Activity", "Shopping", "Transport", "Other"],
        default: "Activity",
      },
      ExpenseCategory: {
        type: "string",
        enum: ["Food", "Transport", "Activities", "Shopping", "Hotel", "Other"],
        default: "Other",
      },
      FileCategory: {
        type: "string",
        enum: ["Bookings", "Tickets", "Photos", "Guides", "General"],
        default: "General",
      },
      Error: {
        type: "object",
        description: "Error envelopes vary slightly depending on whether middleware or the centralized handler produced them.",
        properties: {
          success: { type: "boolean", const: false },
          message: { type: "string" },
          error: { type: "string" },
          stack: { type: "string", description: "Development environment only." },
        },
        anyOf: [{ required: ["message"] }, { required: ["error"] }],
        example: { success: false, message: "Unauthorized" },
      },
      UserSummary: {
        type: "object",
        required: ["_id"],
        properties: {
          _id: schemaRef("MongoId"),
          name: { type: "string" },
          email: { type: "string", format: "email" },
          imageUrl: { type: "string", format: "uri" },
        },
      },
      User: {
        allOf: [
          schemaRef("UserSummary"),
          {
            type: "object",
            required: ["clerkId", "email", "isActive", "createdAt", "updatedAt"],
            properties: {
              clerkId: { type: "string" },
              isActive: { type: "boolean", default: true },
              createdAt: { type: "string", format: "date-time" },
              updatedAt: { type: "string", format: "date-time" },
            },
          },
        ],
      },
      TripImage: {
        type: "object",
        required: ["url"],
        properties: {
          url: { type: "string", format: "uri" },
          public_id: { type: "string" },
        },
      },
      TripMember: {
        type: "object",
        required: ["user", "role", "joinedAt"],
        properties: {
          user: { oneOf: [schemaRef("MongoId"), schemaRef("UserSummary")] },
          role: schemaRef("TripRole"),
          joinedAt: { type: "string", format: "date-time" },
        },
      },
      BudgetCategories: {
        type: "object",
        required: ["Food", "Transport", "Activities", "Hotel", "Shopping", "Other"],
        properties: {
          Food: { type: "number", minimum: 0 },
          Transport: { type: "number", minimum: 0 },
          Activities: { type: "number", minimum: 0 },
          Hotel: { type: "number", minimum: 0 },
          Shopping: { type: "number", minimum: 0 },
          Other: { type: "number", minimum: 0 },
        },
      },
      Budget: {
        type: "object",
        required: ["total", "currency", "categories"],
        properties: {
          total: { type: "number", minimum: 0, default: 6000 },
          currency: { type: "string", default: "INR" },
          categories: schemaRef("BudgetCategories"),
        },
      },
      Trip: {
        type: "object",
        required: ["_id", "name", "location", "image", "inviteCode", "members", "startDate", "endDate", "budget", "createdBy", "createdAt", "updatedAt"],
        properties: {
          _id: schemaRef("MongoId"),
          name: { type: "string" },
          location: { type: "string" },
          description: { type: "string" },
          image: schemaRef("TripImage"),
          inviteCode: { type: "string", pattern: "^[a-f0-9]{8}$" },
          members: { type: "array", items: schemaRef("TripMember") },
          startDate: { type: "string", format: "date-time" },
          endDate: { type: "string", format: "date-time" },
          budget: schemaRef("Budget"),
          createdBy: { oneOf: [schemaRef("MongoId"), schemaRef("UserSummary")] },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      ActivityComment: {
        type: "object",
        properties: {
          _id: schemaRef("MongoId"),
          user: { oneOf: [schemaRef("MongoId"), schemaRef("UserSummary")] },
          text: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
        },
      },
      Activity: {
        type: "object",
        required: ["_id", "title", "type", "isDone", "comments"],
        properties: {
          _id: schemaRef("MongoId"),
          title: { type: "string" },
          time: { type: "string" },
          location: { type: "string" },
          type: schemaRef("ActivityType"),
          notes: { type: "string" },
          attachment: { type: ["string", "null"] },
          isDone: { type: "boolean", default: false },
          comments: { type: "array", items: schemaRef("ActivityComment") },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      ItinerarySection: {
        type: "object",
        required: ["_id", "section", "activities"],
        properties: {
          _id: schemaRef("MongoId"),
          section: { type: "string" },
          activities: { type: "array", items: schemaRef("Activity") },
        },
      },
      Itinerary: {
        type: "object",
        required: ["_id", "trip", "date", "sections", "createdAt", "updatedAt"],
        properties: {
          _id: schemaRef("MongoId"),
          trip: schemaRef("MongoId"),
          date: { type: "string", format: "date-time" },
          sections: { type: "array", items: schemaRef("ItinerarySection") },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      SplitDetail: {
        type: "object",
        required: ["user", "share", "isSettled"],
        properties: {
          user: { oneOf: [schemaRef("MongoId"), schemaRef("UserSummary")] },
          share: { type: "number" },
          isSettled: { type: "boolean", default: false },
        },
      },
      Expense: {
        type: "object",
        required: ["_id", "trip", "title", "amount", "currency", "category", "paidBy", "recordedBy", "splitType", "participants", "splitDetails", "expenseDate"],
        properties: {
          _id: schemaRef("MongoId"),
          trip: schemaRef("MongoId"),
          title: { type: "string" },
          description: { type: "string" },
          amount: { type: "number" },
          currency: { type: "string", default: "USD" },
          category: schemaRef("ExpenseCategory"),
          paidBy: { oneOf: [schemaRef("MongoId"), schemaRef("UserSummary")] },
          recordedBy: { oneOf: [schemaRef("MongoId"), schemaRef("UserSummary")] },
          splitType: { type: "string", enum: ["equally", "selected", "none"] },
          participants: {
            type: "array",
            items: { oneOf: [schemaRef("MongoId"), schemaRef("UserSummary")] },
          },
          splitDetails: { type: "array", items: schemaRef("SplitDetail") },
          expenseDate: { type: "string", format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Debt: {
        type: "object",
        required: ["from", "to", "amount", "title", "expenseId"],
        properties: {
          from: schemaRef("UserSummary"),
          to: schemaRef("UserSummary"),
          amount: { type: "number" },
          title: { type: "string" },
          recordedBy: { oneOf: [schemaRef("MongoId"), schemaRef("UserSummary")] },
          expenseId: schemaRef("MongoId"),
        },
      },
      DebtSummary: {
        type: "object",
        required: ["totalDebt", "yourBalance", "debts", "travelerBalances"],
        properties: {
          totalDebt: { type: "number" },
          yourBalance: { type: "number", description: "Positive means the current user is owed money; negative means they owe money." },
          debts: { type: "array", items: schemaRef("Debt") },
          travelerBalances: {
            type: "array",
            items: {
              type: "object",
              required: ["user", "balance"],
              properties: {
                user: schemaRef("UserSummary"),
                balance: { type: "number" },
              },
            },
          },
        },
      },
      BudgetDashboard: {
        type: "object",
        required: ["totalBudget", "totalSpent", "remaining", "utilization", "categories", "recentExpenses"],
        properties: {
          totalBudget: { type: "number" },
          totalSpent: { type: "number" },
          remaining: { type: "number" },
          utilization: { type: "number", description: "Percentage; can exceed 100." },
          categories: {
            type: "array",
            items: {
              type: "object",
              required: ["category", "spent", "limit", "percentage"],
              properties: {
                category: schemaRef("ExpenseCategory"),
                spent: { type: "number" },
                limit: { type: "number" },
                percentage: { type: "number", minimum: 0, maximum: 100 },
              },
            },
          },
          recentExpenses: { type: "array", maxItems: 5, items: schemaRef("Expense") },
        },
      },
      ChecklistItem: {
        type: "object",
        required: ["_id", "title", "completedBy"],
        properties: {
          _id: schemaRef("MongoId"),
          title: { type: "string" },
          completedBy: {
            type: "array",
            items: { oneOf: [schemaRef("MongoId"), schemaRef("UserSummary")] },
          },
        },
      },
      ChecklistCategory: {
        type: "object",
        required: ["_id", "name", "items"],
        properties: {
          _id: schemaRef("MongoId"),
          name: { type: "string" },
          items: { type: "array", items: schemaRef("ChecklistItem") },
        },
      },
      Checklist: {
        type: "object",
        required: ["tripId", "categories"],
        properties: {
          _id: schemaRef("MongoId"),
          tripId: { type: "string", description: "Stored as a string by the current checklist model." },
          categories: { type: "array", items: schemaRef("ChecklistCategory") },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      RawUpload: {
        type: "object",
        required: ["url", "public_id", "originalName", "mimetype", "size"],
        properties: {
          url: { type: "string", format: "uri" },
          public_id: { type: "string" },
          originalName: { type: "string" },
          mimetype: { type: "string" },
          size: { type: "integer", minimum: 0, description: "Bytes." },
        },
      },
      TripFile: {
        type: "object",
        required: ["_id", "tripId", "uploadedBy", "name", "category", "url", "public_id"],
        properties: {
          _id: schemaRef("MongoId"),
          tripId: schemaRef("MongoId"),
          uploadedBy: { oneOf: [schemaRef("MongoId"), schemaRef("UserSummary")] },
          name: { type: "string" },
          category: schemaRef("FileCategory"),
          notes: { type: "string" },
          url: { type: "string", format: "uri" },
          public_id: { type: "string" },
          fileType: { type: "string" },
          fileExtension: { type: "string" },
          size: { type: "integer", minimum: 0 },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Message: {
        type: "object",
        required: ["_id", "trip", "sender", "text", "createdAt"],
        properties: {
          _id: schemaRef("MongoId"),
          trip: schemaRef("MongoId"),
          sender: { oneOf: [schemaRef("MongoId"), schemaRef("UserSummary")] },
          text: { type: "string" },
          createdAt: { type: "string", format: "date-time" },
          updatedAt: { type: "string", format: "date-time" },
        },
      },
      Health: {
        type: "object",
        required: ["success", "message", "timestamp", "uptime", "environment", "database", "memory"],
        properties: {
          success: { type: "boolean", const: true },
          message: { type: "string" },
          timestamp: { type: "string", format: "date-time" },
          uptime: { type: "number" },
          environment: { type: "string" },
          database: {
            type: "object",
            properties: {
              status: { type: "string", enum: ["connected", "disconnected"] },
              host: { type: "string" },
            },
          },
          memory: {
            type: "object",
            properties: {
              used: { type: "string", example: "42 MB" },
              total: { type: "string", example: "64 MB" },
            },
          },
        },
      },
      DetailedHealth: {
        type: "object",
        required: ["success", "timestamp", "uptime", "environment", "version", "platform", "database", "memory", "cpu"],
        properties: {
          success: { type: "boolean", const: true },
          timestamp: { type: "string", format: "date-time" },
          uptime: { type: "number" },
          environment: { type: "string" },
          version: { type: "string" },
          platform: { type: "string" },
          database: {
            type: "object",
            properties: {
              status: { type: "string", enum: ["connected", "disconnected"] },
              host: { type: "string" },
              name: { type: "string" },
            },
          },
          memory: {
            type: "object",
            properties: {
              used: { type: "string", example: "42 MB" },
              total: { type: "string", example: "64 MB" },
              external: { type: "string", example: "8 MB" },
            },
          },
          cpu: {
            type: "object",
            properties: {
              usage: {
                type: "object",
                properties: {
                  user: { type: "integer" },
                  system: { type: "integer" },
                },
              },
            },
          },
        },
      },
    },
  },
  "x-socket-io": {
    connection: "Connect to the API origin with Socket.IO, then emit join_trip with the active trip ID.",
    clientEvents: ["join_trip", "typing_start", "typing_stop"],
    serverEvents: [
      "member_joined",
      "activity_added",
      "activity_updated",
      "activity_deleted",
      "expense_added",
      "checklist_updated",
      "task_toggled",
      "new_discussion_message",
      "user_typing",
    ],
  },
};

export default openApiDocument;
