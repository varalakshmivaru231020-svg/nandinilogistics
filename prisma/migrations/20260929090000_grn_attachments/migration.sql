-- Challans, weighbridge slips and photos of a delivery, kept against the GRN.
-- The paperwork rarely arrives all at once, so these are added when the GRN is
-- made and afterwards.
CREATE TABLE "grn_attachments" (
    "id" TEXT NOT NULL,
    "grnId" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL DEFAULT 0,
    "mimeType" TEXT,
    "label" TEXT,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grn_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "grn_attachments_grnId_idx" ON "grn_attachments"("grnId");

ALTER TABLE "grn_attachments" ADD CONSTRAINT "grn_attachments_grnId_fkey"
    FOREIGN KEY ("grnId") REFERENCES "grns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "grn_attachments" ADD CONSTRAINT "grn_attachments_uploadedById_fkey"
    FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
