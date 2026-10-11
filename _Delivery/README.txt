Frontier rendering fixes on top of commit 1784c86 (never 3e45285).

  PROOF.md    what every image/GIF/MP4/graph in proof/ is, and what it does NOT prove. Read it.
  proof/      the proof set — open proof/index.html for the browsable version
              (38 Project-Zero renders, 168 Project-Drive renders, 5 GIFs, 5 MP4s, 7 graphs,
               telemetry.csv, per-render timing CSVs, raw stdout logs)
  patches/    git am-able series (10 commits), apply with:
                  git checkout 1784c86 && git am patches/*.patch
  files/      the overlay has been APPLIED: every added/modified file now sits at its real repo
              path in this checkout (this branch). The overlay folder was removed once applied —
              use patches/ if you want to re-apply it on a clean 1784c86 checkout.
  DELETED_FILES.txt
              files removed (Surfel GI + the Project-Drive copy) — delete them if you use the
              overlay instead of the patches.

Nothing here has run on a GPU. This sandbox has no GPU and no Windows: the fix work is
compile/syntax-checked only, and the renders are CPU reference renders (the GPU side simulated
on the CPU). What that does and does not prove is spelled out in PROOF.md section 0.
