#!/bin/sh
# Lists any photo that still carries GPS location data, or that is larger
# than a web export, and exits 1 if there is one. The repo is public, so
# such photos must never be committed.
#
#   sh scripts/check-photos.sh               checks every file in the project
#   sh scripts/check-photos.sh a.jpg folder  checks only those files and folders

# Git apps may run this without Homebrew's folders on the PATH.
PATH="$PATH:/opt/homebrew/bin:/usr/local/bin"
if ! command -v exiftool >/dev/null 2>&1; then
  echo "check-photos: exiftool is not installed, so photos cannot be checked. Install it with: brew install exiftool" >&2
  exit 1
fi

if [ "$#" -eq 0 ]; then
  cd "$(dirname "$0")/.." || exit 1
  set -- .
fi
for target in "$@"; do
  if [ ! -e "$target" ]; then
    echo "check-photos: $target does not exist." >&2
    exit 1
  fi
done

# -r. also enters hidden folders; -ext '*' looks at every file, whatever its name.
# Only the project's own build folders at the top are skipped.
gps=$(exiftool -r. -ext '*' -q -q -i ./.git -i ./node_modules -i ./dist -i ./.astro \
  -if 'defined $GPSLatitude or defined $GPSLongitude or defined $GPSPosition or defined $GPSCoordinates or defined $LocationShownGPSLatitude or defined $LocationCreatedGPSLatitude' \
  -p '$Directory/$FileName' -- "$@")
big=$(exiftool -r. -ext '*' -q -q -i ./.git -i ./node_modules -i ./dist -i ./.astro \
  -if '$FileType ne "SVG" and ($ImageWidth > 2500 or $ImageHeight > 2500)' \
  -p '$Directory/$FileName ($ImageWidth x $ImageHeight)' -- "$@")
# Phone "motion photos" hide a short video, which can carry its own location.
video=$(exiftool -r. -ext '*' -q -q -i ./.git -i ./node_modules -i ./dist -i ./.astro \
  -if 'defined $MotionPhotoVideo or defined $MicroVideo or defined $EmbeddedVideoFile' \
  -p '$Directory/$FileName' -- "$@")

status=0
if [ -n "$gps" ]; then
  echo "These photos still contain GPS location data:" >&2
  printf '%s\n' "$gps" >&2
  echo 'Remove it with:  exiftool -overwrite_original "-*gps*=" <file>' >&2
  status=1
fi
if [ -n "$big" ]; then
  echo "These images are bigger than about 2000px on the long side (screenshots too):" >&2
  printf '%s\n' "$big" >&2
  echo 'Shrink each one with:  sips -Z 2000 <file>' >&2
  status=1
fi
if [ -n "$video" ]; then
  echo "These photos contain a hidden video (a phone motion photo):" >&2
  printf '%s\n' "$video" >&2
  echo 'Save them again as a plain JPEG, for example with:  sips -Z 2000 <file>' >&2
  status=1
fi
exit $status
