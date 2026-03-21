import type { Server as SocketServer } from 'socket.io'
import si from 'systeminformation'

interface NetworkHistory {
  rx: number
  tx: number
}

let prevNetwork: NetworkHistory = { rx: 0, tx: 0 }

export function startStatsEmitter(io: SocketServer) {
  // Pierwszy odczyt sieci (baseline)
  si.networkStats().then((stats) => {
    const iface = stats[0]
    if (iface) {
      prevNetwork = { rx: iface.rx_bytes, tx: iface.tx_bytes }
    }
  })

  setInterval(async () => {
    if (io.sockets.sockets.size === 0) return // nikogo nie ma, nie zbieraj

    try {
      const [cpuLoad, mem, diskData, netStats, time, cpuTemp] = await Promise.all([
        si.currentLoad(),
        si.mem(),
        si.fsSize(),
        si.networkStats(),
        si.time(),
        si.cpuTemperature().catch(() => ({ main: null, cores: [], max: null })),
      ])

      // Disk — główna partycja /
      const mainDisk = diskData.find((d) => d.mount === '/') ?? diskData[0]

      // Network delta (bytes/s)
      const iface = netStats[0]
      const rxDelta = iface ? Math.max(0, iface.rx_bytes - prevNetwork.rx) : 0
      const txDelta = iface ? Math.max(0, iface.tx_bytes - prevNetwork.tx) : 0
      if (iface) prevNetwork = { rx: iface.rx_bytes, tx: iface.tx_bytes }

      const stats = {
        cpu: Math.round(cpuLoad.currentLoad * 10) / 10,
        ram: {
          used: mem.active,
          total: mem.total,
          percent: Math.round((mem.active / mem.total) * 1000) / 10,
        },
        disk: mainDisk
          ? {
              used: mainDisk.used,
              total: mainDisk.size,
              percent: Math.round((mainDisk.used / mainDisk.size) * 1000) / 10,
            }
          : { used: 0, total: 0, percent: 0 },
        network: { rx: rxDelta, tx: txDelta },
        uptime: Math.floor(Number(time.uptime)),
        loadAvg: cpuLoad.avgLoad
          ? [cpuLoad.avgLoad, cpuLoad.avgLoad, cpuLoad.avgLoad]
          : [0, 0, 0],
        temps: {
          cpu: cpuTemp.main ?? null,
          cores: (cpuTemp.cores ?? []).filter((t: number) => t > 0),
          max: cpuTemp.max ?? null,
        },
      }

      io.emit('stats', stats)
    } catch (err) {
      console.error('Stats emitter error:', err)
    }
  }, 2000)
}
