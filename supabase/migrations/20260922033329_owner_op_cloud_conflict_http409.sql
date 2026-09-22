-- Owner Operator project ghwkcgczuwctzxsxmqzx only.
-- Business revision conflicts must return HTTP 409 instead of asking
-- PostgREST 14 to retry a serialization failure indefinitely.
-- https://supabase.com/docs/guides/troubleshooting/high-cpu-and-infinite-transaction-retries-when-using-custom-error-codes-in-rpc-functions-77326b
-- Preserve the deployed function's ownership, ACL, invoker mode, timeouts,
-- revision checks and all data operations. Refuse unreviewed function drift.
set local lock_timeout = '5s';
set local statement_timeout = '15s';

do $migration$
declare
  target regprocedure := to_regprocedure('public.owner_op_cloud_v1(text,jsonb)');
  original text;
  corrected text;
  access_before jsonb;
  access_after jsonb;
begin
  if target is null then
    raise exception 'Owner Operator cloud function is missing; wrong project or schema';
  end if;
  original := pg_get_functiondef(target);
  if md5(original) = '927a873a1ebff9ad53b4c55f77d2333b' then
    return;
  end if;
  if md5(original) <> 'e01f7b846970aa42f5c0e17e86cbe14e' then
    raise exception 'Owner Operator cloud function changed; review before applying';
  end if;
  corrected := replace(original, 'errcode=''40001''', 'errcode=''PT409''');
  if md5(corrected) <> '927a873a1ebff9ad53b4c55f77d2333b' then
    raise exception 'Expected exactly the three reviewed conflict-code replacements';
  end if;
  select jsonb_build_object('owner', proowner, 'acl', proacl::text,
    'security_definer', prosecdef, 'settings', proconfig)
    into access_before from pg_proc where oid = target;
  execute corrected;
  select jsonb_build_object('owner', proowner, 'acl', proacl::text,
    'security_definer', prosecdef, 'settings', proconfig)
    into access_after from pg_proc where oid = target;
  if access_before is distinct from access_after
    or md5(pg_get_functiondef(target)) <> md5(corrected) then
    raise exception 'Function access or body changed unexpectedly';
  end if;
end
$migration$;

notify pgrst, 'reload schema';
