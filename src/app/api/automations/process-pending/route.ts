// src/app/api/automations/process-pending/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runAutomation } from "@/lib/automations/runAutomation";
import { requireEntitlement } from "@/lib/entitlements";

const BATCH_LIMIT = 25;

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

function getExpectedSecret() {
  return process.env.AUTOMATIONS_CRON_SECRET?.trim() || "";
}

function getProvidedSecret(req: NextRequest) {
  return (
    req.headers.get("x-automations-cron-secret")?.trim() ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim() ||
    ""
  );
}

function isAuthorized(req: NextRequest) {
  const expected = getExpectedSecret();
  const provided = getProvidedSecret(req);

  const userAgent = req.headers.get("user-agent") || "";
  const isVercelCron = userAgent.toLowerCase().includes("vercel-cron");

  if (isVercelCron) return true;
  return Boolean(expected) && Boolean(provided) && expected === provided;
}

async function handleProcessPending(req: NextRequest) {
  if (!isAuthorized(req)) return unauthorized();

  const now = new Date();

  const dueItems = await prisma.automationPendingExecution.findMany({
    where: {
      status: "PENDING",
      resumeAt: { lte: now },
    },
    orderBy: { resumeAt: "asc" },
    take: BATCH_LIMIT,
  });

  const results: Array<Record<string, any>> = [];

  for (const item of dueItems) {
    const lockId = crypto.randomUUID();

    const claim = await prisma.automationPendingExecution.updateMany({
      where: {
        id: item.id,
        status: "PENDING",
      },
      data: {
        status: "PROCESSING",
        lockId,
        attempts: { increment: 1 },
        statusMessage: "Claimed for processing.",
      },
    });

    if (claim.count !== 1) {
      results.push({
        id: item.id,
        ok: false,
        skipped: true,
        reason: "claim_failed",
      });
      continue;
    }

    try {
      const automation = await prisma.automation.findFirst({
        where: {
          id: item.automationId,
          workspaceId: item.workspaceId,
        },
        select: {
          id: true,
          active: true,
        },
      });

      if (!automation) {
        await prisma.automationPendingExecution.update({
          where: { id: item.id },
          data: {
            status: "FAILED",
            statusMessage: "Automation no longer exists.",
            failedAt: new Date(),
          },
        });

        results.push({ id: item.id, ok: false, reason: "automation_missing" });
        continue;
      }

      if (!automation.active) {
        await prisma.automationPendingExecution.update({
          where: { id: item.id },
          data: {
            status: "SKIPPED",
            statusMessage: "Automation inactive at resume time.",
            processedAt: new Date(),
          },
        });

        results.push({ id: item.id, ok: false, reason: "automation_inactive" });
        continue;
      }

      const gate = await requireEntitlement(item.workspaceId, "AUTOMATIONS_RUN");
      if (!gate.ok) {
        await prisma.automationPendingExecution.update({
          where: { id: item.id },
          data: {
            status: "SKIPPED",
            statusMessage: "Workspace no longer entitled to run automations.",
            processedAt: new Date(),
          },
        });

        results.push({ id: item.id, ok: false, reason: "entitlement_blocked" });
        continue;
      }

      if (!Array.isArray(item.remainingSteps)) {
        throw new Error("Pending execution has invalid remainingSteps payload.");
      }

      const remainingSteps = item.remainingSteps as any[];

      await runAutomation(item.automationId, remainingSteps, {
        userId: item.userId,
        workspaceId: item.workspaceId,
        contactId: item.contactId ?? null,
        listingId: item.listingId ?? null,
        trigger: item.trigger,
        payload: item.triggerPayload ?? {},
        idempotencyKey: `resume:${item.id}:${item.runId}`,
        existingRunId: item.runId,
        resumeOfPendingExecutionId: item.id,
        cursorTime: item.resumeAt,
      });

      await prisma.automationPendingExecution.update({
        where: { id: item.id },
        data: {
          status: "DONE",
          statusMessage: "Pending execution processed successfully.",
          processedAt: new Date(),
        },
      });

      results.push({ id: item.id, ok: true });
    } catch (err: any) {
      await prisma.automationPendingExecution.update({
        where: { id: item.id },
        data: {
          status: "FAILED",
          statusMessage: err?.message ?? "Pending execution failed.",
          failedAt: new Date(),
        },
      });

      results.push({
        id: item.id,
        ok: false,
        reason: err?.message ?? "pending_execution_failed",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    processed: results.length,
    results,
  });
}

export async function GET(req: NextRequest) {
  return handleProcessPending(req);
}

export async function POST(req: NextRequest) {
  return handleProcessPending(req);
}