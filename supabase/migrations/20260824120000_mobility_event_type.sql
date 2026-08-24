-- M7 / C31 — a recovery session is a thing you can log.
--
-- Until now `events.type` had no value for one, so Recovery had no equivalent
-- of Train's "Mark session done ✓" and the only loggable thing on the screen
-- was the rest-day walk. That absence was the clearest signal in the product
-- that recovery was optional.
--
-- 'Mobility' is added to the CHECK and nothing else changes.
-- `gymapp.weekly_active_minutes` sums every event's minutes with no type
-- filter, so a logged mobility session counts toward the daily streak *and*
-- toward the 150-minute weekly challenge — the user's explicit decision, taken
-- over the alternative of excluding it. It is worth naming the trade-off that
-- was accepted: someone can now reach 150 "active minutes" a week entirely on
-- stretching. That was judged the right way round, because a challenge that
-- refuses to count recovery teaches people recovery does not count.
--
-- Purely additive: no existing row can violate a widened CHECK, so this is safe
-- to apply to a live table without a rewrite of application code first.

alter table gymapp.events
  drop constraint events_type_check;

alter table gymapp.events
  add constraint events_type_check
  check (type in ('Workout','Walk','Ride','Run','Swim','Squash','Tennis',
                  'Other sport','Mobility'));

comment on column gymapp.events.type is
  'Workout|Walk|Ride|Run|Swim|Squash|Tennis|Other sport|Mobility. All types '
  'count toward gymapp.weekly_active_minutes; the view applies no type filter.';
