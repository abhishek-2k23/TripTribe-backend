import healthRoutes from "../routes/health.js";
import userRoutes from "../routes/user.routes.js";
import tripRoutes from "../routes/trip.routes.js";
import itineraryRoutes from "../routes/itinerary.routes.js";
import expenseRoutes from "../routes/expense.routes.js";
import checklistRoutes from "../routes/checklist.router.js";
import fileRoutes from "../routes/uploadRoutes.js";
import discussionRoutes from "../routes/message.router.js";
import aiRoutes from "../routes/ai.routes.js";
import creditsRoutes from "../routes/credits.routes.js";
import syncRoutes from "../routes/sync.routes.js";
import deviceRoutes from "../routes/device.routes.js";
import openApiDocument from "../docs/openapi.js";

const routeGroups = [
  ["/ai", aiRoutes],
  ["/credits", creditsRoutes],
  ["/health", healthRoutes],
  ["/users", userRoutes],
  ["/trips", tripRoutes],
  ["/itinerary", itineraryRoutes],
  ["/expenses", expenseRoutes],
  ["/checklist", checklistRoutes],
  ["/files", fileRoutes],
  ["/discussion", discussionRoutes],
  ["/sync", syncRoutes],
  ["/devices", deviceRoutes],
];

const normalizeExpressPath = (path) =>
  path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");

const actualOperations = new Set();

for (const [basePath, router] of routeGroups) {
  for (const layer of router.stack) {
    if (!layer.route) continue;

    const paths = Array.isArray(layer.route.path)
      ? layer.route.path
      : [layer.route.path];

    for (const path of paths) {
      for (const method of Object.keys(layer.route.methods)) {
        const fullPath = `${basePath}${path}`.replace(/\/$/, "");
        actualOperations.add(
          `${method.toUpperCase()} ${normalizeExpressPath(fullPath)}`,
        );
      }
    }
  }
}

const documentedOperations = new Set();
const operationIds = new Set();
const httpMethods = ["get", "post", "put", "patch", "delete", "options", "head"];

for (const [path, pathItem] of Object.entries(openApiDocument.paths)) {
  for (const method of httpMethods) {
    const operation = pathItem[method];
    if (!operation) continue;

    documentedOperations.add(`${method.toUpperCase()} ${path}`);

    if (!operation.operationId) {
      throw new Error(`${method.toUpperCase()} ${path} has no operationId`);
    }
    if (operationIds.has(operation.operationId)) {
      throw new Error(`Duplicate operationId: ${operation.operationId}`);
    }
    operationIds.add(operation.operationId);

    const declaredPathParams = new Set(
      [...(pathItem.parameters || []), ...(operation.parameters || [])]
        .filter((parameter) => parameter.in === "path")
        .map((parameter) => parameter.name),
    );
    const templateParams = [...path.matchAll(/\{([^}]+)\}/g)].map(
      (match) => match[1],
    );

    for (const parameter of templateParams) {
      if (!declaredPathParams.has(parameter)) {
        throw new Error(
          `${method.toUpperCase()} ${path} does not declare path parameter ${parameter}`,
        );
      }
    }
  }
}

const missingFromDocs = [...actualOperations].filter(
  (operation) => !documentedOperations.has(operation),
);
const missingFromRoutes = [...documentedOperations].filter(
  (operation) => !actualOperations.has(operation),
);

if (missingFromDocs.length || missingFromRoutes.length) {
  throw new Error(
    [
      missingFromDocs.length
        ? `Undocumented routes:\n- ${missingFromDocs.join("\n- ")}`
        : "",
      missingFromRoutes.length
        ? `Documented routes not found in Express:\n- ${missingFromRoutes.join("\n- ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

const resolveJsonPointer = (document, pointer) => {
  if (!pointer.startsWith("#/")) return undefined;
  return pointer
    .slice(2)
    .split("/")
    .reduce(
      (value, segment) =>
        value?.[segment.replace(/~1/g, "/").replace(/~0/g, "~")],
      document,
    );
};

const inspectReferences = (value, location = "#") => {
  if (!value || typeof value !== "object") return;

  if (typeof value.$ref === "string" && value.$ref.startsWith("#/")) {
    if (!resolveJsonPointer(openApiDocument, value.$ref)) {
      throw new Error(`Unresolved reference ${value.$ref} at ${location}`);
    }
  }

  for (const [key, child] of Object.entries(value)) {
    inspectReferences(child, `${location}/${key}`);
  }
};

inspectReferences(openApiDocument);

console.log(
  `OpenAPI validation passed: ${documentedOperations.size} operations, ${operationIds.size} unique operation IDs, all local references resolved.`,
);
