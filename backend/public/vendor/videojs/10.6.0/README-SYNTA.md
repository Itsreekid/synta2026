# Synta Video.js distribution

Pinned upstream: @videojs/cdn 10.6.0, released 2026-11-20. Official release: https://videojs.org/changelog/10.6.0

Production JS/CSS mirrors the integrity-verified npm tarball with its relative import layout intact. Development JS and sourcemaps are omitted. Only the video preset and French locale are imported by the app. Other mirrored entries are not automatically loaded. All files under this versioned path receive immutable public caching; never replace these assets in place after production rollout.

orientation-support.js is the official @videojs/core 10.6.0 orientation presentation controller. Its two predicate imports are inlined for no-build browser use; the controller body is unchanged. PROVENANCE.json records both npm tarball integrity values. Apache-2.0 attribution is in LICENSE.

App integration lives outside this directory in public/js/learning-player.js and public/css/learning-player.css. Fullscreen UI is library-owned; orientation requests use the official controller. Skin mobile overrides are version-pinned and covered by browser tests. Test physical iOS/Android before rollout; headless fullscreen/rotation simulations are not device evidence.
