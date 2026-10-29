-- CreateTable
CREATE TABLE "IntegrationConfig" (
    "key" TEXT NOT NULL,
    "valueEnc" TEXT NOT NULL,
    "updatedBy" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationConfig_pkey" PRIMARY KEY ("key")
);
