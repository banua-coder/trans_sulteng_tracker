export type Locale = 'id' | 'en'

export const messages = {
  id: {
    brand: {
      name: 'cektrans',
      tagline: 'Pelacak realtime TransPalu & Trans Donggala',
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
    operating: {
      active: 'Bus beroperasi sekarang',
      sleeping: 'Bus belum beroperasi',
      window: 'Jam operasi 06.00–18.00 WITA',
      waiting: 'Menunggu data bus…',
      none: 'Tidak ada bus aktif',
    },
    bus: {
      plate: 'Pelat',
      corridor: 'Koridor',
      speed: 'Kecepatan',
      lastUpdate: 'Update terakhir',
      nextHalte: 'Halte berikutnya',
      passenger: 'Penumpang',
      pax: 'penumpang',
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
      tagline: 'Realtime tracker for TransPalu & Trans Donggala',
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
    operating: {
      active: 'Buses are running now',
      sleeping: 'Buses are not running yet',
      window: 'Service hours 06:00–18:00 WITA',
      waiting: 'Waiting for bus data…',
      none: 'No active buses',
    },
    bus: {
      plate: 'Plate',
      corridor: 'Corridor',
      speed: 'Speed',
      lastUpdate: 'Last update',
      nextHalte: 'Next stop',
      passenger: 'Passengers',
      pax: 'pax',
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
