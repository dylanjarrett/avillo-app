// app/api/crm/contacts/import/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  ClientRole,
  ContactStage,
  RelationshipType,
  type Prisma,
} from "@prisma/client";
import { requireWorkspace } from "@/lib/workspace";
import { normalizeContactWrite } from "@/lib/visibility";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_IMPORT_ROWS = 1000;

type ImportMappings = {
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;

  // One or many CSV columns that should be joined and stored in Contact.areas
  areas?: string[] | null;
};

type ImportBody = {
  mappings?: ImportMappings | null;
  relationshipType?: "CLIENT" | "PARTNER" | string | null;
  clientRole?: "BUYER" | "SELLER" | "BOTH" | string | null;
  rows?: Record<string, string>[];
};

type ImportSummary = {
  totalRows: number;
  imported: number;
  skippedDuplicates: number;
  failed: number;
};

function cleanString(value: unknown): string | null {
  const str = String(value ?? "").trim();
  return str.length ? str : null;
}

function normalizeEmail(value: unknown): string | null {
  const cleaned = cleanString(value);
  return cleaned ? cleaned.toLowerCase() : null;
}

function normalizePhone(value: unknown): string | null {
  const cleaned = cleanString(value);
  if (!cleaned) return null;

  const normalized = cleaned.replace(/[\s\-().]/g, "");
  return normalized.length ? normalized : null;
}

function splitFullName(value: unknown): {
  firstName: string | null;
  lastName: string | null;
} {
  const cleaned = cleanString(value);
  if (!cleaned) return { firstName: null, lastName: null };

  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return { firstName: parts[0] ?? null, lastName: null };
  }

  return {
    firstName: parts[0] ?? null,
    lastName: parts.slice(1).join(" ") || null,
  };
}

function normalizeRelationshipType(raw?: string | null): RelationshipType {
  const value = String(raw ?? "").trim().toUpperCase();
  return value === "PARTNER"
    ? RelationshipType.PARTNER
    : RelationshipType.CLIENT;
}

function normalizeClientRole(raw?: string | null): ClientRole | null {
  const value = String(raw ?? "").trim().toUpperCase();

  if (value === "BUYER") return ClientRole.BUYER;
  if (value === "SELLER") return ClientRole.SELLER;
  if (value === "BOTH") return ClientRole.BOTH;
  return null;
}

function getColumnValue(
  row: Record<string, string>,
  column?: string | null
): string | null {
  if (!column) return null;
  if (!(column in row)) return null;
  return cleanString(row[column]);
}

function normalizeSelectedColumns(columns?: string[] | null): string[] {
  if (!Array.isArray(columns)) return [];

  return columns
    .map((value) => cleanString(value))
    .filter((value): value is string => !!value);
}

function getRowHeaders(rows: Record<string, string>[]): Set<string> {
  const headers = new Set<string>();

  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;

    for (const key of Object.keys(row)) {
      const cleaned = cleanString(key);
      if (cleaned) headers.add(cleaned);
    }
  }

  return headers;
}

function hasMappedColumn(
  availableHeaders: Set<string>,
  column?: string | null
): boolean {
  const cleaned = cleanString(column);
  if (!cleaned) return false;
  return availableHeaders.has(cleaned);
}

function getJoinedColumnValues(
  row: Record<string, string>,
  columns?: string[] | null
): string | null {
  if (!Array.isArray(columns) || columns.length === 0) return null;

  const values = columns
    .map((column) => getColumnValue(row, column))
    .filter((value): value is string => !!value);

  if (!values.length) return null;

  return values.join(", ");
}

function isLikelyValidEmail(email: string | null): boolean {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireWorkspace();
    if (!ctx.ok) return NextResponse.json(ctx.error, { status: ctx.status });

    const body = (await req.json().catch(() => null)) as ImportBody | null;
    if (!body) {
      return NextResponse.json(
        { error: "Missing import payload." },
        { status: 400 }
      );
    }

    const {
      mappings,
      relationshipType: rawRelationshipType,
      clientRole: rawClientRole,
      rows,
    } = body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        { error: "No rows provided for import." },
        { status: 400 }
      );
    }

    if (rows.length > MAX_IMPORT_ROWS) {
      return NextResponse.json(
        {
          error: `This file is too large. Please limit imports to ${MAX_IMPORT_ROWS} contacts. For larger uploads, contact support@avillo.io.`,
        },
        { status: 400 }
      );
    }

    if (!mappings || typeof mappings !== "object") {
      return NextResponse.json(
        { error: "Missing field mappings." },
        { status: 400 }
      );
    }

    const hasNameMapping =
      !!cleanString(mappings.fullName) ||
      !!cleanString(mappings.firstName) ||
      !!cleanString(mappings.lastName);

    if (!hasNameMapping) {
      return NextResponse.json(
        {
          error:
            "Select a full name column or at least a first/last name column.",
        },
        { status: 400 }
      );
    }

    if (!cleanString(mappings.email) && !cleanString(mappings.phone)) {
      return NextResponse.json(
        {
          error:
            "At least one contact method column is required: email or phone.",
        },
        { status: 400 }
      );
    }

    if (mappings.areas && !Array.isArray(mappings.areas)) {
      return NextResponse.json(
        { error: "Address mapping must be an array of selected columns." },
        { status: 400 }
      );
    }

    const relationshipType = normalizeRelationshipType(rawRelationshipType);
    const clientRole =
      relationshipType === RelationshipType.PARTNER
        ? null
        : normalizeClientRole(rawClientRole) ?? ClientRole.BUYER;

    const areaColumns = normalizeSelectedColumns(mappings.areas);
    const availableHeaders = getRowHeaders(rows);

    const requiresAddress =
      relationshipType === RelationshipType.CLIENT &&
      (clientRole === ClientRole.SELLER || clientRole === ClientRole.BOTH);

    if (
      cleanString(mappings.fullName) &&
      !hasMappedColumn(availableHeaders, mappings.fullName)
    ) {
      return NextResponse.json(
        { error: "Selected full name column was not found in the uploaded file." },
        { status: 400 }
      );
    }

    if (
      cleanString(mappings.firstName) &&
      !hasMappedColumn(availableHeaders, mappings.firstName)
    ) {
      return NextResponse.json(
        { error: "Selected first name column was not found in the uploaded file." },
        { status: 400 }
      );
    }

    if (
      cleanString(mappings.lastName) &&
      !hasMappedColumn(availableHeaders, mappings.lastName)
    ) {
      return NextResponse.json(
        { error: "Selected last name column was not found in the uploaded file." },
        { status: 400 }
      );
    }

    if (
      cleanString(mappings.email) &&
      !hasMappedColumn(availableHeaders, mappings.email)
    ) {
      return NextResponse.json(
        { error: "Selected email column was not found in the uploaded file." },
        { status: 400 }
      );
    }

    if (
      cleanString(mappings.phone) &&
      !hasMappedColumn(availableHeaders, mappings.phone)
    ) {
      return NextResponse.json(
        { error: "Selected phone column was not found in the uploaded file." },
        { status: 400 }
      );
    }

    for (const column of areaColumns) {
      if (!hasMappedColumn(availableHeaders, column)) {
        return NextResponse.json(
          {
            error:
              "One or more selected address columns were not found in the uploaded file.",
          },
          { status: 400 }
        );
      }
    }

    if (requiresAddress && areaColumns.length === 0) {
      return NextResponse.json(
        { error: "Address mapping is required for seller contacts." },
        { status: 400 }
      );
    }

    // IMPORTANT:
    // Imports are intentionally data-only operations.
    // Do NOT trigger automations from this route.
    //
    // Visibility/ownership rules must match /api/crm/contacts:
    // - CLIENT => PRIVATE + ownerUserId = current user
    // - PARTNER => WORKSPACE + owner behavior per helper
    const normalizedWrite = normalizeContactWrite({
      relationshipType,
      currentUserId: ctx.userId,
    });

    const summary: ImportSummary = {
      totalRows: rows.length,
      imported: 0,
      skippedDuplicates: 0,
      failed: 0,
    };

    const seenEmails = new Set<string>();
    const seenPhones = new Set<string>();

    for (const rawRow of rows) {
      try {
        if (!rawRow || typeof rawRow !== "object" || Array.isArray(rawRow)) {
          summary.failed += 1;
          continue;
        }

        const row: Record<string, string> = Object.fromEntries(
          Object.entries(rawRow).map(([key, value]) => [key, String(value ?? "")])
        );

        let firstName: string | null = null;
        let lastName: string | null = null;

        if (cleanString(mappings.fullName)) {
          const fullName = getColumnValue(row, mappings.fullName);
          const split = splitFullName(fullName);
          firstName = split.firstName;
          lastName = split.lastName;
        } else {
          firstName = getColumnValue(row, mappings.firstName);
          lastName = getColumnValue(row, mappings.lastName);
        }

        const hasRowName = !!cleanString(
          [firstName, lastName].filter(Boolean).join(" ")
        );

        if (!hasRowName) {
          summary.failed += 1;
          continue;
        }

        const rawEmail = getColumnValue(row, mappings.email);
        const rawPhone = getColumnValue(row, mappings.phone);

        const normalizedEmail = normalizeEmail(rawEmail);
        const normalizedPhone = normalizePhone(rawPhone);
        const normalizedAreas = getJoinedColumnValues(row, areaColumns);

        if (requiresAddress && !normalizedAreas) {
          summary.failed += 1;
          continue;
        }

        // Each row must have at least one of email or phone
        if (!normalizedEmail && !normalizedPhone) {
          summary.failed += 1;
          continue;
        }

        // Invalid email is allowed only if phone exists
        const validEmail =
          normalizedEmail && isLikelyValidEmail(normalizedEmail)
            ? normalizedEmail
            : null;

        if (normalizedEmail && !validEmail && !normalizedPhone) {
          summary.failed += 1;
          continue;
        }

        // Duplicate check within this import batch first
        const duplicateInBatch =
          (validEmail && seenEmails.has(validEmail)) ||
          (normalizedPhone && seenPhones.has(normalizedPhone));

        if (duplicateInBatch) {
          summary.skippedDuplicates += 1;
          continue;
        }

        const duplicateOr: Prisma.ContactWhereInput[] = [
          ...(validEmail ? [{ email: validEmail }] : []),
          ...(normalizedPhone ? [{ phone: normalizedPhone }] : []),
        ];

        if (duplicateOr.length === 0) {
          summary.failed += 1;
          continue;
        }

        // Duplicate check:
        // - PARTNER => workspace-wide
        // - CLIENT => only against this user's private clients
        const duplicateWhere: Prisma.ContactWhereInput =
          relationshipType === RelationshipType.PARTNER
            ? {
                workspaceId: ctx.workspaceId,
                relationshipType: RelationshipType.PARTNER,
                OR: duplicateOr,
              }
            : {
                workspaceId: ctx.workspaceId,
                relationshipType: RelationshipType.CLIENT,
                ownerUserId: ctx.userId,
                OR: duplicateOr,
              };

        const duplicate = await prisma.contact.findFirst({
          where: duplicateWhere,
          select: { id: true },
        });

        if (duplicate) {
          summary.skippedDuplicates += 1;
          continue;
        }

        const data: Prisma.ContactCreateInput = {
          workspace: { connect: { id: ctx.workspaceId } },
          createdByUser: { connect: { id: ctx.userId } },

          relationshipType: normalizedWrite.relationshipType,
          visibility: normalizedWrite.visibility,

          ...(normalizedWrite.ownerUserId
            ? { ownerUser: { connect: { id: normalizedWrite.ownerUserId } } }
            : {}),

          firstName: firstName ?? "",
          lastName: lastName ?? "",
          email: validEmail ?? "",
          phone: normalizedPhone ?? "",

          stage:
            relationshipType === RelationshipType.PARTNER
              ? null
              : ContactStage.NEW,
          clientRole,

          label: "",
          priceRange: "",
          areas: normalizedAreas ?? "",
          timeline: "",
          source: "",
        };

        await prisma.contact.create({ data });

        if (validEmail) seenEmails.add(validEmail);
        if (normalizedPhone) seenPhones.add(normalizedPhone);

        summary.imported += 1;
      } catch (error) {
        console.error("crm/contacts/import row error:", error);
        summary.failed += 1;
      }
    }

    return NextResponse.json(summary);
  } catch (err) {
    console.error("crm/contacts/import POST error:", err);
    return NextResponse.json(
      {
        error:
          "We couldn’t import these contacts. Try again, or email support@avillo.io if it continues.",
      },
      { status: 500 }
    );
  }
}