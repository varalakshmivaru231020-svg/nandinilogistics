-- CreateEnum
CREATE TYPE "WhatsappTemplateStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED');

-- CreateEnum
CREATE TYPE "WhatsappMessageStatus" AS ENUM ('QUEUED', 'SCHEDULED', 'SENT', 'FAILED', 'SKIPPED');

-- CreateTable
CREATE TABLE "whatsapp_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL DEFAULT 'en',
    "category" TEXT NOT NULL DEFAULT 'UTILITY',
    "bodyText" TEXT,
    "variables" JSONB NOT NULL DEFAULT '[]',
    "buttonVariables" JSONB NOT NULL DEFAULT '[]',
    "status" "WhatsappTemplateStatus" NOT NULL DEFAULT 'PENDING',
    "metaTemplateId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

CONSTRAINT "whatsapp_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_triggers" (
    "id" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "templateId" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "delayMinutes" INTEGER,
    "fallbackPhone" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

CONSTRAINT "whatsapp_triggers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_messages" (
    "id" TEXT NOT NULL,
    "toPhone" TEXT NOT NULL,
    "templateName" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL,
    "templateId" TEXT,
    "variables" JSONB NOT NULL DEFAULT '[]',
    "buttonVariables" JSONB NOT NULL DEFAULT '[]',
    "event" TEXT NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "userId" TEXT,
    "status" "WhatsappMessageStatus" NOT NULL DEFAULT 'QUEUED',
    "sendAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMP(3),
    "metaMessageId" TEXT,
    "error" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_templates_name_languageCode_key" ON "whatsapp_templates"("name", "languageCode");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_triggers_event_key" ON "whatsapp_triggers"("event");

-- CreateIndex
CREATE INDEX "whatsapp_messages_status_sendAfter_idx" ON "whatsapp_messages"("status", "sendAfter");

-- CreateIndex
CREATE INDEX "whatsapp_messages_entity_entityId_idx" ON "whatsapp_messages"("entity", "entityId");

-- CreateIndex
CREATE INDEX "whatsapp_messages_event_createdAt_idx" ON "whatsapp_messages"("event", "createdAt");

-- RenameForeignKey
ALTER TABLE IF EXISTS "schedule_extensions" RENAME CONSTRAINT "schedule_extensions_decidedById_fkey" TO "schedule_extensions_pmDecidedById_fkey";

-- AddForeignKey
ALTER TABLE "whatsapp_triggers" ADD CONSTRAINT "whatsapp_triggers_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "whatsapp_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_triggers" ADD CONSTRAINT "whatsapp_triggers_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "whatsapp_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
