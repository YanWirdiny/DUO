-- CreateTable
CREATE TABLE "LateLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetDate" TIMESTAMP(3) NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LateLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LateLog_userId_weekStart_idx" ON "LateLog"("userId", "weekStart");

-- CreateIndex
CREATE UNIQUE INDEX "LateLog_userId_targetDate_key" ON "LateLog"("userId", "targetDate");

-- AddForeignKey
ALTER TABLE "LateLog" ADD CONSTRAINT "LateLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
