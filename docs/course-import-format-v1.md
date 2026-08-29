# GolfCaddie Course Import Format v1

## Purpose
A single versioned interchange format for importing, exporting, validating and later AI-generating course data. External providers, CSV converters, GeoJSON converters and AI mapping pipelines should normalize into this contract before anything is written to Supabase.

Version 1 deliberately mirrors the data the current app can preserve without inventing a per-hole/per-tee distance schema.

## Top-level contract

```json
{
  "schema": "golfcaddie.course.v1",
  "source": {
    "provider": "manual",
    "source_id": null,
    "source_url": null,
    "retrieved_at": "2026-08-29T00:00:00Z",
    "license": null,
    "notes": null
  },
  "course": {
    "name": "Example Golf Club",
    "latitude": -26.6500,
    "longitude": 153.0800,
    "holes": 18
  },
  "scorecard": [
    { "number": 1, "par": 4, "stroke_index": 7, "metres": 342 }
  ],
  "tee_sets": [
    {
      "name": "White",
      "colour": "white",
      "total_metres": 5630,
      "course_rating": 68.4,
      "slope_rating": 121
    }
  ],
  "hole_locations": [
    {
      "number": 1,
      "tee": { "lat": -26.6501, "lng": 153.0801 },
      "green_front": { "lat": -26.6480, "lng": 153.0812 },
      "green_centre": { "lat": -26.6479, "lng": 153.0813 },
      "green_back": { "lat": -26.6478, "lng": 153.0814 }
    }
  ],
  "zones": [
    {
      "hole_number": 1,
      "type": "fairway",
      "coordinates": [{ "lat": -26.6499, "lng": 153.0802 }]
    },
    {
      "hole_number": 1,
      "type": "green",
      "coordinates": [{ "lat": -26.6480, "lng": 153.0812 }]
    },
    {
      "hole_number": 1,
      "type": "fairway_centreline",
      "coordinates": [
        { "lat": -26.6501, "lng": 153.0801 },
        { "lat": -26.6479, "lng": 153.0813 }
      ]
    }
  ],
  "hazards": [
    {
      "hole_numbers": [1],
      "type": "bunker",
      "label": "Front right bunker",
      "coordinates": [{ "lat": -26.6481, "lng": 153.0814 }]
    }
  ]
}
```

## Rules
- `schema` must equal `golfcaddie.course.v1`.
- Course coordinates use decimal WGS84 latitude/longitude.
- `course.holes` must be 9 or 18.
- `scorecard` must contain exactly the expected hole numbers once each.
- `par` must be 3–6.
- `stroke_index` must be unique and between 1 and the course hole count.
- `metres` must be 40–750.
- At least one tee set is required.
- Tee-set `total_metres` must be positive.
- `course_rating` must be positive; `slope_rating` must be 55–155.
- `hole_locations`, `zones` and `hazards` are optional. Missing rich geometry keeps the course in draft and is surfaced by Course Readiness.
- Zone types are `green`, `fairway`, `tee_box`, `fairway_centreline`.
- Hazard types are `bunker`, `water`, `trees`, `ob`, `red_zone`.
- Polygon geometry should contain at least 3 coordinates. A fairway centreline should contain at least 2.
- Hazard `hole_numbers` may contain multiple holes for shared hazards. An empty list is interpreted as course-wide and should only be supplied intentionally.

## Mapping to current Supabase model
- `course` -> `courses`.
- `scorecard` -> `holes`, including the current `white_metres` distance field.
- `tee_sets` -> `tee_sets`.
- `hole_locations` -> GPS fields on `holes`.
- `zones` -> `hole_zones`.
- `hazards` -> `hazards`.
- Imported courses are always created as `draft`; publication remains controlled by Course Readiness.

## Deliberate v1 limitation
The current database does not store a separate distance for every hole for every tee set. Therefore v1 carries one canonical hole distance in `scorecard[].metres` plus each tee set's total distance/rating/slope. We should only add per-hole/per-tee distances when that becomes a demonstrated product requirement, at which point the interchange schema can evolve without silently discarding data.

## Import safety model
1. Parse into this contract.
2. Validate without database writes.
3. Show an import preview with errors/warnings.
4. Check duplicate name and nearby coordinates.
5. Commit the course and related records.
6. If any downstream write fails, clean up the newly-created course record so cascades remove the partial import.
7. Keep the course in `draft` until readiness checks pass and an admin explicitly publishes it.

## Versioning
Breaking changes require a new schema identifier such as `golfcaddie.course.v2`. Importers should reject unknown schema versions rather than guessing.
