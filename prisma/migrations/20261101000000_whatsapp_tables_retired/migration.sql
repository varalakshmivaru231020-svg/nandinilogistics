-- The construction ERP line added a Meta WhatsApp console (templates,
-- triggers, outbox) on 26 Oct. The Rider CRM sends WhatsApp through the
-- SOW's BotSync integration (src/lib/whatsapp.ts) and does not model these
-- tables, so they are retired here. IF EXISTS: a database that never ran the
-- console's migration has nothing to drop.
DROP TABLE IF EXISTS "whatsapp_messages";
DROP TABLE IF EXISTS "whatsapp_triggers";
DROP TABLE IF EXISTS "whatsapp_templates";
DROP TYPE IF EXISTS "WhatsappMessageStatus";
DROP TYPE IF EXISTS "WhatsappTemplateStatus";
