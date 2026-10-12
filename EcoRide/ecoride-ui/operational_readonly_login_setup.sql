/*
  Run this script in SQL Server Management Studio as an administrator.
  Change the placeholder password below before running it.
  This creates a dedicated SELECT-only login for the chatbot in ECORIDEDB.
  It intentionally does not grant access to dbo.ACCOUNT.
*/
USE [master];
GO

IF NOT EXISTS (SELECT 1 FROM sys.sql_logins WHERE name = N'ecoride_ai_readonly')
BEGIN
    CREATE LOGIN [ecoride_ai_readonly]
    WITH PASSWORD = N'SABYONI2026!',
         CHECK_POLICY = ON,
         CHECK_EXPIRATION = OFF;
END;
GO

USE [ECORIDEDB];
GO

IF NOT EXISTS (SELECT 1 FROM sys.database_principals WHERE name = N'ecoride_ai_readonly')
BEGIN
    CREATE USER [ecoride_ai_readonly] FOR LOGIN [ecoride_ai_readonly];
END;
GO

GRANT SELECT ON OBJECT::dbo.DEPARTMENT TO [ecoride_ai_readonly];
GRANT SELECT ON OBJECT::dbo.EMPLOYEE TO [ecoride_ai_readonly];
GRANT SELECT ON OBJECT::dbo.SUBSCRIPTION_TYPE TO [ecoride_ai_readonly];
GRANT SELECT ON OBJECT::dbo.SUBSCRIPTION TO [ecoride_ai_readonly];
GRANT SELECT ON OBJECT::dbo.SUBSCRIPTION_PLAN TO [ecoride_ai_readonly];
GRANT SELECT ON OBJECT::dbo.CUSTOMER TO [ecoride_ai_readonly];
GRANT SELECT ON OBJECT::dbo.INVOICE TO [ecoride_ai_readonly];
GRANT SELECT ON OBJECT::dbo.ISSUE_TYPE TO [ecoride_ai_readonly];
GRANT SELECT ON OBJECT::dbo.SUPPORT_TICKET TO [ecoride_ai_readonly];
GRANT SELECT ON OBJECT::dbo.VEHICLE_TYPE TO [ecoride_ai_readonly];
GRANT SELECT ON OBJECT::dbo.LOCATION TO [ecoride_ai_readonly];
GRANT SELECT ON OBJECT::dbo.VEHICLE TO [ecoride_ai_readonly];
GRANT SELECT ON OBJECT::dbo.ROUTE TO [ecoride_ai_readonly];
GRANT SELECT ON OBJECT::dbo.RIDE TO [ecoride_ai_readonly];
GRANT SELECT ON OBJECT::dbo.PAYMENT_METHOD TO [ecoride_ai_readonly];
GRANT SELECT ON OBJECT::dbo.PAYMENT TO [ecoride_ai_readonly];
GRANT SELECT ON OBJECT::dbo.PROMOTION TO [ecoride_ai_readonly];
GRANT SELECT ON OBJECT::dbo.PROMOTION_LINK TO [ecoride_ai_readonly];
GRANT SELECT ON OBJECT::dbo.DISCOUNT TO [ecoride_ai_readonly];
GO

-- Prevent the chatbot login from reading sensitive columns even if a query slips through.
DENY SELECT ON OBJECT::dbo.CUSTOMER (CUSTOMERPHONE) TO [ecoride_ai_readonly];
DENY SELECT ON OBJECT::dbo.CUSTOMER (CUSTOMEREMAIL) TO [ecoride_ai_readonly];
DENY SELECT ON OBJECT::dbo.EMPLOYEE (EMAIL) TO [ecoride_ai_readonly];
DENY SELECT ON OBJECT::dbo.PAYMENT_METHOD (ACCOUNTNUMBER) TO [ecoride_ai_readonly];
DENY SELECT ON OBJECT::dbo.PAYMENT_METHOD (EXPIRYDATE) TO [ecoride_ai_readonly];
GO

-- Verification: this should show the new database user and its grants.
SELECT dp.name AS DatabaseUser, dp.type_desc
FROM sys.database_principals AS dp
WHERE dp.name = N'ecoride_ai_readonly';
GO
