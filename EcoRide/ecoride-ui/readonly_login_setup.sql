-- =====================================================================
-- Read-only login for the AI assistant's free-form SQL fallback.
-- Run this ONCE in SSMS, connected as an admin (e.g. sa).
--
-- This login can only ever SELECT from ECORIDE_DW. It has no permission
-- to INSERT, UPDATE, DELETE, or change schema -- even if the AI ever
-- generated a bad or malicious query, this login could not act on it.
-- =====================================================================

USE master;
GO

-- Change this password to your own strong password, then use the SAME
-- value in your .env file as DW_READONLY_PASSWORD.
CREATE LOGIN ecoride_readonly WITH PASSWORD = 'SABYONI2026!';
GO

USE ECORIDE_DW;
GO
CREATE USER ecoride_readonly FOR LOGIN ecoride_readonly;
GO
ALTER ROLE db_datareader ADD MEMBER ecoride_readonly;
GO

-- Confirm it worked: this should show ecoride_readonly with SELECT-only access.
SELECT dp.name AS UserName, r.name AS RoleName
FROM sys.database_role_members drm
JOIN sys.database_principals dp ON drm.member_principal_id = dp.principal_id
JOIN sys.database_principals r  ON drm.role_principal_id   = r.principal_id
WHERE dp.name = 'ecoride_readonly';
