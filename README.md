# Merged V.2

A hotel-anchored local experience platform. A guest scans their hotel's QR code,
picks interests, and gets a walking itinerary through nearby attractions and
that hotel's partners — checking in as they go, collecting achievements, and
watching 3D models of the places they've unlocked appear on the map.

This is the **local development build**. It is not production ready.

It merges two earlier projects:

| Source | Role |
| --- | --- |
| `Map Advisor Functional` | The base: hotels, attractions, partners, itinerary engine, QR, auth |
| `Map Achievement Functional` (UnlockAR) | Folded in: 3D models, achievement badges, AR concept |

Neither source project was modified.

---

## Running it

```bash
npm install
npm run db:push      # create/update the schema in the Neon database
npm run db:seed      # deterministic local test data, safe to re-run
npm run dev
```

Then sign in as the development test account:

```
ratichak / 01024072661       (admin — has the testing shortcuts)
testguest / testguest-local-only   (plain guest, for checking non-admin behaviour)
```

Both accounts exist only in the local seed. Passwords are stored bcrypt-hashed;
nothing is hardcoded into client code.

### Checks

```bash
npm run check             # typecheck + lint + unit tests
npm run build             # production build

# These need a dev server already running. They take the base URL as an
# argument; it defaults to http://localhost:3001.
npm run test:e2e          # the twelve required scenarios, end to end
npm run qa                # all three QA suites below
npm run qa:sweep          # every route: console errors, 404s, a11y, overflow
npm run qa:interactions   # every CRUD path, validation rule and permission guard
npm run qa:3d-camera      # 3D picking, the 3D viewer, the QR scanner, the AR loop
npm run qa:visual         # screenshots at desktop/phone width, light and dark
npm run test:lock-state   # proves locked models render grey, unlocked in colour
npm run map:shots         # the map under varied camera angles

npm run test:prod-gate    # point at `next start`: testing shortcuts must be gone
```

`qa:sweep` asserts a clean console across every route for anonymous, guest and
admin sessions — including that routes which *should* 404 do, and that the
custom 404 page renders. `qa:interactions` creates its own throwaway records and
deletes them again, so it leaves the seed data as it found it.

---

## The one authoritative place record

The most important structural decision. A real-world place is exactly one row,
in one of three tables:

```
hotels        attractions        partners
```

Each of those carries everything about that place — coordinates, QR token,
3D model and its transform, AR target, verification mode. The old UnlockAR
`objects` table is gone: a statue is an `attractions` row that *also* has a
model and a badge, never a second record that could drift out of sync.

Two tables key off that identity rather than duplicating it:

- `achievements` — one badge per place, enforced by a unique constraint on
  `(place_type, place_id)`.
- `place_check_ins` — one row per guest per place, enforced by its primary key.

`place_id` has no foreign key (it points into one of three tables), so deleting
a place cleans up its achievement in application code.

---

## How the pieces fit

```
src/
  lib/
    route-engine.ts     getWalkingRoute() + optimized ordering — the ONLY Mapbox routing
    check-in.ts         verification providers (gps | qr | ar) and the stop/place writes
    achievements.ts     idempotent badge granting
    ar-hash.ts          perceptual hashing shared by client and server
    ar-capture.ts       browser side: camera frame -> hash
    map3d/
      anchor.ts         geographic -> world transform (pure, unit-tested)
      GroundedScene.ts  the single Mapbox custom layer
    dev-tools.ts        the gate on every testing shortcut
  actions/              server actions, one module per domain
  components/           guest UI
  components/admin/     admin UI
  db/                   schema + queries
```

### Routing

Everything goes through `getWalkingRoute(origin, destination)`. It returns a
discriminated result, not a nullable route:

```ts
{ ok: true, route } | { ok: false, error }
```

That is deliberate — a failed request surfaces a retry message on the map. A
straight line is never drawn and called a walking route. Stop *ordering* uses
the Optimized Trips API, where a failure is non-fatal and falls back to the
given order.

### Progressive reveal

The day's later stops never reach the browser. `app/(app)/hotels/[id]/page.tsx`
slices the itinerary server-side at the current stop, and only the leg being
walked right now is routed. The full optimized geometry is cached on
`itinerary_days` for admin reference and is not sent to the guest.

### Itinerary rules

- 4–8 stops; carried over from the previous day, +1 when that day was finished
  in under half its estimated walking time.
- Candidates within 5 km of the hotel, filtered by the guest's chosen categories.
- Ranked least-recently-visited first, then nearest.
- **At least one hotel activity**, always first or last — never mid-route.
  Odd days open at the hotel, even days close there.
- At least one partner, when the hotel has any assigned.
- Too small a pool reuses places rather than failing.

### Hotel separation

`getPartnersForHotel()` is the only path to partners in the guest flow. There is
no "all partners" query a guest page can reach. The seed deliberately gives the
three hotels disjoint partner sets, and leaves four partners unassigned, so the
rule is observable rather than assumed.

### Check-in

One funnel, whatever the evidence:

```
verify (gps | qr | ar)
  -> mark the stop visited
  -> record the place check-in
  -> grant the achievement
  -> report the next stop
```

The stop's own `verification_mode` decides which evidence is accepted, so a
client cannot downgrade a QR-protected stop to a GPS check-in. Every write is
idempotent: re-scanning the same code adds no row and shows no second
celebration.

### 3D map

Rebuilt, not ported. The previous implementation created one custom layer and
one WebGL renderer *per model* and multiplied each object's transform into the
camera's projection matrix — which is why models scattered as soon as the camera
moved.

Now: one Mapbox custom layer, one three.js scene, one renderer, many object
groups. Each object's position is derived once from its longitude/latitude via
`MercatorCoordinate` and baked into its own matrix; the camera receives Mapbox's
frame matrix and nothing else. Screen pixels and DOM positions are never
involved.

Convention, fixed throughout: **X = east, Y = up, Z = south**, produced by
`T(mercator) · S(s, −s, s) · Rx(90°)`. The non-uniform scale is why that matrix
is composed by hand rather than via three.js's position/rotation/scale, which
compose in a different order.

Also handled: GLB caching (each model is fetched once and cloned), per-place
height/rotation/elevation/scale so badly-authored models can still be placed,
base-on-the-ground normalization, resize, style reload, disposal, and true
raycast picking — a click resolves to the place id carried on the mesh, not to
whichever marker happens to be nearest.

### AR

Implemented, with honest limits. The admin uploads a reference photo; the
browser reduces it to a 240-bit difference hash at upload time. At check-in the
guest's camera frame is reduced the same way and **only the hash is sent** — the
comparison runs server-side, so the client is never told what a match looks like
and cannot assert one. AR additionally requires GPS proximity, so photographing
a postcard does not work.

What it is not: it does not track or anchor anything in 3D, and it matches a
framing rather than recognising a subject from any angle. It is a verification
provider behind the same interface as GPS and QR, so replacing the matcher
changes one function.

---

## Testing shortcuts

Force-unlock a hotel, regenerate the itinerary, mark the current stop visited,
undo a check-in, unlock achievements, reset progress.

They require **both** a non-production build **and** `ENABLE_TEST_TOOLS=true`.
There is no code path that reaches them in a production build, which
`npm run test:prod-gate` verifies against a real `next start`.

---

## What was verified

- `npm run check` — 14 unit tests, typecheck, lint, all clean.
- `npm run build` — clean, 25 routes.
- `tests/e2e.mjs` — 76 assertions across all twelve required scenarios, driven
  through a real browser: QR unlock via the printed `/unlock/<token>` URL,
  hotel separation in both directions, generation rules, progressive reveal,
  GPS gating near and far, QR check-in, duplicate-scan safety, admin pages,
  achievement collection.
- `tests/qa-sweep.mjs` — 0 console errors and 0 warnings across every route, as
  anonymous, guest and admin, at desktop and phone width.
- `tests/qa-interactions.mjs` — 49 assertions: every create/edit/delete path,
  upload validation, cascade cleanup, permission guards, guest edge cases.
- `tests/qa-3d-camera.mjs` — 24 assertions with a synthetic camera: clicking a
  3D model opens the right place (and clicking empty map opens nothing, which is
  what proves it is a real ray hit-test), the standalone viewer renders and
  closes, the QR scanner starts and releases its stream, and the AR loop
  captures → hashes → is rejected server-side on the visual check.
- `tests/lock-state.mjs` — diffing the locked and unlocked captures, the model's
  own pixels are 2.3× more saturated when unlocked.
- `tests/map-shots.mjs` — models visually confirmed anchored under zoom, pitch,
  rotation, pan and resize.
- `tests/prod-gate.mjs` — against a real `next start`, every testing shortcut is
  gone while the account still works.

### Defects found by QA and fixed

| Found | Fix |
| --- | --- |
| `/unlock/[token]` called `revalidatePath` during render — Next 16 forbids it, breaking the whole printed-QR flow | Moved the scan into a client-invoked action with loading/success/failure states |
| A scanned place code only worked at the most recently unlocked hotel | `resolveScan` now searches every hotel the guest has unlocked |
| `next start` rejected every sign-in (`UntrustedHost`) | `AUTH_TRUST_HOST` documented in `.env.local` |
| 404s showed Next's bare default, with no way back | Custom `not-found.tsx`, plus an `error.tsx` so no stack trace reaches a guest |
| The mobile navbar's scan button overlapped the nav links | Navbar is flex below `sm`, icon-only actions on a phone |
| The profile badge stack collided with its summary text on a phone | Stacks vertically below `sm`; badges shrink to 72px |
| "Places visited" and the dashboard's check-ins said only "Partner"/"Hotel", never which one | One shared `getPlaceNameMap()` resolves names everywhere |
| Two `<select>`s had no accessible name | Labelled the verification-mode and role controls |
| The QR page promised "attractions that use QR check-in" but listed all of them | Each code now shows its actual check-in mode |
| The preferences button used a different style from every other primary button | Unified on indigo |

A second pass then audited for code that existed but nothing reached:

| Found | Fix |
| --- | --- |
| **Hotel activities could not be edited or deactivated.** `updateHotelActivity` and `toggleHotelActivity` were written and never wired to any UI, so the `active` flag the itinerary engine respects could never be set — an activity closed for the season had to be deleted outright | Inline edit + an Activate/Deactivate switch on each activity |
| **Hotel events could not be edited.** `updateHotelEvent` was likewise unreachable — a wrong date meant delete and re-add | Inline edit on each event, with past events marked |
| **The standalone 3D viewer (spec §29) was never ported** from UnlockAR | Rebuilt on plain three.js + `OrbitControls` (no new dependencies); opens from a place's map popup and previews the model in the admin form |
| `Date.now()` was read during render in an event row — impure, and a hydration-mismatch risk | The `past` flag is computed in the query layer |
| Seven exports were dead (`checkInByScan`, two unused queries, two unused `place.ts` helpers, an unreachable test tool) | Removed; the test tool was wired up instead, as a per-achievement unlock |

---

## Known limitations

- **Storage is local disk** (`public/uploads/`). Fine for development; swapping
  in Vercel Blob is a one-file change in `lib/storage.ts` since only the public
  path is ever persisted.
- **Preferences use delete-then-insert.** The Neon HTTP driver has no
  transactions. Kept as-is, as a low-stakes list.
- **No AI task-scoring.** Generation is deterministic, as specified.
- **AR matching is single-view**, as described above.
- **`AUTH_TRUST_HOST` is set in `.env.local`** so `next start` works on
  localhost. A real deployment should set it deliberately, only where a trusted
  proxy sets the host.
