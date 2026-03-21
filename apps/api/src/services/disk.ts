import { run } from './shell.js'

// List all block devices
export async function listDisks() {
  const { stdout } = await run('lsblk --json -b -o NAME,SIZE,TYPE,FSTYPE,MOUNTPOINT,MODEL')
  return JSON.parse(stdout)
}

// Get mounted filesystem usage
export async function getDiskUsage() {
  const { stdout } = await run("df -BM --output=source,fstype,size,used,avail,pcent,target -x tmpfs -x devtmpfs -x squashfs | tail -n +2")
  return stdout.trim().split('\n').map(line => {
    const parts = line.trim().split(/\s+/)
    return {
      device: parts[0],
      fstype: parts[1],
      size: parts[2],
      used: parts[3],
      avail: parts[4],
      usePercent: parseInt(parts[5]) || 0,
      mountpoint: parts[6],
    }
  })
}

// Create partition using parted
export async function createPartition(disk: string, sizeMB: number, fstype: string) {
  // Validate disk name strictly
  if (!/^[a-z]+[0-9]*$/.test(disk)) throw new Error('Invalid disk name')
  if (!['ext4', 'xfs'].includes(fstype)) throw new Error('Invalid filesystem type')
  // Use parted to create partition
  await run(`parted -s /dev/${disk} mkpart primary ${fstype} 0% ${sizeMB}MB`)
}

// Format a partition
export async function formatPartition(partition: string, fstype: string) {
  if (!/^[a-z]+[0-9]*p?[0-9]+$/.test(partition)) throw new Error('Invalid partition name')
  if (!['ext4', 'xfs'].includes(fstype)) throw new Error('Invalid filesystem type')
  await run(`mkfs.${fstype} -f /dev/${partition} 2>&1 || mkfs.${fstype} /dev/${partition}`)
}

// Mount a partition
export async function mountPartition(partition: string, mountpoint: string) {
  if (!mountpoint.startsWith('/mnt/')) throw new Error('Mountpoint must be under /mnt/')
  await run(`mkdir -p ${mountpoint}`)
  await run(`mount /dev/${partition} ${mountpoint}`)
}

// Unmount
export async function unmountPartition(mountpoint: string) {
  if (!mountpoint.startsWith('/mnt/')) throw new Error('Cannot unmount system path')
  await run(`umount ${mountpoint}`)
}

// Add to fstab
export async function addToFstab(partition: string, mountpoint: string, fstype: string) {
  const { stdout: uuid } = await run(`blkid -s UUID -o value /dev/${partition}`)
  const fstabLine = `UUID=${uuid.trim()} ${mountpoint} ${fstype} defaults 0 2`
  await run(`echo '${fstabLine}' >> /etc/fstab`)
}

// Remove from fstab
export async function removeFromFstab(mountpoint: string) {
  await run(`sed -i '\\|${mountpoint}|d' /etc/fstab`)
}
