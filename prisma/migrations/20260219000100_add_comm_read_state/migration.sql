-- CreateTable
CREATE TABLE "CommReadState" (
  "id" TEXT NOT NULL,
  "workspaceId" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "lastReadEventId" TEXT,
  "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "CommReadState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommReadState_conversationId_userId_key"
ON "CommReadState"("conversationId", "userId");

-- CreateIndex
CREATE INDEX "CommReadState_workspaceId_userId_idx"
ON "CommReadState"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "CommReadState_conversationId_lastReadAt_idx"
ON "CommReadState"("conversationId", "lastReadAt");

-- (Prisma typically adds an index for FK columns; include explicitly to match performance expectations)
CREATE INDEX "CommReadState_lastReadEventId_idx"
ON "CommReadState"("lastReadEventId");

-- AddForeignKey
ALTER TABLE "CommReadState"
ADD CONSTRAINT "CommReadState_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommReadState"
ADD CONSTRAINT "CommReadState_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommReadState"
ADD CONSTRAINT "CommReadState_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommReadState"
ADD CONSTRAINT "CommReadState_lastReadEventId_fkey"
FOREIGN KEY ("lastReadEventId") REFERENCES "CommEvent"("id")
ON DELETE SET NULL ON UPDATE CASCADE;