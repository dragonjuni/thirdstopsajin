#!/bin/sh
# Tests the photo check that keeps GPS data and full-size images out of the
# public repo: .githooks/pre-commit (and pre-merge-commit) in a throwaway git
# repository made from a copy of the project, and scripts/check-photos.sh on
# its own. Run it with `npm test`.
#
# The test images are made here. GPS data is only ever added to copies in a
# temporary folder, never to a file in the project.

root=$(cd "$(dirname "$0")/.." && pwd) || exit 1
work=$(mktemp -d "${TMPDIR:-/tmp}/thirdstopsajin-photos.XXXXXX") || exit 1
trap 'rm -rf "$work"' EXIT
PATH="$PATH:/opt/homebrew/bin:/usr/local/bin" # where exiftool usually is

# The owner's own git settings must not change the results.
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1

# Test images: web-sized, full-sized, HEIF and TIFF, then GPS copies.
img="$work/images"
mkdir "$img" || exit 1
(cd "$root" && node -e '
const sharp = require("sharp");
const dir = process.argv[1];
const make = (w, h) => sharp({ create: { width: w, height: h, channels: 3, background: { r: 110, g: 130, b: 150 } } });
Promise.all([
  make(2000, 1333).jpeg().toFile(`${dir}/clean.jpg`),
  make(6000, 4000).jpeg().toFile(`${dir}/big.jpg`),
  make(2000, 1333).heif({ compression: "av1" }).toFile(`${dir}/clean.heic`),
  make(2000, 1333).tiff().toFile(`${dir}/clean.tif`),
]).catch((error) => { console.error(error); process.exit(1); });
' "$img") || exit 1
for ext in jpg heic tif; do cp "$img/clean.$ext" "$img/gps.$ext"; done
exiftool -q -overwrite_original -GPSLatitude=37.5665 -GPSLatitudeRef=N -GPSLongitude=126.978 -GPSLongitudeRef=E \
  "$img/gps.jpg" "$img/gps.heic" "$img/gps.tif" || exit 1

# The throwaway repository, with the hooks turned on as `npm install` does.
repo="$work/repo"
rsync -a --exclude=/node_modules --exclude=/dist --exclude=/.astro --exclude=/.git --exclude=/.claude "$root/" "$repo/" || exit 1
git -C "$repo" init -q -b main &&
  git -C "$repo" config core.hooksPath .githooks &&
  git -C "$repo" config user.name Test &&
  git -C "$repo" config user.email test@example.com &&
  git -C "$repo" add -A &&
  git -C "$repo" commit -q -m start &&
  git -C "$repo" tag start || {
  echo 'photos.sh: could not set up the test repository (see above).' >&2
  exit 1
}

# Puts the repository back to its first commit, with nothing else in it.
reset() {
  git -C "$repo" merge --abort >/dev/null 2>&1
  git -C "$repo" checkout -q -f main &&
    git -C "$repo" reset -q --hard start &&
    git -C "$repo" clean -q -fdx &&
    { git -C "$repo" branch -q -D side >/dev/null 2>&1 || true; }
}

# put <image> <path>: copies a test image into the repository and stages it.
put() {
  mkdir -p "$(dirname "$repo/$2")" && cp "$img/$1" "$repo/$2" && git -C "$repo" add -A
}
commit() {
  git -C "$repo" commit -q -m test
}
# Commits without the hook, as GitHub's website or `--no-verify` would.
commit_unchecked() {
  git -C "$repo" add -A && git -C "$repo" commit -q --no-verify -m unchecked
}

passed=0
failed=0
# check <name> blocked|allowed <text the output must contain, or ''> <command...>
check() {
  name=$1 want=$2 text=$3
  shift 3
  if "$@" >"$work/out" 2>&1; then got=allowed; else got=blocked; fi
  if [ "$got" != "$want" ]; then
    failed=$((failed + 1))
    echo "FAIL  $name: $got, but should be $want"
    sed 's/^/    /' "$work/out"
  elif [ -n "$text" ] && ! grep -qF -- "$text" "$work/out"; then
    failed=$((failed + 1))
    echo "FAIL  $name: the message does not mention $text"
    sed 's/^/    /' "$work/out"
  else
    passed=$((passed + 1))
    echo "ok    $name"
  fi
  reset
}

# The pre-commit hook blocks these.
put gps.jpg src/content/photos/2026-10-test/01.jpg
check 'GPS in a JPEG' blocked 'src/content/photos/2026-10-test/01.jpg' commit
put gps.heic src/content/photos/2026-10-test/01.heic
check 'GPS in a HEIF file' blocked 'src/content/photos/2026-10-test/01.heic' commit
put gps.jpg src/content/photos/2026-10-test/scan
check 'GPS in a file with no extension' blocked 'src/content/photos/2026-10-test/scan' commit
put gps.tif raw/01.dng
check 'GPS in a .dng file' blocked 'raw/01.dng' commit
put gps.jpg .hidden/01.jpg
check 'GPS in a hidden folder' blocked '.hidden/01.jpg' commit
put gps.jpg .github/01.jpg
check 'GPS in .github' blocked '.github/01.jpg' commit
put gps.jpg 'back\slash.jpg'
check 'GPS in a file name with a backslash' blocked 'back\slash.jpg' commit
put gps.jpg 'my photo.jpg'
check 'GPS in a file name with a space' blocked 'my photo.jpg' commit
put gps.jpg '사진.jpg'
check 'GPS in a Korean file name' blocked '사진.jpg' commit
put big.jpg src/content/photos/2026-10-test/01.jpg
check 'a full-resolution image' blocked 'src/content/photos/2026-10-test/01.jpg (6000 x 4000)' commit

put gps.jpg 01.jpg
cp "$img/clean.jpg" "$repo/01.jpg" # the working copy is clean, the staged one is not
check 'a staged GPS file whose working copy is clean' blocked '01.jpg' commit

ln -s README.md "$repo/01.jpg" && commit_unchecked >/dev/null
rm "$repo/01.jpg" && put gps.jpg 01.jpg
check 'a symlink replaced by a GPS file' blocked '01.jpg' commit

git -C "$repo" checkout -q -b side && put gps.jpg side.jpg && commit_unchecked >/dev/null
git -C "$repo" checkout -q main && echo 'More text.' >>"$repo/README.md" && commit_unchecked >/dev/null
check 'a merge of a branch whose GPS commit skipped the hook' blocked 'side.jpg' git -C "$repo" merge -q --no-edit side

# The pre-commit hook allows these.
put clean.jpg src/content/photos/2026-10-test/01.jpg && put clean.heic 02.heic && put clean.tif 03.dng
check 'clean web-sized images' allowed '' commit
echo 'More text.' >>"$repo/README.md" && git -C "$repo" add -A
check 'a Markdown-only commit' allowed '' commit
echo 'More text.' >>"$repo/README.md" && git -C "$repo" add -A
check 'a Markdown-only commit with PATH=/usr/bin:/bin' allowed '' env PATH=/usr/bin:/bin git -C "$repo" commit -q -m test
put clean.jpg 01.jpg
cp "$img/gps.jpg" "$repo/01.jpg" # the staged copy is clean, the working one is not
check 'a clean staged file whose working copy has GPS' allowed '' commit
put gps.jpg 01.jpg && commit_unchecked >/dev/null
git -C "$repo" rm -q 01.jpg
check 'a commit that only deletes a GPS file' allowed '' commit

# scripts/check-photos.sh on its own.
check 'check-photos.sh with a path that does not exist' blocked 'nope.jpg does not exist' sh "$repo/scripts/check-photos.sh" "$repo/nope.jpg"
mkdir -p "$repo/public/dist" && cp "$img/gps.jpg" "$repo/public/dist/01.jpg"
check 'check-photos.sh checks public/dist/' blocked 'public/dist/01.jpg' sh "$repo/scripts/check-photos.sh"
for dir in dist node_modules/some-package .astro; do
  mkdir -p "$repo/$dir" && cp "$img/gps.jpg" "$repo/$dir/01.jpg"
done
check 'check-photos.sh skips the top-level dist/, node_modules/ and .astro/' allowed '' sh "$repo/scripts/check-photos.sh"

if [ "$failed" -gt 0 ]; then
  echo "$failed of $((passed + failed)) photo checks failed." >&2
  exit 1
fi
echo "All $passed photo checks passed."
