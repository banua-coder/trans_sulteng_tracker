export type Locale = 'id' | 'en'

export const messages = {
  id: {
    brand: {
      name: 'cektrans',
      tagline: 'Lacak TransPalu & Trans Donggala langsung dari peta',
    },
    nav: {
      home: 'Beranda',
      palu: 'TransPalu',
      donggala: 'Trans Donggala',
    },
    status: {
      live: 'Langsung',
      stale: 'Tertunda',
      offline: 'Terputus',
      connecting: 'Menyambung…',
    },
    legend: {
      title: 'Keterangan',
      busLive: 'Bus aktif',
      busStale: 'Data > 5 menit',
      halte: 'Halte',
      corridor: 'Koridor',
    },
    stats: {
      avg: 'Rata-rata',
      viewers: 'Penonton',
      oldest: 'Update tertua',
    },
    share: {
      copy: 'Salin tautan',
      copied: 'Tersalin',
    },
    operating: {
      active: 'Bus beroperasi sekarang',
      sleeping: 'Bus belum beroperasi',
      window: 'Jam operasi 06.00–18.00 WITA',
      waiting: 'Menunggu data bus…',
      none: 'Tidak ada bus aktif',
      loading: 'Memuat data bus…',
    },
    bus: {
      plate: 'Pelat',
      corridor: 'Koridor',
      speed: 'Kecepatan',
      lastUpdate: 'Update terakhir',
      nextHalte: 'Halte berikutnya',
      passenger: 'Penumpang',
      pax: 'penumpang',
      listTitle: 'Bus aktif',
      search: 'Cari pelat, koridor, halte…',
      empty: 'Belum ada bus aktif',
      noMatch: 'Tidak ada bus yang cocok',
    },
    units: {
      kmh: 'km/jam',
      meters: 'm',
      kilometers: 'km',
      seconds: 'detik',
      minutes: 'menit',
      ago: 'lalu',
    },
    errors: {
      loadFailed: 'Gagal memuat data',
      retry: 'Coba lagi',
    },
    a11y: {
      toggleTheme: 'Ganti tema gelap/terang',
      toggleLang: 'Ganti bahasa',
    },
    footer: {
      data: 'Data BRT Nusantara · Kementerian Perhubungan',
      brand: 'Dibangun oleh Banuacoder',
    },
  },
  en: {
    brand: {
      name: 'cektrans',
      tagline: 'TransPalu & Trans Donggala — live on the map',
    },
    nav: {
      home: 'Home',
      palu: 'TransPalu',
      donggala: 'Trans Donggala',
    },
    status: {
      live: 'Live',
      stale: 'Stale',
      offline: 'Offline',
      connecting: 'Connecting…',
    },
    legend: {
      title: 'Legend',
      busLive: 'Live bus',
      busStale: 'Data > 5 min',
      halte: 'Stop',
      corridor: 'Corridor',
    },
    stats: {
      avg: 'Avg',
      viewers: 'Viewers',
      oldest: 'Oldest fix',
    },
    share: {
      copy: 'Copy link',
      copied: 'Copied',
    },
    operating: {
      active: 'Buses are running now',
      sleeping: 'Buses are not running yet',
      window: 'Service hours 06:00–18:00 WITA',
      waiting: 'Waiting for bus data…',
      none: 'No active buses',
      loading: 'Loading bus data…',
    },
    bus: {
      plate: 'Plate',
      corridor: 'Corridor',
      speed: 'Speed',
      lastUpdate: 'Last update',
      nextHalte: 'Next stop',
      passenger: 'Passengers',
      pax: 'pax',
      listTitle: 'Active buses',
      search: 'Search plate, corridor, stop…',
      empty: 'No active buses yet',
      noMatch: 'No matching buses',
    },
    units: {
      kmh: 'km/h',
      meters: 'm',
      kilometers: 'km',
      seconds: 'sec',
      minutes: 'min',
      ago: 'ago',
    },
    errors: {
      loadFailed: 'Failed to load data',
      retry: 'Retry',
    },
    a11y: {
      toggleTheme: 'Toggle dark/light theme',
      toggleLang: 'Toggle language',
    },
    footer: {
      data: 'Data: BRT Nusantara · Ministry of Transportation',
      brand: 'Built by Banuacoder',
    },
  },
} as const
