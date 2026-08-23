-- Set a password for an existing account, so sign-in does not depend on email.
--
-- WHY THIS EXISTS
-- Magic links put email delivery on the critical path, and it has two failure
-- modes that lock everyone out with no way back in:
--
--   1. Supabase's built-in sender allows only a couple of messages an hour.
--      Once you trip it, every further attempt fails for the rest of the hour.
--   2. The link uses PKCE — the code verifier is stored in the browser that
--      requested it, so a link opened anywhere else cannot complete.
--
-- A password depends on none of that.
--
-- HOW TO RUN
-- Dashboard → SQL Editor → New query. Replace BOTH placeholders, run it once,
-- then sign in at /sign-in using "Use a password instead".
--
-- Pick a real password — this is a live account on a project that also hosts
-- other apps. Do not paste it into a chat, an issue, or a commit.

update auth.users
set
  -- Supabase Auth stores bcrypt hashes; `crypt(..., gen_salt('bf'))` produces
  -- exactly the format it verifies against on sign-in.
  encrypted_password = extensions.crypt('REPLACE-WITH-YOUR-PASSWORD',
                                        extensions.gen_salt('bf')),
  -- An unconfirmed address cannot sign in at all. Already-confirmed accounts
  -- keep their original timestamp rather than having it reset.
  email_confirmed_at = coalesce(email_confirmed_at, now()),
  updated_at = now()
where email = 'REPLACE-WITH-YOUR-EMAIL';

-- Confirm exactly one row changed and the account is usable.
-- Expect: has_password true, confirmed true.
select
  email,
  (encrypted_password is not null and encrypted_password <> '') as has_password,
  (email_confirmed_at is not null)                              as confirmed,
  last_sign_in_at
from auth.users
where email = 'REPLACE-WITH-YOUR-EMAIL';

-- If has_password comes back false, `crypt` is not on the search path for this
-- project. Run `create extension if not exists pgcrypto with schema extensions;`
-- and try again — or drop the `extensions.` prefixes if pgcrypto lives in public.
--
-- TO REMOVE THE PASSWORD LATER (back to magic-link only):
--   update auth.users set encrypted_password = null where email = '…';
-- and set NEXT_PUBLIC_ENABLE_PASSWORD_AUTH=false in Vercel.
