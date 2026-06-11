-- Ordered tee-to-green route used by the caddie on dogleg holes.

alter table hole_zones
  drop constraint if exists hole_zones_zone_type_check;

alter table hole_zones
  add constraint hole_zones_zone_type_check
  check (zone_type in ('green', 'fairway', 'tee_box', 'fairway_centreline'));
