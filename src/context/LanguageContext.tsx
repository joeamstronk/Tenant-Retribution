import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { UserRole } from '../types';

export type Language = 'id' | 'en';

export const APP_LOGO_PATH =
  `${import.meta.env.BASE_URL}assets/aistudio/Jakarta_Province_Emblem_-_Colored_-_zonalogo.com_274ea80b.svg`;

const LANG_STORAGE_KEY = 'meridian_lang';

const translations = {
  id: {
    brandName: 'Tenant Retribution',
    headerTagline: 'Portal Sewa & Operasional Gedung · 16 Unit · Lantai 1–4',
    langSwitchLabel: 'Bahasa',
    common: {
      loadingWorkspace: 'Memuat ruang kerja Meridian House...',
      signOut: 'Keluar',
      cancel: 'Batal',
      save: 'Simpan',
      close: 'Tutup',
      download: 'Unduh',
      preview: 'Pratinjau',
      verified: 'Terverifikasi',
      unverified: 'Belum Diverifikasi',
      pending: 'Menunggu',
      all: 'Semua',
      unit: 'Unit',
      floor: 'Lantai',
      status: 'Status',
      action: 'Aksi',
      actions: 'Aksi',
      notes: 'Catatan',
      search: 'Cari...',
      noData: 'Tidak ada data.',
      unassigned: 'Belum Ditugaskan',
      file: 'Berkas',
      perMonth: '/bln',
    },
    roles: {
      landlord: 'Pemilik / Pengelola',
      finance: 'Keuangan',
      security: 'Keamanan',
      maintenance: 'Pemeliharaan',
      tenant: 'Penyewa',
    },
    statuses: {
      Occupied: 'Terisi',
      Vacant: 'Kosong',
      Maintenance: 'Perbaikan',
      Paid: 'Lunas',
      Upcoming: 'Akan Datang',
      Overdue: 'Menunggak',
      Open: 'Terbuka',
      'In Progress': 'Diproses',
      Resolved: 'Selesai',
      Active: 'Aktif',
      Inactive: 'Nonaktif',
      'Expiring Soon': 'Segera Berakhir',
      Ended: 'Berakhir',
      'Checked In': 'Masuk',
      'Checked Out': 'Keluar',
      Flagged: 'Ditandai',
      Low: 'Rendah',
      Medium: 'Sedang',
      High: 'Tinggi',
      Urgent: 'Mendesak',
    } as Record<string, string>,
    categories: {
      Plumbing: 'Pipa & Air',
      Electrical: 'Kelistrikan',
      HVAC: 'AC & Ventilasi',
      'Access/Lock': 'Akses & Kunci',
      Structural: 'Struktural',
      'Lease Agreement': 'Perjanjian Sewa',
      'ID Verification': 'Verifikasi Identitas',
      Inspection: 'Inspeksi Unit',
      Receipt: 'Kuitansi',
      Visitor: 'Tamu',
      Delivery: 'Pengiriman',
      Incident: 'Insiden',
      Patrol: 'Patroli',
    } as Record<string, string>,
    nav: {
      dashboard: 'Dasbor',
      users: 'Penyewa & Kontrak',
      finance: 'Keuangan & Sewa',
      security: 'Keamanan & Akses',
      maintenance: 'Pemeliharaan & Peta',
      tenant: 'Portal Penyewa',
      chat: 'Saluran Aman',
      settings: 'Pengaturan',
    },
    login: {
      kicker: 'Akses Operasional Properti',
      title: 'Masuk ke Tenant Retribusi',
      subtitle:
        'Masukkan kredensial gedung Anda. Peran akun—Pemilik, Keuangan, Keamanan, Pemeliharaan, atau Penyewa—akan terdeteksi otomatis saat masuk.',
      emailLabel: 'Email Kerja atau Penghuni',
      detectedAccount: 'Akun terdeteksi',
      passwordLabel: 'Kata Sandi',
      passwordPlaceholder: 'Masukkan kata sandi',
      showPassword: 'Tampilkan kata sandi',
      hidePassword: 'Sembunyikan kata sandi',
      submit: 'Masuk',
      submitting: 'Memverifikasi Kredensial...',
      demoTitle: 'Direktori Demo (Deteksi Peran Otomatis)',
      demoSignIn: 'Masuk',
      buildingScope: 'Cakupan Gedung',
      buildingScopeVal: '16 Unit Bernomor',
      floorLevels: 'Tingkat Denah',
      floorLevelsVal: 'Dasar + Lantai 1–4',
      roleChannels: 'Saluran Peran',
      roleChannelsVal: '5 Cakupan Akses',
      demoSubtitles: {
        landlord: 'Pemilik Gedung · Portofolio Lengkap & Admin Pengguna',
        finance: 'Petugas Keuangan · Buku Besar Sewa & Kuitansi',
        security: 'Kepala Keamanan · Kartu Akses, Tamu & Insiden',
        maintenance: 'Teknisi Utama · Tiket Denah & Perbaikan',
        tenant: 'Penghuni Unit 302 · Peta Pemeliharaan & Obrolan',
      } as Record<string, string>,
    },
    dashboard: {
      title: 'Ringkasan Operasional Gedung',
      subtitle:
        'Meridian House · Ringkasan real-time unit aktif, jadwal sewa, dan antrean pemeliharaan',
      inspectMap: 'Lihat Peta Denah',
      manageUsers: 'Kelola Penyewa & Kontrak',
      activeUnits: 'Unit Terisi Aktif',
      occupancyOf: 'tingkat hunian di 4 lantai',
      collectedCycle: 'Terkumpul Periode Ini',
      settledInvoices: 'Faktur lunas terverifikasi',
      upcomingOverdue: 'Sewa Akan Datang & Menunggak',
      currentlyOverdue: 'sedang menunggak',
      zeroOverdue: 'Tidak ada tunggakan',
      openMaintenance: 'Pemeliharaan Tertunda',
      highUrgentPriority: 'prioritas tinggi / mendesak',
      paymentsTitle: 'Pembayaran Mendatang & Menunggak',
      paymentsSubtitle: 'Piutang sewa prioritas yang memerlukan tindak lanjut',
      openLedger: 'Buka Buku Besar',
      allSettled: 'Seluruh pembayaran sewa periode ini telah lunas.',
      colUnit: 'Unit',
      colTenant: 'Penyewa',
      colDueDate: 'Jatuh Tempo',
      colAmount: 'Jumlah',
      colStatus: 'Status',
      colAction: 'Aksi',
      markPaid: 'Tandai Lunas',
      maintTitle: 'Pemeliharaan Belum Selesai',
      maintSubtitle: 'Perintah kerja aktif yang tertaut ke pin denah',
      allTickets: 'Semua Tiket',
      noTickets: 'Tidak ada laporan pemeliharaan yang tertunda.',
      mapBtn: 'Peta',
      occupancyTitle: 'Direktori Hunian Unit',
      occupancySubtitle:
        '16 unit bernomor di Lantai 1–4 · Klik unit untuk memeriksa lokasi pada denah',
      availableLease: 'Tersedia untuk Disewa',
    },
    users: {
      title: 'Pengguna, Kontrak & Brankas Dokumen',
      subtitle:
        'Kelola profil penyewa, masa kontrak sewa, dokumen terverifikasi, dan hak akses staf gedung',
      uploadDoc: 'Unggah Dokumen',
      addUser: 'Tambah Pengguna / Penyewa',
      tabTenants: 'Profil Penyewa & Kontrak',
      tabDocs: 'Brankas Dokumen',
      tabStaff: 'Staf & Akses Peran',
      searchPlaceholder: 'Cari unit, nama, atau berkas...',
      colProfile: 'Profil Penyewa',
      colLeaseTerm: 'Masa Kontrak',
      colMonthlyRent: 'Sewa Bulanan',
      colBadge: 'Kartu Keamanan',
      colDetails: 'Detail',
      verifiedAccess: 'Akses Terverifikasi',
      pendingClearance: 'Menunggu Verifikasi',
      noLease: 'Belum ada kontrak aktif',
      inspectProfile: 'Lihat Profil',
      noDocs: 'Tidak ada dokumen penyewa yang sesuai pencarian.',
      uploadedOn: 'Diunggah',
      secVerified: 'Terverifikasi Keamanan',
      awaitingVerify: 'Menunggu Verifikasi',
      verifyBtn: 'Verifikasi',
      staffMember: 'Anggota Staf',
      emailPhone: 'Email & Telepon',
      badgeId: 'ID Kartu',
      roleScope: 'Cakupan Peran',
      accessControl: 'Kontrol Akses',
      deactivate: 'Nonaktifkan',
      reactivate: 'Aktifkan Kembali',
      email: 'Email',
      phone: 'Telepon',
      leasePeriod: 'Periode Kontrak',
      rentDeposit: 'Sewa / Deposit',
      onFileDocs: 'Dokumen Tersimpan',
      attachFile: 'Lampirkan Berkas',
      noTenantDocs: 'Belum ada dokumen yang diunggah untuk penyewa ini.',
      view: 'Lihat',
      downloadFile: 'Unduh Berkas',
      createUserTitle: 'Tambah Profil Pengguna atau Penyewa',
      fullName: 'Nama Lengkap',
      role: 'Peran',
      assignedUnit: 'Unit Ditugaskan',
      selectUnit: 'Pilih unit...',
      initialPassword: 'Kata Sandi Awal',
      passwordDefaultHint: 'Default: meridian2026',
      createAccount: 'Buat Akun',
      uploadTitle: 'Unggah Dokumen Penyewa',
      tenantLabel: 'Penyewa',
      selectTenant: 'Pilih penyewa...',
      categoryLabel: 'Kategori',
      docTitleLabel: 'Judul Dokumen',
      attachmentLabel: 'Lampiran (PDF, Gambar, atau Teks)',
      saveToVault: 'Simpan ke Brankas',
      binaryPreviewHint: 'Dokumen biner terlampir — gunakan Unduh untuk membuka secara lokal.',
      badgeLabel: 'Kartu',
    },
    finance: {
      title: 'Keuangan & Buku Besar Sewa',
      subtitle:
        'Verifikasi transfer sewa masuk, pantau faktur menunggak, dan terbitkan kuitansi pembayaran',
      exportCsv: 'Ekspor CSV',
      newInvoice: 'Faktur / Pembayaran Baru',
      collected: 'Sewa Terkumpul',
      upcoming: 'Jadwal Akan Datang',
      overdue: 'Piutang Menunggak',
      collectionRate: 'Rasio Penagihan',
      searchPlaceholder: 'Cari unit, penyewa, atau faktur...',
      colInvoice: 'Faktur',
      colMethod: 'Metode',
      confirmPaid: 'Konfirmasi Lunas',
      receipt: 'Kuitansi',
      modalTitle: 'Catat Faktur atau Pembayaran Sewa',
      leaseUnit: 'Kontrak / Unit',
      selectLease: 'Pilih kontrak unit...',
      amountUsd: 'Jumlah',
      dueDate: 'Jatuh Tempo',
      methodLabel: 'Metode',
      saveEntry: 'Simpan Catatan',
      statementTitle: 'Laporan Pembayaran Meridian House',
      resident: 'Penghuni',
      totalAmount: 'Total Jumlah',
      closeStatement: 'Tutup Laporan',
      optionalNote: 'Catatan referensi opsional',
      methods: {
        'ACH Transfer': 'Transfer ACH',
        'Wire Transfer': 'Transfer Bank',
        'Auto-Debit': 'Autodebit',
        Check: 'Cek',
      } as Record<string, string>,
    },
    security: {
      title: 'Keamanan & Kontrol Akses Penyewa',
      subtitle:
        'Verifikasi izin kartu akses penyewa, pantau tamu & pengiriman lobi, serta catat insiden',
      secureChannels: 'Saluran Aman',
      logBtn: 'Catat Tamu / Insiden',
      verifiedBadges: 'Kartu Penghuni Terverifikasi',
      visitorsIn: 'Tamu Sedang Berkunjung',
      flaggedIncidents: 'Insiden Keamanan Ditandai',
      rosterTitle: 'Daftar Izin Keamanan Penyewa',
      rosterSubtitle: 'Konfirmasi kartu akses dan verifikasi identitas tiap unit',
      pendingCheck: 'Perlu Pemeriksaan',
      logTitle: 'Log Akses, Tamu & Insiden',
      logSubtitle: 'Aliran masuk gedung langsung dan pemantauan patroli',
      commonArea: 'Area Umum',
      checkOutVisitor: 'Catat Tamu Keluar',
      resolveIncident: 'Tandai Insiden Selesai',
      modalTitle: 'Catatan Keamanan Baru',
      entryType: 'Jenis Catatan',
      unitZone: 'Unit / Zona',
      commonLobby: 'Area Umum / Lobi',
      subjectLabel: 'Nama Tamu atau Subjek Insiden',
      passCode: 'Kode Kartu Sementara / Referensi',
      saveEntry: 'Simpan Catatan',
      subjectPlaceholder: 'Nama tamu atau ringkasan insiden',
      notesPlaceholder: 'Detail otorisasi atau hasil pengamatan patroli...',
      badgePrefix: 'Kartu',
    },
    floorplan: {
      groundLobby: 'Dasar & Lobi',
      floorPrefix: 'Lantai',
      pinNew: 'Tandai Masalah Baru di Peta',
      pinActive: 'Klik Denah untuk Meletakkan Pin',
      legendUrgent: 'Mendesak / Tinggi',
      legendProgress: 'Diproses',
      legendOpen: 'Terbuka Standar',
      legendResolved: 'Selesai',
      hintPin: 'Klik ruangan atau koridor mana saja pada denah untuk menaruh pin',
      hintInspect: 'Pilih pin mana saja untuk melihat catatan perbaikan dan status',
      elevator: 'LIFT',
      coreStairs: 'INTI · TANGGA',
      westCorridor: 'KORIDOR BARAT',
      eastCorridor: 'KORIDOR TIMUR',
      commonInfra: 'Infrastruktur Umum Gedung',
    },
    maintenance: {
      title: 'Pemeliharaan & Perintah Kerja Denah',
      subtitle:
        'Periksa pin gedung di Lantai Dasar dan Lantai 1–4, perbarui status perbaikan, dan catat penyelesaian',
      dispatchChat: 'Obrolan Tim Pemeliharaan',
      reportedBy: 'Dilaporkan oleh',
      resolutionLabel: 'Catatan Penyelesaian Teknisi',
      resolutionPlaceholder: 'Tambahkan suku cadang, hasil inspeksi, atau jadwal...',
      saveNote: 'Simpan Catatan',
      queueTitle: 'Antrean Perintah Kerja',
      emptyQueue: 'Tidak ada perintah kerja sesuai filter.',
      createModalTitle: 'Buat Pin Pemeliharaan Denah',
      coordsLabel: 'Koordinat',
      categoryLabel: 'Kategori',
      priorityLabel: 'Prioritas',
      issueSummary: 'Ringkasan Masalah',
      issuePlaceholder: 'Judul singkat masalah',
      descriptionLabel: 'Deskripsi',
      descPlaceholder: 'Jelaskan perbaikan yang dibutuhkan di titik ini...',
      submitPin: 'Kirim Pin Pemeliharaan',
    },
    tenant: {
      title: 'Portal Penyewa',
      subtitle:
        'Tandai masalah pemeliharaan langsung pada denah gedung dan hubungi tim gedung secara langsung',
      uploadUnitDoc: 'Unggah Dokumen Unit',
      activeLease: 'Kontrak Aktif',
      unitOverview: 'Ringkasan Unit',
      termEnds: 'Berakhir pada',
      viewingBuilding: 'Melihat seluruh gedung',
      rentStatus: 'Status Akun Sewa',
      allSettled: 'Semua Lunas',
      dueOn: 'Jatuh tempo',
      noPendingBalance: 'Tidak ada tagihan tertunda',
      activePins: 'Pin Pemeliharaan Aktif Anda',
      clickFloorplanHint: 'Klik titik mana saja di denah untuk melapor',
      techUpdate: 'Pembaruan Teknisi',
      unitDocs: 'Dokumen Unit',
      noDocsYet: 'Belum ada dokumen unit yang diunggah.',
      directChatTitle: 'Obrolan Langsung Gedung',
      liveConnected: 'Terhubung Langsung',
      noMessages: 'Belum ada pesan di saluran ini. Mulai percakapan di bawah.',
      msgPlaceholder: 'Tulis pesan langsung...',
      send: 'Kirim',
      reportPinTitle: 'Laporkan Masalah pada Pin',
      urgencyLabel: 'Tingkat Mendesak',
      issueTitleLabel: 'Judul Masalah',
      issueTitlePlaceholder: 'mis. Keran kamar mandi bocor',
      detailsLabel: 'Detail',
      detailsPlaceholder: 'Jelaskan masalah pemeliharaan...',
      dispatchBtn: 'Kirim ke Pemeliharaan',
      uploadModalTitle: 'Unggah Dokumen ke Brankas Unit',
      uploadBtn: 'Unggah',
    },
    chat: {
      title: 'Saluran Komunikasi Aman',
      subtitle:
        'Pesan real-time terverifikasi peran antara Pemilik, Keuangan, Keamanan, Pemeliharaan, dan Penyewa',
      authorizedChannels: 'Saluran Terotorisasi',
      accessLabel: 'Akses',
      wsLive: 'WebSocket Aktif',
      noMessages: 'Belum ada pesan di saluran ini. Kirim pembaruan pertama di bawah.',
      msgPlaceholder: 'Kirim pesan ke',
      sendBtn: 'Kirim Pesan',
      selectChannel: 'Pilih saluran komunikasi untuk memulai.',
    },
    settings: {
      title: 'Pengaturan Mata Uang & Preferensi',
      subtitle:
        'Atur mata uang utama, kurs konversi dari nilai dasar gedung, dan format tampilan angka di seluruh portal',
      currencySectionTitle: 'Mata Uang Aktif Gedung',
      currencySectionSubtitle:
        'Mata uang default sistem adalah IDR (Rupiah Indonesia). Perubahan langsung berlaku di Dasbor, Keuangan, Kontrak, dan Portal Penyewa.',
      defaultBadge: 'Default',
      activeBadge: 'Aktif',
      ratesTitle: 'Konfigurasi Kurs Konversi',
      ratesSubtitle:
        'Nilai dasar unit dan faktur disimpan dalam USD dan dikonversi secara otomatis ke mata uang aktif pilihan Anda.',
      baseUnitLabel: '1 USD =',
      decimalsLabel: 'Tampilkan dua angka desimal (sen)',
      decimalsHint: 'Contoh: Rp 39.200.000,00 atau $2,450.00',
      previewTitle: 'Pratinjau Format Langsung',
      previewSubtitle: 'Simulasi tampilan nominal pada tagihan sewa & kontrak unit',
      previewRentLabel: 'Sewa Bulanan Unit 302',
      previewPenthouseLabel: 'Sewa Penthouse 404',
      previewDepositLabel: 'Deposit Keamanan Standar',
      saveBtn: 'Simpan Pengaturan Mata Uang',
      savingBtn: 'Menyimpan...',
      resetBtn: 'Reset ke Default (IDR)',
      savedToast: 'Pengaturan mata uang diperbarui ke',
      resetToast: 'Pengaturan mata uang dikembalikan ke default IDR',
    },
  },
  en: {
    brandName: 'Tenant Retribution',
    headerTagline: 'Building Rent & Operations Portal · 16 Units · Floors 1–4',
    langSwitchLabel: 'Language',
    common: {
      loadingWorkspace: 'Loading Meridian House workspace...',
      signOut: 'Sign Out',
      cancel: 'Cancel',
      save: 'Save',
      close: 'Close',
      download: 'Download',
      preview: 'Preview',
      verified: 'Verified',
      unverified: 'Unverified',
      pending: 'Pending',
      all: 'All',
      unit: 'Unit',
      floor: 'Floor',
      status: 'Status',
      action: 'Action',
      actions: 'Actions',
      notes: 'Notes',
      search: 'Search...',
      noData: 'No records found.',
      unassigned: 'Unassigned',
      file: 'File',
      perMonth: '/mo',
    },
    roles: {
      landlord: 'Landlord',
      finance: 'Finance',
      security: 'Security',
      maintenance: 'Maintenance',
      tenant: 'Tenant',
    },
    statuses: {
      Occupied: 'Occupied',
      Vacant: 'Vacant',
      Maintenance: 'Maintenance',
      Paid: 'Paid',
      Upcoming: 'Upcoming',
      Overdue: 'Overdue',
      Open: 'Open',
      'In Progress': 'In Progress',
      Resolved: 'Resolved',
      Active: 'Active',
      Inactive: 'Inactive',
      'Expiring Soon': 'Expiring Soon',
      Ended: 'Ended',
      'Checked In': 'Checked In',
      'Checked Out': 'Checked Out',
      Flagged: 'Flagged',
      Low: 'Low',
      Medium: 'Medium',
      High: 'High',
      Urgent: 'Urgent',
    } as Record<string, string>,
    categories: {
      Plumbing: 'Plumbing',
      Electrical: 'Electrical',
      HVAC: 'HVAC',
      'Access/Lock': 'Access/Lock',
      Structural: 'Structural',
      'Lease Agreement': 'Lease Agreement',
      'ID Verification': 'ID Verification',
      Inspection: 'Inspection',
      Receipt: 'Receipt',
      Visitor: 'Visitor',
      Delivery: 'Delivery',
      Incident: 'Incident',
      Patrol: 'Patrol',
    } as Record<string, string>,
    nav: {
      dashboard: 'Dashboard',
      users: 'Tenants & Leases',
      finance: 'Finance & Rent',
      security: 'Security & Access',
      maintenance: 'Maintenance & Map',
      tenant: 'Tenant Portal',
      chat: 'Secure Channels',
      settings: 'Settings',
    },
    login: {
      kicker: 'Property Operations Access',
      title: 'Sign in to Tenant Retribution',
      subtitle:
        'Enter your building credentials below. Your workspace role—Landlord, Finance, Security, Maintenance, or Tenant—is automatically detected upon sign-in.',
      emailLabel: 'Work or Resident Email',
      detectedAccount: 'Detected account',
      passwordLabel: 'Password',
      passwordPlaceholder: 'Enter your password',
      showPassword: 'Show password',
      hidePassword: 'Hide password',
      submit: 'Sign In',
      submitting: 'Verifying Credentials...',
      demoTitle: 'Demo Directory (Auto-Role Login)',
      demoSignIn: 'Sign in',
      buildingScope: 'Building Scope',
      buildingScopeVal: '16 Numbered Units',
      floorLevels: 'Floorplan Levels',
      floorLevelsVal: 'Ground + Floors 1–4',
      roleChannels: 'Role Channels',
      roleChannelsVal: '5 Access Scopes',
      demoSubtitles: {
        landlord: 'Building Owner · Full Portfolio & User Admin',
        finance: 'Finance Officer · Rent Ledger & Receipts',
        security: 'Head of Security · Badges, Visitors & Incidents',
        maintenance: 'Lead Engineer · Floorplan Tickets & Repairs',
        tenant: 'Resident Unit 302 · Floorplan Mapping & Chat',
      } as Record<string, string>,
    },
    dashboard: {
      title: 'Building Operations Overview',
      subtitle:
        'Meridian House · Real-time summary of active units, rent schedule, and maintenance queue',
      inspectMap: 'Inspect Floorplan Map',
      manageUsers: 'Manage Tenants & Leases',
      activeUnits: 'Active Occupied Units',
      occupancyOf: 'occupancy across 4 floors',
      collectedCycle: 'Collected This Cycle',
      settledInvoices: 'Verified settled invoices',
      upcomingOverdue: 'Upcoming & Overdue Rent',
      currentlyOverdue: 'currently overdue',
      zeroOverdue: 'Zero overdue balances',
      openMaintenance: 'Outstanding Maintenance',
      highUrgentPriority: 'high / urgent priority',
      paymentsTitle: 'Upcoming & Overdue Payments',
      paymentsSubtitle: 'Prioritized rent receivables requiring attention',
      openLedger: 'Open Ledger',
      allSettled: 'All scheduled rent payments for the current period are settled.',
      colUnit: 'Unit',
      colTenant: 'Tenant',
      colDueDate: 'Due Date',
      colAmount: 'Amount',
      colStatus: 'Status',
      colAction: 'Action',
      markPaid: 'Mark Paid',
      maintTitle: 'Outstanding Maintenance',
      maintSubtitle: 'Active work orders linked to floorplan pins',
      allTickets: 'All Tickets',
      noTickets: 'No outstanding maintenance issues reported.',
      mapBtn: 'Map',
      occupancyTitle: 'Unit Occupancy Directory',
      occupancySubtitle:
        '16 numbered units across Floors 1–4 · Click any unit to inspect floorplan location',
      availableLease: 'Available for Lease',
    },
    users: {
      title: 'Users, Leases & Document Vault',
      subtitle:
        'Manage tenant profiles, active lease agreements, verified documents, and building staff roles',
      uploadDoc: 'Upload Document',
      addUser: 'Add User / Tenant',
      tabTenants: 'Tenant Profiles & Leases',
      tabDocs: 'Document Vault',
      tabStaff: 'Staff & Role Access',
      searchPlaceholder: 'Search unit, name, or file...',
      colProfile: 'Tenant Profile',
      colLeaseTerm: 'Lease Term',
      colMonthlyRent: 'Monthly Rent',
      colBadge: 'Security Badge',
      colDetails: 'Details',
      verifiedAccess: 'Verified Access',
      pendingClearance: 'Pending Clearance',
      noLease: 'No active lease',
      inspectProfile: 'Inspect Profile',
      noDocs: 'No tenant documents match your filter.',
      uploadedOn: 'Uploaded',
      secVerified: 'Security Verified',
      awaitingVerify: 'Awaiting Verification',
      verifyBtn: 'Verify',
      staffMember: 'Staff Member',
      emailPhone: 'Email & Phone',
      badgeId: 'Badge ID',
      roleScope: 'Role Scope',
      accessControl: 'Access Control',
      deactivate: 'Deactivate',
      reactivate: 'Reactivate',
      email: 'Email',
      phone: 'Phone',
      leasePeriod: 'Lease Period',
      rentDeposit: 'Monthly Rent / Deposit',
      onFileDocs: 'On-File Documents',
      attachFile: 'Attach File',
      noTenantDocs: 'No documents uploaded yet for this tenant.',
      view: 'View',
      downloadFile: 'Download File',
      createUserTitle: 'Add User or Tenant Profile',
      fullName: 'Full Name',
      role: 'Role',
      assignedUnit: 'Assigned Unit',
      selectUnit: 'Select unit...',
      initialPassword: 'Initial Password',
      passwordDefaultHint: 'Defaults to meridian2026',
      createAccount: 'Create Account',
      uploadTitle: 'Upload Tenant Document',
      tenantLabel: 'Tenant',
      selectTenant: 'Select tenant...',
      categoryLabel: 'Category',
      docTitleLabel: 'Document Title',
      attachmentLabel: 'Attachment (PDF, Image, or Text)',
      saveToVault: 'Save to Vault',
      binaryPreviewHint: 'Binary document attached — use Download to open locally.',
      badgeLabel: 'Badge',
    },
    finance: {
      title: 'Finance & Rent Ledger',
      subtitle:
        'Verify incoming rent transfers, track overdue invoices, and issue tenant payment receipts',
      exportCsv: 'Export CSV',
      newInvoice: 'New Invoice / Payment',
      collected: 'Collected Rent',
      upcoming: 'Upcoming Scheduled',
      overdue: 'Overdue Receivables',
      collectionRate: 'Collection Progress',
      searchPlaceholder: 'Search unit, tenant, or invoice...',
      colInvoice: 'Invoice',
      colMethod: 'Method',
      confirmPaid: 'Confirm Paid',
      receipt: 'Receipt',
      modalTitle: 'Record Rent Invoice or Payment',
      leaseUnit: 'Lease / Unit',
      selectLease: 'Select unit lease...',
      amountUsd: 'Amount',
      dueDate: 'Due Date',
      methodLabel: 'Method',
      saveEntry: 'Save Entry',
      statementTitle: 'Meridian House Payment Statement',
      resident: 'Resident',
      totalAmount: 'Total Amount',
      closeStatement: 'Close Statement',
      optionalNote: 'Optional reference note',
      methods: {
        'ACH Transfer': 'ACH Transfer',
        'Wire Transfer': 'Wire Transfer',
        'Auto-Debit': 'Auto-Debit',
        Check: 'Check',
      } as Record<string, string>,
    },
    security: {
      title: 'Security & Tenant Access Control',
      subtitle:
        'Verify tenant keycard clearances, monitor lobby visitors & deliveries, and log incidents',
      secureChannels: 'Secure Channels',
      logBtn: 'Log Visitor / Incident',
      verifiedBadges: 'Verified Resident Badges',
      visitorsIn: 'Visitors Currently Checked In',
      flaggedIncidents: 'Flagged Security Incidents',
      rosterTitle: 'Tenant Security Clearance Roster',
      rosterSubtitle: 'Confirm keycard badges and identity verification per unit',
      pendingCheck: 'Pending Check',
      logTitle: 'Access, Visitor & Incident Log',
      logSubtitle: 'Live building entry feed and patrol incident tracking',
      commonArea: 'Common Area',
      checkOutVisitor: 'Check Out Visitor',
      resolveIncident: 'Mark Incident Resolved',
      modalTitle: 'New Security Entry',
      entryType: 'Entry Type',
      unitZone: 'Unit / Zone',
      commonLobby: 'Common Area / Lobby',
      subjectLabel: 'Visitor Name or Incident Subject',
      passCode: 'Temporary Pass / Reference Code',
      saveEntry: 'Save Entry',
      subjectPlaceholder: 'Guest name or incident summary',
      notesPlaceholder: 'Authorization details or patrol observations...',
      badgePrefix: 'Badge',
    },
    floorplan: {
      groundLobby: 'Ground & Lobby',
      floorPrefix: 'Floor',
      pinNew: 'Pin New Issue on Map',
      pinActive: 'Click Floorplan to Place Pin',
      legendUrgent: 'Urgent / High',
      legendProgress: 'In Progress',
      legendOpen: 'Open Standard',
      legendResolved: 'Resolved',
      hintPin: 'Click any room or corridor on the blueprint to drop a pin',
      hintInspect: 'Select any pin to view repair notes and status',
      elevator: 'ELEVATOR',
      coreStairs: 'CORE · STAIRS',
      westCorridor: 'WEST CORRIDOR',
      eastCorridor: 'EAST CORRIDOR',
      commonInfra: 'Common Building Infrastructure',
    },
    maintenance: {
      title: 'Maintenance & Floorplan Work Orders',
      subtitle:
        'Inspect spatial building pins across Ground and Floors 1–4, update repair status, and log resolutions',
      dispatchChat: 'Maintenance Dispatch Chat',
      reportedBy: 'Reported by',
      resolutionLabel: 'Technician Resolution Notes',
      resolutionPlaceholder: 'Add parts used, inspection findings, or schedule note...',
      saveNote: 'Save Note',
      queueTitle: 'Work Order Queue',
      emptyQueue: 'No work orders match the selected filter.',
      createModalTitle: 'Create Floorplan Maintenance Pin',
      coordsLabel: 'Coordinates',
      categoryLabel: 'Category',
      priorityLabel: 'Priority',
      issueSummary: 'Issue Summary',
      issuePlaceholder: 'Short title of the issue',
      descriptionLabel: 'Description',
      descPlaceholder: 'Describe what needs repair at this pin...',
      submitPin: 'Submit Maintenance Pin',
    },
    tenant: {
      title: 'Tenant Portal',
      subtitle:
        'Pin maintenance issues directly on the building floorplan and chat live with building teams',
      uploadUnitDoc: 'Upload Unit Document',
      activeLease: 'Active Lease',
      unitOverview: 'Unit Overview',
      termEnds: 'Term ends',
      viewingBuilding: 'Viewing full building',
      rentStatus: 'Rent Account Status',
      allSettled: 'All Settled',
      dueOn: 'Due',
      noPendingBalance: 'No pending balance',
      activePins: 'Your Active Maintenance Pins',
      clickFloorplanHint: 'Click anywhere on your floorplan to report',
      techUpdate: 'Technician Update',
      unitDocs: 'Unit Documents',
      noDocsYet: 'No unit documents uploaded yet.',
      directChatTitle: 'Direct Building Chat',
      liveConnected: 'Live Connected',
      noMessages: 'No messages yet in this channel. Start a conversation below.',
      msgPlaceholder: 'Write a direct message...',
      send: 'Send',
      reportPinTitle: 'Report Issue at Pin',
      urgencyLabel: 'Urgency',
      issueTitleLabel: 'Issue Title',
      issueTitlePlaceholder: 'e.g., Bathroom faucet leak',
      detailsLabel: 'Details',
      detailsPlaceholder: 'Describe the maintenance issue...',
      dispatchBtn: 'Dispatch to Maintenance',
      uploadModalTitle: 'Upload Document to Unit Vault',
      uploadBtn: 'Upload',
    },
    chat: {
      title: 'Secure Communication Channels',
      subtitle:
        'Role-verified real-time messaging across Landlord, Finance, Security, Maintenance, and Tenants',
      authorizedChannels: 'Authorized Channels',
      accessLabel: 'Access',
      wsLive: 'WebSocket Live',
      noMessages: 'No messages in this channel yet. Send the first update below.',
      msgPlaceholder: 'Message',
      sendBtn: 'Send Message',
      selectChannel: 'Select a communication channel to begin.',
    },
    settings: {
      title: 'Currency & Workspace Settings',
      subtitle:
        'Configure the active display currency, conversion rates from base unit values, and number formatting across the portal',
      currencySectionTitle: 'Active Building Currency',
      currencySectionSubtitle:
        'System default currency is IDR (Indonesian Rupiah). Changes apply immediately across Dashboard, Finance, Leases, and Tenant Portal.',
      defaultBadge: 'Default',
      activeBadge: 'Active',
      ratesTitle: 'Exchange Rate Configuration',
      ratesSubtitle:
        'Base unit rents and ledger entries are converted automatically to your active currency using these rates.',
      baseUnitLabel: '1 USD =',
      decimalsLabel: 'Show two decimal places',
      decimalsHint: 'Example: Rp 39.200.000,00 or $2,450.00',
      previewTitle: 'Live Formatting Preview',
      previewSubtitle: 'Simulated appearance across rent invoices and unit directories',
      previewRentLabel: 'Unit 302 Monthly Rent',
      previewPenthouseLabel: 'Penthouse 404 Monthly Rent',
      previewDepositLabel: 'Standard Security Deposit',
      saveBtn: 'Save Currency Settings',
      savingBtn: 'Saving...',
      resetBtn: 'Reset to Default (IDR)',
      savedToast: 'Currency settings updated to',
      resetToast: 'Currency settings reset to default IDR',
    },
  },
} as const;

export type TranslationDict = typeof translations.id;

interface LanguageContextValue {
  lang: Language;
  setLang: (lang: Language) => void;
  t: TranslationDict;
  roleLabel: (role: UserRole) => string;
  statusLabel: (status: string) => string;
  categoryLabel: (category: string) => string;
  formatLocalizedDate: (iso: string | null | undefined) => string;
  formatLocalizedDateTime: (iso: string | null | undefined) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>(() => {
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY);
      if (saved === 'en' || saved === 'id') return saved;
    } catch {
      // ignore storage errors
    }
    return 'id'; // Default language is Bahasa Indonesia
  });

  const setLang = useCallback((next: Language) => {
    setLangState(next);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      // ignore storage errors
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const t = translations[lang] as TranslationDict;

  const roleLabel = useCallback(
    (role: UserRole) => translations[lang].roles[role] ?? role,
    [lang]
  );

  const statusLabel = useCallback(
    (status: string) => translations[lang].statuses[status] ?? status,
    [lang]
  );

  const categoryLabel = useCallback(
    (category: string) => translations[lang].categories[category] ?? category,
    [lang]
  );

  const formatLocalizedDate = useCallback(
    (iso: string | null | undefined) => {
      if (!iso) return '—';
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return d.toLocaleDateString(lang === 'id' ? 'id-ID' : 'en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    },
    [lang]
  );

  const formatLocalizedDateTime = useCallback(
    (iso: string | null | undefined) => {
      if (!iso) return '—';
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return iso;
      return d.toLocaleString(lang === 'id' ? 'id-ID' : 'en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    },
    [lang]
  );

  return (
    <LanguageContext.Provider
      value={{
        lang,
        setLang,
        t,
        roleLabel,
        statusLabel,
        categoryLabel,
        formatLocalizedDate,
        formatLocalizedDateTime,
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage must be used inside LanguageProvider');
  return ctx;
}

export function LanguageSwitcher() {
  const { lang, setLang } = useLanguage();
  return (
    <div
      className="inline-flex items-center p-0.5 bg-slate-100 border border-slate-200 rounded-md shrink-0"
      role="group"
      aria-label="Language selector"
    >
      <button
        type="button"
        onClick={() => setLang('id')}
        className={`px-2 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
          lang === 'id' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        Bahasa
      </button>
      <button
        type="button"
        onClick={() => setLang('en')}
        className={`px-2 py-1 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
          lang === 'en' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
        }`}
      >
        English
      </button>
    </div>
  );
}
