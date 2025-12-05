// src/lib/automations/runAutomation.ts

import { prisma } from "@/lib/prisma";
import type { AutomationStep, AutomationContext } from "./types";

export async function runAutomationStep(
  automationId: string,
  step: AutomationStep,
  context: AutomationContext
) {
  const { userId, contactId } = context;

  switch (step.type) {
    case "SEND_SMS": {
      console.log("📱 Sending SMS:", step.message);
      // integrate Twilio / MessageBird later
      break;
    }

    case "SEND_EMAIL": {
      console.log("📧 Sending email:", step.subject);
      // integrate SendGrid / Resend later
      break;
    }

    case "UPDATE_CONTACT_STAGE": {
      if (!contactId) break;

      await prisma.contact.update({
        where: { id: contactId },
        data: { stage: step.stage },
      });

      await prisma.cRMActivity.create({
        data: {
          userId,
          contactId,
          type: "stage_change",
          summary: `Automation changed stage → ${step.stage}`,
          data: {},
        },
      });

      break;
    }

    case "CREATE_CRM_NOTE": {
      if (!contactId) break;

      await prisma.contactNote.create({
        data: {
          contactId,
          text: step.text,
        },
      });

      await prisma.cRMActivity.create({
        data: {
          userId,
          contactId,
          type: "note",
          summary: `Automation note created`,
          data: {},
        },
      });

      break;
    }

    case "DELAY": {
      console.log("⏳ Delay:", step.milliseconds);
      await new Promise((resolve) => setTimeout(resolve, step.milliseconds));
      break;
    }

    case "WAIT_FOR_STAGE": {
      if (!contactId) break;
      let satisfied = false;

      while (!satisfied) {
        const c = await prisma.contact.findUnique({
          where: { id: contactId },
        });

        if (c?.stage === step.stage) {
          satisfied = true;
        } else {
          await new Promise((r) => setTimeout(r, 3000)); // poll
        }
      }

      break;
    }

    default:
      console.warn("Unknown automation step:", step);
  }
}

export async function runAutomation(
  automationId: string,
  steps: AutomationStep[],
  context: AutomationContext
) {
  try {
    for (const step of steps) {
      await runAutomationStep(automationId, step, context);
    }

    await prisma.automationRun.create({
      data: {
        automationId,
        contactId: context.contactId,
        listingId: context.listingId,
        status: "SUCCESS",
      },
    });
  } catch (err: any) {
    console.error("Automation failed:", err);

    await prisma.automationRun.create({
      data: {
        automationId,
        contactId: context.contactId,
        listingId: context.listingId,
        status: "FAILED",
        message: err.message ?? "Unknown error",
      },
    });
  }
}