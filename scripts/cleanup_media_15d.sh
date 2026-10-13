#!/bin/bash
# cleanup_media_15d.sh — Archive and cleanup files older than 15 days from local VM to NAS
# Runs nightly via crontab (e.g. at 02:00 AM)

LOCAL_DIR="/data/ocms-media"
NAS_DIR="/mnt/nas-media/ocms-media"
LOG_FILE="/var/log/ocms_media_archive.log"

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Starting media archive check (> 15 days)..." >> "$LOG_FILE"

# 1. Safety check: Ensure NAS is mounted and reachable before doing anything!
if ! mountpoint -q /mnt/nas-media; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: /mnt/nas-media is NOT mounted! Aborting cleanup to prevent data loss." >> "$LOG_FILE"
    exit 1
fi

if [ ! -d "$NAS_DIR" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ERROR: NAS directory $NAS_DIR not found! Aborting." >> "$LOG_FILE"
    exit 1
fi

# 2. Step 1: Ensure all files older than 15 days exist on NAS (sync any missing files)
rsync -a --update "$LOCAL_DIR/" "$NAS_DIR/" >> "$LOG_FILE" 2>&1

# 3. Step 2: For each file older than 15 days in LOCAL_DIR, verify it exists on NAS with matching size before deleting
DELETED_COUNT=0
FREED_BYTES=0

while IFS= read -r -d '' local_file; do
    rel_path="${local_file#$LOCAL_DIR/}"
    nas_file="$NAS_DIR/$rel_path"

    if [ -f "$nas_file" ]; then
        local_size=$(stat -c%s "$local_file" 2>/dev/null || echo 0)
        nas_size=$(stat -c%s "$nas_file" 2>/dev/null || echo -1)

        if [ "$local_size" -eq "$nas_size" ] && [ "$local_size" -gt 0 ]; then
            rm -f "$local_file"
            DELETED_COUNT=$((DELETED_COUNT + 1))
            FREED_BYTES=$((FREED_BYTES + local_size))
        fi
    fi
done < <(find "$LOCAL_DIR" -type f -mtime +15 -print0)

# 4. Remove empty sub-directories on local VM
find "$LOCAL_DIR" -mindepth 1 -type d -empty -delete 2>/dev/null

FREED_MB=$((FREED_BYTES / 1024 / 1024))
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Finished. Cleaned $DELETED_COUNT files (>15d), freed ${FREED_MB}MB from local VM storage." >> "$LOG_FILE"
