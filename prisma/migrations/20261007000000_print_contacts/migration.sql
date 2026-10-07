-- Contact lines printed at the foot of a purchase order, kept as master data so
-- a number can be corrected once rather than in a template.
CREATE TABLE "m_print_contacts" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "m_print_contacts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "m_print_contacts_code_key" ON "m_print_contacts"("code");
