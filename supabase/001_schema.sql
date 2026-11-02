-- Honeywood: run once in Supabase SQL Editor. No destructive reset.
begin;
create schema if not exists honeywood;
revoke all on schema honeywood from public, anon, authenticated;
create table honeywood.campaign (
 id integer primary key check(id=1), initialized boolean not null default false,
 active boolean not null default false, rules text not null default '',
 updated_at timestamptz not null default now()
);
insert into honeywood.campaign(id) values(1);
create table honeywood.entries (
 id uuid primary key default gen_random_uuid(), code text not null unique,
 code_hash text not null unique, created_at timestamptz not null default now(), used_at timestamptz
);
create table honeywood.prizes (
 id uuid primary key default gen_random_uuid(), amount integer not null check(amount in (50,100,200,300)),
 coupon text not null unique, entry_id uuid unique references honeywood.entries(id),
 drawn_at timestamptz, redeemed_at timestamptz, redeemed_by uuid,
 check ((entry_id is null) = (drawn_at is null)), check(redeemed_at is null or drawn_at is not null)
);
create table honeywood.rate_limits (key text primary key, window_start timestamptz not null, attempts integer not null);
create table honeywood.audit (id bigint generated always as identity primary key, actor uuid not null, action text not null, target text, at timestamptz not null default now());
alter table honeywood.campaign enable row level security;
alter table honeywood.entries enable row level security;
alter table honeywood.prizes enable row level security;
alter table honeywood.rate_limits enable row level security;
alter table honeywood.audit enable row level security;
create function public.hw_initialize(p_actor uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, honeywood as $$
declare c honeywood.campaign%rowtype;
begin
 select * into c from honeywood.campaign where id=1 for update;
 if c.initialized then raise exception 'ALREADY_INITIALIZED'; end if;
 insert into honeywood.entries(code,code_hash)
 select v,encode(sha256(convert_to(v,'UTF8')),'hex') from
 (select 'HW-'||upper(replace(gen_random_uuid()::text,'-','')) v from generate_series(1,300)) s;
 insert into honeywood.prizes(amount,coupon)
 select amount,'HWC-'||upper(replace(gen_random_uuid()::text,'-',''))
 from (values(50,150),(100,75),(200,60),(300,15)) t(amount,n), lateral generate_series(1,n);
 update honeywood.campaign set initialized=true,updated_at=now() where id=1;
 insert into honeywood.audit(actor,action) values(p_actor,'initialize');
 return jsonb_build_object('initialized',true);
end $$;
create function public.hw_status() returns jsonb
language sql security definer set search_path = pg_catalog, honeywood as $$
 select jsonb_build_object('active',active,'rules',rules,'remaining',(select count(*) from honeywood.prizes where entry_id is null)) from honeywood.campaign where id=1
$$;
create function public.hw_rate(p_key text) returns boolean
language plpgsql security definer set search_path = pg_catalog, honeywood as $$
declare n integer;
begin
 insert into honeywood.rate_limits as r values(p_key,now(),1)
 on conflict(key) do update set
 attempts=case when r.window_start < now()-interval '1 minute' then 1 else r.attempts+1 end,
 window_start=case when r.window_start < now()-interval '1 minute' then now() else r.window_start end
 returning attempts into n;
 delete from honeywood.rate_limits where window_start < now()-interval '1 day';
 return n<=15;
end $$;
create function public.hw_draw(p_hash text) returns jsonb
language plpgsql security definer set search_path = pg_catalog, honeywood as $$
declare e honeywood.entries%rowtype; p honeywood.prizes%rowtype; c honeywood.campaign%rowtype;
begin
 -- Campaign mutex serializes all allocations, including the very last prize.
 select * into c from honeywood.campaign where id=1 for update;
 select * into e from honeywood.entries where code_hash=p_hash for update;
 if not found then raise exception 'INVALID_CODE'; end if;
 select * into p from honeywood.prizes where entry_id=e.id;
 if found then
  return jsonb_build_object('amount',p.amount,'coupon',p.coupon,'drawn_at',p.drawn_at,'redeemed',p.redeemed_at is not null,'recovered',true);
 end if;
 if not c.active then raise exception 'NOT_ACTIVE'; end if;
 select * into p from honeywood.prizes where entry_id is null order by random() limit 1 for update;
 if not found then raise exception 'SOLD_OUT'; end if;
 update honeywood.prizes set entry_id=e.id,drawn_at=now() where id=p.id returning * into p;
 update honeywood.entries set used_at=p.drawn_at where id=e.id;
 return jsonb_build_object('amount',p.amount,'coupon',p.coupon,'drawn_at',p.drawn_at,'redeemed',false,'recovered',false);
end $$;
create function public.hw_admin() returns jsonb
language sql security definer set search_path = pg_catalog, honeywood as $$
 select jsonb_build_object('campaign',(select to_jsonb(c) from honeywood.campaign c where id=1),
 'stats',(select coalesce(jsonb_agg(t),'[]'::jsonb) from (select amount,count(*) as total,count(*) filter(where entry_id is null) as remaining,count(*) filter(where redeemed_at is not null) as redeemed from honeywood.prizes group by amount order by amount) t),
 'entries',(select coalesce(jsonb_agg(t order by t.created_at),'[]'::jsonb) from (select e.code,e.created_at,e.used_at,p.amount,p.coupon,p.drawn_at,p.redeemed_at from honeywood.entries e left join honeywood.prizes p on p.entry_id=e.id) t))
$$;
create function public.hw_config(p_active boolean,p_rules text,p_actor uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, honeywood as $$
begin
 perform 1 from honeywood.campaign where id=1 for update;
 if p_active and (length(trim(p_rules))<10 or not (select initialized from honeywood.campaign where id=1)) then raise exception 'CONFIG_REQUIRED'; end if;
 if length(p_rules)>4000 then raise exception 'RULES_TOO_LONG'; end if;
 update honeywood.campaign set active=p_active,rules=p_rules,updated_at=now() where id=1;
 insert into honeywood.audit(actor,action,target) values(p_actor,'configure',p_active::text);
 return jsonb_build_object('ok',true);
end $$;
create function public.hw_redeem(p_coupon text,p_actor uuid) returns jsonb
language plpgsql security definer set search_path = pg_catalog, honeywood as $$
declare p honeywood.prizes%rowtype;
begin
 select * into p from honeywood.prizes where coupon=p_coupon and entry_id is not null for update;
 if not found then raise exception 'COUPON_NOT_FOUND'; end if;
 if p.redeemed_at is not null then raise exception 'ALREADY_REDEEMED'; end if;
 update honeywood.prizes set redeemed_at=now(),redeemed_by=p_actor where id=p.id;
 insert into honeywood.audit(actor,action,target) values(p_actor,'redeem',p_coupon);
 return jsonb_build_object('ok',true);
end $$;
-- Only the backend's service_role may execute. Customers never query tables.
revoke all on all tables in schema honeywood from public,anon,authenticated;
revoke all on function public.hw_initialize(uuid),public.hw_status(),public.hw_rate(text),public.hw_draw(text),public.hw_admin(),public.hw_config(boolean,text,uuid),public.hw_redeem(text,uuid) from public,anon,authenticated;
grant execute on function public.hw_initialize(uuid),public.hw_status(),public.hw_rate(text),public.hw_draw(text),public.hw_admin(),public.hw_config(boolean,text,uuid),public.hw_redeem(text,uuid) to service_role;
commit;
