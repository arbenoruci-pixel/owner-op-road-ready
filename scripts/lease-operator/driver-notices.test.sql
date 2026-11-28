-- Run after the repository migrations in a disposable database.
begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('d8000000-0000-4000-8000-000000000001','notice-office@example.invalid',now()),
 ('d8000000-0000-4000-8000-000000000002','notice-driver@example.invalid',now()),
 ('d8000000-0000-4000-8000-000000000003','notice-other-driver@example.invalid',now()),
 ('d8000000-0000-4000-8000-000000000004','notice-other-office@example.invalid',now());
insert into public.rr_lease_operators(id,carrier_user_id,driver_user_id,company_name,driver_name,workspace_kind,share_bps,pay_weekday) values
 ('dc000000-0000-4000-8000-000000000001','d8000000-0000-4000-8000-000000000001',null,'Fixture fleet','Office','carrier',10000,null),
 ('dc000000-0000-4000-8000-000000000002','d8000000-0000-4000-8000-000000000001','d8000000-0000-4000-8000-000000000002','Fixture driver','Driver','leased',9200,5),
 ('dc000000-0000-4000-8000-000000000003','d8000000-0000-4000-8000-000000000001','d8000000-0000-4000-8000-000000000003','Second driver','Second driver','leased',9200,5),
 ('dc000000-0000-4000-8000-000000000004','d8000000-0000-4000-8000-000000000004',null,'Other carrier','Other owner','carrier',10000,null);

create function pg_temp.notice_user(actor uuid) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub',actor,'role','authenticated')::text,true)
$$;
do $$
declare
 fleet constant uuid := 'dc000000-0000-4000-8000-000000000001';
 driver_op constant uuid := 'dc000000-0000-4000-8000-000000000002';
 other_op constant uuid := 'dc000000-0000-4000-8000-000000000003';
 outside_op constant uuid := 'dc000000-0000-4000-8000-000000000004';
 saved uuid;
begin
 assert not has_function_privilege('anon','public.rr_driver_notices(uuid,integer)','EXECUTE');
 assert not has_table_privilege('authenticated','rr_lease_private.driver_notices','SELECT');
 set local role authenticated;
 perform pg_temp.notice_user('d8000000-0000-4000-8000-000000000001');
 saved:=public.rr_driver_notice_publish(fleet,'fixture','Roadside update','Carry the revised form.','https://example.org/update');
 assert public.rr_driver_notice_publish(fleet,'fixture','Roadside update','Carry the revised form.','https://example.org/update')=saved;
 begin
  perform public.rr_driver_notice_publish(fleet,'fixture','Changed','A different update.');
  raise exception 'Changed content reused the same publication key';
 exception when unique_violation then null; end;
 begin
  perform public.rr_driver_notice_publish(fleet,'badurl','Unsafe link','Check the form.','javascript:alert(1)');
  raise exception 'Unsafe URL accepted';
 exception when check_violation then null; end;
 perform pg_temp.notice_user('d8000000-0000-4000-8000-000000000002');
 assert public.rr_driver_notices(driver_op)->>'unread'='1';
 assert public.rr_driver_notices(driver_op)->'items'->0->>'id'=saved::text;
 begin
  perform public.rr_driver_notice_publish(fleet,'blocked','Driver','Cannot publish.');
  raise exception 'Driver published a fleet announcement';
 exception when insufficient_privilege then null; end;
 perform public.rr_driver_notice_read(driver_op,saved);
 perform public.rr_driver_notice_read(driver_op,saved);
 assert public.rr_driver_notices(driver_op)->>'unread'='0';
 perform pg_temp.notice_user('d8000000-0000-4000-8000-000000000003');
 assert public.rr_driver_notices(other_op)->>'unread'='1';
 perform pg_temp.notice_user('d8000000-0000-4000-8000-000000000004');
 assert public.rr_driver_notices(driver_op)->>'total'='0' and public.rr_driver_notices(outside_op)->>'total'='0';
 begin
  perform public.rr_driver_notice_read(outside_op,saved);
  raise exception 'Cross-fleet read succeeded';
 exception when insufficient_privilege then null; end;
 begin
  perform public.rr_driver_notice_publish(fleet,'blocked','Other carrier','Cannot publish here.');
  raise exception 'Cross-fleet publish succeeded';
 exception when insufficient_privilege then null; end;
 reset role;
 set local role service_role;
 perform public.rr_driver_notice_publish(fleet,'fmcsa:fixture:revision','Scheduled update','Check the form.','https://example.org/form');
 begin
  perform public.rr_driver_notice_publish(driver_op,'wrong','Wrong workspace','Decline.');
  raise exception 'Non-carrier workspace accepted';
 exception when insufficient_privilege then null; end;
 reset role;
end $$;
rollback;
