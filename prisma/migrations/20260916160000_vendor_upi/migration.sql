-- The vendor record carries a UPI ID beside its bank details.
ALTER TABLE "m_vendors" ADD COLUMN "upiId" TEXT;
