// prisma.config.ts
import { defineConfig } from "prisma/config";
import * as dotenv from "dotenv";

// Load .env from the project root
dotenv.config({ path: ".env" });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  engine: "classic",
  datasource: {
    // Use process.env now that dotenv has loaded .env
    url: process.env.DATABASE_URL!,
  },
});