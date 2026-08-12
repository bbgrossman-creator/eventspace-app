#!/bin/bash
# ============================================================================
# v292d race proof — cross-row snapshot consistency (RACE-OD1)
# Two genuine parallel psql backends through a pg_sleep barrier, per the v286
# pattern. Disposable clone.
#
# Hazard: v292d composes one brief per row. If rows could observe different
# states, one day list could show occurrence A pre-ceremony and occurrence B
# post-ceremony. STABLE guarantees a single statement snapshot; this proof
# demonstrates it with a real concurrent commit.
#
# Shape:
#   Backend R (reader): begins a statement that first sleeps 4s inside the
#     same statement that then evaluates the projection — the snapshot is
#     taken at statement start, before the writer commits.
#   Backend W (writer): after 1s, records operating dates onto BOTH fixture
#     occurrences via the real ceremony, committing mid-sleep.
#   Assertion: the reader's projection shows BOTH occurrences absent
#     (pre-state) — never one present and one absent. A control read after
#     the commit shows both present (post-state).
# ============================================================================
set -u
# --- privileged access: ec/lib/pg.sh is the ONLY path to PostgreSQL ----------
. "${EC_LIB_PG:-ec/lib/pg.sh}"
pg_require                      # noninteractive capability gate; never prompts
# ---------------------------------------------------------------------------
DB="ec_v292d_race_$$"
pg_drop "$DB"
pg_clone ec "$DB" || { echo "ABORT: cannot clone ec"; exit 2; }
trap 'pg_drop "$DB"' EXIT

psq() { pg_q "$DB" "$1"; }

TU=$(psq "select tu.tenant_id||' '||tu.user_id from public.tenant_users tu
          where tu.active order by tu.tenant_id limit 1")
TENANT=${TU%% *}; USER=${TU##* }
CTX="select set_config('app.user_id','$USER',false),
            set_config('request.jwt.claim.sub','$USER',false);"

NOW="timestamptz '2026-08-19 15:00:00+00'"
DAY=$(psq "$CTX select 'V:'||public.operational_day_of($NOW,
  public.tenant_operational_timezone('$TENANT'::uuid),
  public.tenant_operational_day_start_hour('$TENANT'::uuid))" | tail -1); DAY=${DAY#V:}

mk() { psq "$CTX
  with b as (insert into public.bookings (tenant_id, contact_name, invoice_num, status)
             values ('$TENANT','Race-$1','RC-'||substr(gen_random_uuid()::text,1,8),'active')
             returning id)
  select (public.open_occurrence(b.id,null,null)->>'occurrence_id') from b" | tail -1; }
O1=$(mk 1); O2=$(mk 2)     # both undated: absent from every day pre-write

P="public.projection_occurrences_for_operational_day"
MEMBER="(select count(*) from jsonb_array_elements(($P(date '$DAY',$NOW))->'data'->'occurrences') r
         where r->>'occurrence' in ('$O1','$O2'))"

# Reader: sleep and projection inside ONE statement => one snapshot at start.
pg_q "$DB" "
  $CTX
  select 'READER:'|| (select $MEMBER from (select pg_sleep(4)) z);" > /tmp/od_race_reader.$$ 2>&1 &
RPID=$!

sleep 1
# Writer: real ceremonies on both occurrences, committed while reader sleeps.
psq "$CTX
  select public.set_schedule_milestone(p_occurrence => '$O1'::uuid,
    p_milestone_key => 'operating_date', p_at_date => date '$DAY',
    p_at_moment => null, p_window_end => null, p_label => null, p_reason => null);
  select public.set_schedule_milestone(p_occurrence => '$O2'::uuid,
    p_milestone_key => 'operating_date', p_at_date => date '$DAY',
    p_at_moment => null, p_window_end => null, p_label => null, p_reason => null);" >/dev/null
WRITE_DONE=$(date +%s)

wait $RPID
READER=$(grep -o 'READER:[0-9]*' /tmp/od_race_reader.$$ | cut -d: -f2)
rm -f /tmp/od_race_reader.$$

CONTROL=$(psq "$CTX select 'V:'||$MEMBER" | tail -1); CONTROL=${CONTROL#V:}

echo "reader saw:  $READER of 2 (must be 0 — all pre-state, never a mixture)"
echo "control saw: $CONTROL of 2 (must be 2 — post-state visible after commit)"

if [ "$READER" = "0" ] && [ "$CONTROL" = "2" ]; then
  echo "RACE-OD1 PASS: single snapshot across all composed rows"
  exit 0
elif [ "$READER" = "1" ]; then
  echo "RACE-OD1 FAIL: MIXED SNAPSHOT — one row pre-commit, one post-commit"
  exit 1
else
  echo "RACE-OD1 INDETERMINATE: reader=$READER control=$CONTROL — rerun; timing may not have interleaved"
  exit 1
fi
