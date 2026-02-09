// src/lib/visibility.ts
import type { Prisma } from "@prisma/client";
import { RecordVisibility, RelationshipType } from "@prisma/client";

/**
 * VisibilityError
 * - Throw from helpers; routes can catch and respond with status.
 */
export class VisibilityError extends Error {
  status: number;
  code: "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "BAD_REQUEST";

  constructor(
    message: string,
    opts: { status?: number; code?: VisibilityError["code"] } = {}
  ) {
    super(message);
    this.name = "VisibilityError";
    this.status = opts.status ?? 403;
    this.code = opts.code ?? "FORBIDDEN";
  }
}

/**
 * Visibility context
 * - Pass this around everywhere after requireWorkspace()
 */
export type VisibilityCtx = {
  workspaceId: string;
  userId: string;

  /**
   * Optional override for OWNER/ADMIN roles.
   * Default false everywhere (privacy-first).
   *
   * If you enable it later, do it per-endpoint intentionally.
   */
  isWorkspaceAdmin?: boolean;
};

/* -------------------------------------------------------
 * Internal guardrails
 * ----------------------------------------------------- */

function assertCtx(ctx: VisibilityCtx): asserts ctx is VisibilityCtx {
  if (!ctx?.workspaceId || !ctx?.userId) {
    throw new VisibilityError("Missing workspace context", {
      status: 401,
      code: "UNAUTHORIZED",
    });
  }
}

/**
 * Always-scope helper: use in every where clause (or via whereReadableX)
 */
export function ws(ctx: VisibilityCtx): Prisma.WorkspaceWhereUniqueInput & { id: string } {
  assertCtx(ctx);
  return { id: ctx.workspaceId };
}

/**
 * Workspace scope fragment for model where clauses
 */
export function wsWhere(ctx: VisibilityCtx): { workspaceId: string } {
  assertCtx(ctx);
  return { workspaceId: ctx.workspaceId };
}

/* -------------------------------------------------------
 * Core gates
 * ----------------------------------------------------- */

/**
 * Standard gate for models with:
 * - workspaceId
 * - visibility
 * - ownerUserId (or other owner field)
 *
 * NOTE: returns Prisma.InputJsonObject so we can reuse across models safely.
 */
export function gateVisibility(params: {
  ctx: VisibilityCtx;
  visibilityField?: string; // default "visibility"
  ownerField?: string; // default "ownerUserId"
}): Prisma.InputJsonObject {
  assertCtx(params.ctx);

  const visibilityField = params.visibilityField ?? "visibility";
  const ownerField = params.ownerField ?? "ownerUserId";

  if (params.ctx.isWorkspaceAdmin) return {};

  return {
    OR: [
      { [visibilityField]: RecordVisibility.WORKSPACE },
      {
        AND: [
          { [visibilityField]: RecordVisibility.PRIVATE },
          { [ownerField]: params.ctx.userId },
        ],
      },
    ],
  };
}

/**
 * Standard gate for models with:
 * - workspaceId
 * - visibility
 * - createdByUserId (PRIVATE uses createdByUserId)
 *
 * Used for Automation in your schema.
 */
export function gateVisibilityByCreator(params: {
  ctx: VisibilityCtx;
  visibilityField?: string; // default "visibility"
  createdByField?: string; // default "createdByUserId"
}): Prisma.InputJsonObject {
  assertCtx(params.ctx);

  const visibilityField = params.visibilityField ?? "visibility";
  const createdByField = params.createdByField ?? "createdByUserId";

  if (params.ctx.isWorkspaceAdmin) return {};

  return {
    OR: [
      { [visibilityField]: RecordVisibility.WORKSPACE },
      {
        AND: [
          { [visibilityField]: RecordVisibility.PRIVATE },
          { [createdByField]: params.ctx.userId },
        ],
      },
    ],
  };
}

/**
 * Assigned-only gate (implicit privacy).
 * - If nullable assignment: null is NOT readable by default.
 */
export function gateAssigned(params: {
  ctx: VisibilityCtx;
  assignedField?: string; // default "assignedToUserId"
  allowNullIfAdmin?: boolean; // default false
}): Prisma.InputJsonObject {
  assertCtx(params.ctx);

  const assignedField = params.assignedField ?? "assignedToUserId";

  if (params.allowNullIfAdmin && params.ctx.isWorkspaceAdmin) return {};

  return { [assignedField]: params.ctx.userId };
}

/**
 * Task gate:
 * - assignedToUserId = currentUserId
 * OR
 * - assignedToUserId is null AND createdByUserId = currentUserId
 */
export function gateTask(ctx: VisibilityCtx): Prisma.TaskWhereInput {
  assertCtx(ctx);

  if (ctx.isWorkspaceAdmin) return {};
  return {
    OR: [
      { assignedToUserId: ctx.userId },
      { AND: [{ assignedToUserId: null }, { createdByUserId: ctx.userId }] },
    ],
  };
}

/* -------------------------------------------------------
 * Readable where builders (CANONICAL)
 * ----------------------------------------------------- */

/** 1) Contact (special: visibility gate + workspace) */
export function whereReadableContact(ctx: VisibilityCtx): Prisma.ContactWhereInput {
  assertCtx(ctx);
  return {
    ...wsWhere(ctx),
    ...(gateVisibility({ ctx }) as unknown as Prisma.ContactWhereInput),
  };
}

/** 2) Listing */
export function whereReadableListing(ctx: VisibilityCtx): Prisma.ListingWhereInput {
  assertCtx(ctx);
  return {
    ...wsWhere(ctx),
    ...(gateVisibility({ ctx }) as unknown as Prisma.ListingWhereInput),
  };
}

/** 3) Automation (PRIVATE by createdByUserId) */
export function whereReadableAutomation(ctx: VisibilityCtx): Prisma.AutomationWhereInput {
  assertCtx(ctx);
  return {
    ...wsWhere(ctx),
    ...(gateVisibilityByCreator({ ctx }) as unknown as Prisma.AutomationWhereInput),
  };
}

/** 4) IntelligenceOutput (PRIVATE requires ownerUserId=user) */
export function whereReadableIntelligenceOutput(
  ctx: VisibilityCtx
): Prisma.IntelligenceOutputWhereInput {
  assertCtx(ctx);
  return {
    ...wsWhere(ctx),
    ...(gateVisibility({ ctx, ownerField: "ownerUserId" }) as unknown as Prisma.IntelligenceOutputWhereInput),
  };
}

/** 5) AIArtifact (PRIVATE requires ownerUserId=user) */
export function whereReadableAIArtifact(ctx: VisibilityCtx): Prisma.AIArtifactWhereInput {
  assertCtx(ctx);
  return {
    ...wsWhere(ctx),
    ...(gateVisibility({ ctx, ownerField: "ownerUserId" }) as unknown as Prisma.AIArtifactWhereInput),
  };
}

/** 6) Conversation (assigned-only) */
export function whereReadableConversation(ctx: VisibilityCtx): Prisma.ConversationWhereInput {
  assertCtx(ctx);
  return {
    ...wsWhere(ctx),
    ...(gateAssigned({ ctx, assignedField: "assignedToUserId" }) as unknown as Prisma.ConversationWhereInput),
  };
}

/** 7) UserPhoneNumber (assigned-only) */
export function whereReadableUserPhoneNumber(
  ctx: VisibilityCtx
): Prisma.UserPhoneNumberWhereInput {
  assertCtx(ctx);
  return {
    ...wsWhere(ctx),
    ...(gateAssigned({ ctx, assignedField: "assignedToUserId" }) as unknown as Prisma.UserPhoneNumberWhereInput),
  };
}

/** 8) Call (assigned-only) */
export function whereReadableCall(ctx: VisibilityCtx): Prisma.CallWhereInput {
  assertCtx(ctx);
  return {
    ...wsWhere(ctx),
    ...(gateAssigned({ ctx, assignedField: "assignedToUserId" }) as unknown as Prisma.CallWhereInput),
  };
}

/** 9) SmsMessage (nullable assignedToUserId => null forbidden) */
export function whereReadableSmsMessage(ctx: VisibilityCtx): Prisma.SmsMessageWhereInput {
  assertCtx(ctx);
  return {
    ...wsWhere(ctx),
    ...(gateAssigned({ ctx, assignedField: "assignedToUserId" }) as unknown as Prisma.SmsMessageWhereInput),
  };
}

/** 10) CommEvent (nullable assignedToUserId => null forbidden) */
export function whereReadableCommEvent(ctx: VisibilityCtx): Prisma.CommEventWhereInput {
  assertCtx(ctx);
  return {
    ...wsWhere(ctx),
    ...(gateAssigned({ ctx, assignedField: "assignedToUserId" }) as unknown as Prisma.CommEventWhereInput),
  };
}

/** 11) Task */
export function whereReadableTask(ctx: VisibilityCtx): Prisma.TaskWhereInput {
  assertCtx(ctx);
  return {
    ...wsWhere(ctx),
    ...gateTask(ctx),
  };
}

/** 11b) Task (MY TASKS) — preserve old behavior: assigned-only */
export function whereMyTask(ctx: VisibilityCtx): Prisma.TaskWhereInput {
  assertCtx(ctx);
  return {
    ...wsWhere(ctx),
    assignedToUserId: ctx.userId,
  };
}

/** 11c) Task (MANAGE) — preserve old behavior for mutations */
export function whereManageableTask(ctx: VisibilityCtx): Prisma.TaskWhereInput {
  assertCtx(ctx);
  return {
    ...wsWhere(ctx),
    ...(ctx.isWorkspaceAdmin ? {} : { assignedToUserId: ctx.userId }),
  };
}

/**
 * 12) Activity (derived visibility)
 * - If contactId set => contact must be readable
 * - If listingId set => listing must be readable
 */
export function whereReadableActivity(ctx: VisibilityCtx): Prisma.ActivityWhereInput {
  assertCtx(ctx);

  if (ctx.isWorkspaceAdmin) return { ...wsWhere(ctx) };

  return {
    ...wsWhere(ctx),
    AND: [
      {
        OR: [{ contactId: null }, { contact: whereReadableContact(ctx) }],
      },
      {
        OR: [{ listingId: null }, { listing: whereReadableListing(ctx) }],
      },
    ],
  };
}

/**
 * 13) CRMActivity (derived visibility)
 */
export function whereReadableCRMActivity(ctx: VisibilityCtx): Prisma.CRMActivityWhereInput {
  assertCtx(ctx);

  if (ctx.isWorkspaceAdmin) return { ...wsWhere(ctx) };

  return {
    ...wsWhere(ctx),
    AND: [
      {
        OR: [{ contactId: null }, { contact: whereReadableContact(ctx) }],
      },
      {
        OR: [{ listingId: null }, { listing: whereReadableListing(ctx) }],
      },
    ],
  };
}

/**
 * 14) Pin (workspace-wide bank; tenant-scoped only)
 */
export function whereReadablePin(ctx: VisibilityCtx): Prisma.PinWhereInput {
  assertCtx(ctx);
  return { ...wsWhere(ctx) };
}

/**
 * 15) ContactPin / ListingPin (MUST be parent-gated)
 */
export function whereReadableContactPin(ctx: VisibilityCtx): Prisma.ContactPinWhereInput {
  assertCtx(ctx);
  return {
    workspaceId: ctx.workspaceId,
    contact: whereReadableContact(ctx),
  };
}

export function whereReadableListingPin(ctx: VisibilityCtx): Prisma.ListingPinWhereInput {
  assertCtx(ctx);
  return {
    workspaceId: ctx.workspaceId,
    listing: whereReadableListing(ctx),
  };
}

/**
 * 16) ListingBuyerLink (no workspaceId)
 * Parent-gated both ways to prevent leaks.
 */
export function whereReadableListingBuyerLink(
  ctx: VisibilityCtx
): Prisma.ListingBuyerLinkWhereInput {
  assertCtx(ctx);
  return {
    listing: whereReadableListing(ctx),
    contact: whereReadableContact(ctx),
  };
}

/**
 * 17) ContactNote / ListingNote (no workspaceId)
 * Parent-gated to avoid leaks.
 */
export function whereReadableContactNote(ctx: VisibilityCtx): Prisma.ContactNoteWhereInput {
  assertCtx(ctx);
  return { contact: whereReadableContact(ctx) };
}

export function whereReadableListingNote(ctx: VisibilityCtx): Prisma.ListingNoteWhereInput {
  assertCtx(ctx);
  return { listing: whereReadableListing(ctx) };
}

/**
 * 18) CRMRecord (workspace-scoped but no explicit visibility)
 * Conservative: private-by-creator unless admin.
 */
export function whereReadableCRMRecord(ctx: VisibilityCtx): Prisma.CRMRecordWhereInput {
  assertCtx(ctx);
  if (ctx.isWorkspaceAdmin) return { ...wsWhere(ctx) };
  return { ...wsWhere(ctx), createdByUserId: ctx.userId };
}

/**
 * 19) AIContextSnapshot (workspace scoped; conservative private-by-creator unless admin)
 */
export function whereReadableAIContextSnapshot(
  ctx: VisibilityCtx
): Prisma.AIContextSnapshotWhereInput {
  assertCtx(ctx);
  if (ctx.isWorkspaceAdmin) return { ...wsWhere(ctx) };
  return { ...wsWhere(ctx), createdByUserId: ctx.userId };
}

/**
 * 20) AIJob (workspace scoped; readable workspace-wide)
 */
export function whereReadableAIJob(ctx: VisibilityCtx): Prisma.AIJobWhereInput {
  assertCtx(ctx);
  return { ...wsWhere(ctx) };
}

/* -------------------------------------------------------
 * Require-readable helpers (use before writes/joins)
 * - Always use findFirst + whereReadableX (never findUnique by id alone)
 * ----------------------------------------------------- */

type Tx = Prisma.TransactionClient;

async function requireOr404<T>(row: T | null, msg: string): Promise<T> {
  if (!row) throw new VisibilityError(msg, { status: 404, code: "NOT_FOUND" });
  return row;
}

export async function requireReadableContact(
  prisma: Tx,
  ctx: VisibilityCtx,
  id: string,
  select: Prisma.ContactSelect = { id: true }
) {
  const row = await prisma.contact.findFirst({
    where: { id, ...whereReadableContact(ctx) },
    select,
  });
  return requireOr404(row, "Contact not found");
}

export async function requireReadableListing(
  prisma: Tx,
  ctx: VisibilityCtx,
  id: string,
  select: Prisma.ListingSelect = { id: true }
) {
  const row = await prisma.listing.findFirst({
    where: { id, ...whereReadableListing(ctx) },
    select,
  });
  return requireOr404(row, "Listing not found");
}

export async function requireReadableAutomation(
  prisma: Tx,
  ctx: VisibilityCtx,
  id: string,
  select: Prisma.AutomationSelect = { id: true }
) {
  const row = await prisma.automation.findFirst({
    where: { id, ...whereReadableAutomation(ctx) },
    select,
  });
  return requireOr404(row, "Automation not found");
}

export async function requireReadableConversation(
  prisma: Tx,
  ctx: VisibilityCtx,
  id: string,
  select: Prisma.ConversationSelect = { id: true }
) {
  const row = await prisma.conversation.findFirst({
    where: { id, ...whereReadableConversation(ctx) },
    select,
  });
  return requireOr404(row, "Conversation not found");
}

export async function requireReadableSmsMessage(
  prisma: Tx,
  ctx: VisibilityCtx,
  id: string,
  select: Prisma.SmsMessageSelect = { id: true }
) {
  const row = await prisma.smsMessage.findFirst({
    where: { id, ...whereReadableSmsMessage(ctx) },
    select,
  });
  return requireOr404(row, "SmsMessage not found");
}

export async function requireReadableTask(
  prisma: Tx,
  ctx: VisibilityCtx,
  id: string,
  select: Prisma.TaskSelect = { id: true }
) {
  const row = await prisma.task.findFirst({
    where: { id, ...whereReadableTask(ctx) },
    select,
  });
  return requireOr404(row, "Task not found");
}

/**
 * Join-table write guards (prevents leakage)
 */
export async function requireReadableForContactPinWrite(
  prisma: Tx,
  ctx: VisibilityCtx,
  contactId: string
) {
  await requireReadableContact(prisma, ctx, contactId, { id: true });
}

export async function requireReadableForListingPinWrite(
  prisma: Tx,
  ctx: VisibilityCtx,
  listingId: string
) {
  await requireReadableListing(prisma, ctx, listingId, { id: true });
}

export async function requireReadableForListingBuyerLinkWrite(
  prisma: Tx,
  ctx: VisibilityCtx,
  listingId: string,
  contactId: string
) {
  await requireReadableListing(prisma, ctx, listingId, { id: true });
  await requireReadableContact(prisma, ctx, contactId, { id: true });
}

/* -------------------------------------------------------
 * Write normalization (bullet-proof, type-safe)
 * - NO `as const` (avoids literal-type inference issues)
 * - Explicit return types (Prisma-friendly)
 * ----------------------------------------------------- */

export type NormalizedContactWrite = {
  relationshipType: RelationshipType;
  visibility: RecordVisibility;
  ownerUserId: string | null;
};

export function normalizeContactWrite(input: {
  relationshipType?: RelationshipType | null;
  visibility?: RecordVisibility | null; // ignored; enforced
  ownerUserId?: string | null;
  currentUserId: string;
}): NormalizedContactWrite {
  const rel = input.relationshipType ?? RelationshipType.CLIENT;

  if (rel === RelationshipType.PARTNER) {
    return {
      relationshipType: RelationshipType.PARTNER,
      visibility: RecordVisibility.WORKSPACE,
      ownerUserId: input.ownerUserId ?? null,
    };
  }

  return {
    relationshipType: RelationshipType.CLIENT,
    visibility: RecordVisibility.PRIVATE,
    ownerUserId: input.ownerUserId ?? input.currentUserId,
  };
}

export type NormalizedListingWrite = {
  visibility: RecordVisibility;
  ownerUserId: string | null;
};

export function normalizeListingWrite(input: {
  visibility?: RecordVisibility | null;
  ownerUserId?: string | null;
  currentUserId: string;
}): NormalizedListingWrite {
  const visibility = input.visibility ?? RecordVisibility.PRIVATE;

  if (visibility === RecordVisibility.WORKSPACE) {
    return {
      visibility: RecordVisibility.WORKSPACE,
      ownerUserId: input.ownerUserId ?? null,
    };
  }

  return {
    visibility: RecordVisibility.PRIVATE,
    ownerUserId: input.ownerUserId ?? input.currentUserId,
  };
}

export type NormalizedAutomationWrite = {
  visibility: RecordVisibility;
  createdByUserId: string;
};

export function normalizeAutomationWrite(input: {
  visibility?: RecordVisibility | null;
  createdByUserId?: string | null;
  currentUserId: string;
}): NormalizedAutomationWrite {
  return {
    visibility: input.visibility ?? RecordVisibility.PRIVATE,
    createdByUserId: input.createdByUserId ?? input.currentUserId,
  };
}

export type NormalizedIntelligenceOutputWrite = {
  visibility: RecordVisibility;
  createdByUserId: string;
  ownerUserId: string | null;
};

export function normalizeIntelligenceOutputWrite(input: {
  visibility?: RecordVisibility | null;
  ownerUserId?: string | null;
  createdByUserId?: string | null;
  currentUserId: string;
}): NormalizedIntelligenceOutputWrite {
  const visibility = input.visibility ?? RecordVisibility.PRIVATE;

  return {
    visibility,
    createdByUserId: input.createdByUserId ?? input.currentUserId,
    ownerUserId:
      visibility === RecordVisibility.PRIVATE
        ? input.ownerUserId ?? input.currentUserId
        : input.ownerUserId ?? null,
  };
}

export type NormalizedAIArtifactWrite = {
  visibility: RecordVisibility;
  createdByUserId: string;
  ownerUserId: string | null;
};

export function normalizeAIArtifactWrite(input: {
  visibility?: RecordVisibility | null;
  ownerUserId?: string | null;
  createdByUserId?: string | null;
  currentUserId: string;
}): NormalizedAIArtifactWrite {
  const visibility = input.visibility ?? RecordVisibility.PRIVATE;

  return {
    visibility,
    createdByUserId: input.createdByUserId ?? input.currentUserId,
    ownerUserId:
      visibility === RecordVisibility.PRIVATE
        ? input.ownerUserId ?? input.currentUserId
        : input.ownerUserId ?? null,
  };
}

export type NormalizedTaskWrite = {
  assignedToUserId: string;
  createdByUserId: string;
};

export function normalizeTaskWrite(input: {
  assignedToUserId?: string | null;
  createdByUserId?: string | null;
  currentUserId: string;
}): NormalizedTaskWrite {
  return {
    assignedToUserId: input.assignedToUserId ?? input.currentUserId,
    createdByUserId: input.createdByUserId ?? input.currentUserId,
  };
}

/**
 * Comms write invariant: never allow null assignment unless you explicitly allow it.
 */
export function assertAssignedOrThrow(params: {
  label: "SmsMessage" | "CommEvent";
  assignedToUserId?: string | null;
}) {
  if (!params.assignedToUserId) {
    throw new VisibilityError(`${params.label} missing assignedToUserId`, {
      status: 400,
      code: "BAD_REQUEST",
    });
  }
}

/**
 * Safety guard: never allow PRIVATE visibility without ownerUserId
 * Use where PRIVATE must be owned.
 */
export function assertPrivateHasOwner(params: {
  label: "Contact" | "Listing" | "IntelligenceOutput" | "AIArtifact";
  visibility?: RecordVisibility | null;
  ownerUserId?: string | null;
}) {
  const v = params.visibility ?? RecordVisibility.PRIVATE;
  if (v === RecordVisibility.PRIVATE && !params.ownerUserId) {
    throw new VisibilityError(`${params.label} PRIVATE requires ownerUserId`, {
      status: 400,
      code: "BAD_REQUEST",
    });
  }
}

/* -------------------------------------------------------
 * Practical helper: discourage findUnique leakage
 * ----------------------------------------------------- */

export const README_NO_FIND_UNIQUE =
  "Do not use findUnique({ where: { id } }) on private models. Always use findFirst + whereReadableX(ctx).";