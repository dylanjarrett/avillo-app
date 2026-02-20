//lib/comms/validators.ts
import { z } from "zod";

export const MarkCommsReadSchema = z.object({
  lastReadEventId: z.string().min(1).optional().nullable(),
});