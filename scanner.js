import { 
  getAttendeesFromFirebase, 
  updateCheckInFirebase, 
  subscribeAttendeesFromFirebase 
} from "./firebaseService.js";

let html5QrCode = null;
let isScanning = false;
let audioCtx = null;

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Initial Load dari Firestore / Cache
  initStatsAndTable();
  initScannerControls();
  initManualSearch();
  initExportCSV();

  // 2. Real-Time Sync: Otomatis terupdate saat peserta baru mendaftar atau panitia lain scan
  subscribeAttendeesFromFirebase((liveAttendees) => {
    const searchVal = document.getElementById('manual-search-input') ? document.getElementById('manual-search-input').value : '';
    initStatsAndTable(searchVal);
  });
});

/* ================= 1. AUDIO FEEDBACK (SYNTHESIZER) ================= */
function playSound(type = 'success') {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    if (type === 'success') {
      // Pleasant Two-tone Ascending Chime (C5 -> E5 -> G5)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.1); // E5
      osc.frequency.setValueAtTime(783.99, now + 0.2); // G5
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.5);
    } else if (type === 'duplicate') {
      // Warning double beep
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(349.23, now + 0.15);
      gain.gain.setValueAtTime(0.4, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
    } else {
      // Low Error Buzz
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200, now);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.start(now);
      osc.stop(now + 0.4);
    }
  } catch (e) {
    console.log('Audio playback error:', e);
  }
}

/* ================= 2. DATA STORAGE & STATS ================= */
function getAttendees() {
  const data = localStorage.getItem('solid_ground_attendees');
  if (!data) {
    // Seed with a few mock attendees if empty for easy demo/testing
    const mockData = [
      {
        ticketId: 'SG-PTR-001',
        fullname: 'Jonathan Christopher',
        jurusan: 'Informatika',
        campus: 'Universitas Kristen Petra',
        year: '2024',
        instagram: '@jonathan.chris',
        whatsapp: '081234567891',
        confirmation: 'Pasti datang dong! 🔥',
        registeredAt: new Date(Date.now() - 3600000).toISOString(),
        checkedIn: false,
        checkedInAt: null
      },
      {
        ticketId: 'SG-PTR-002',
        fullname: 'Stefani Grace',
        jurusan: 'Desain Komunikasi Visual (DKV)',
        campus: 'Universitas Kristen Petra',
        year: '2024',
        instagram: '@stefanigrace',
        whatsapp: '081234567892',
        confirmation: 'Gas pol, ga sabar ketemu teman-teman! 🎉',
        registeredAt: new Date(Date.now() - 7200000).toISOString(),
        checkedIn: false,
        checkedInAt: null
      }
    ];
    localStorage.setItem('solid_ground_attendees', JSON.stringify(mockData));
    return mockData;
  }
  return JSON.parse(data);
}

function saveAttendees(list) {
  localStorage.setItem('solid_ground_attendees', JSON.stringify(list));
}

function initStatsAndTable(filterQuery = '') {
  const list = getAttendees();
  const total = list.length;
  const checked = list.filter(a => a.checkedIn).length;
  const pending = total - checked;

  document.getElementById('stat-total').textContent = total;
  document.getElementById('stat-checked').textContent = checked;
  document.getElementById('stat-pending').textContent = pending;

  renderAttendeeTable(list, filterQuery);
}

function renderAttendeeTable(list, filterQuery = '') {
  const tbody = document.getElementById('attendee-table-body');
  if (!tbody) return;

  const query = filterQuery.toLowerCase().trim();
  const filtered = list.filter(a => 
    a.fullname.toLowerCase().includes(query) ||
    a.ticketId.toLowerCase().includes(query) ||
    (a.whatsapp && a.whatsapp.includes(query)) ||
    (a.jurusan && a.jurusan.toLowerCase().includes(query)) ||
    (a.instagram && a.instagram.toLowerCase().includes(query)) ||
    (a.campus && a.campus.toLowerCase().includes(query))
  );

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; color: var(--color-cream-dim); padding: 20px;">
          Belum ada data peserta yang cocok.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered.map(a => `
    <tr>
      <td style="font-family: monospace; font-weight: 700; color: var(--color-cream);">${a.ticketId}</td>
      <td>
        <strong style="color: var(--color-cream);">${escapeHtml(a.fullname)}</strong>
        <div style="font-size: 0.72rem; color: var(--color-cream-dim);">
          📸 ${escapeHtml(a.instagram || '-')} • 📱 ${escapeHtml(a.whatsapp || '')}
        </div>
      </td>
      <td style="font-size: 0.8rem; color: var(--color-cream-dim);">
        <div>${escapeHtml(a.jurusan || '-')}</div>
        <div style="font-size: 0.7rem; opacity: 0.8;">${escapeHtml(a.campus || 'Petra')} • Angkatan ${escapeHtml(a.year || '-')}</div>
      </td>
      <td>
        <span class="status-badge ${a.checkedIn ? 'checked-in' : 'pending'}">
          ${a.checkedIn ? 'Hadir ✅' : 'Belum'}
        </span>
      </td>
      <td>
        <button 
          type="button" 
          onclick="toggleCheckIn('${a.ticketId}')" 
          style="background: ${a.checkedIn ? 'rgba(211, 47, 47, 0.2)' : 'rgba(76, 175, 80, 0.3)'}; border: 1px solid ${a.checkedIn ? '#d32f2f' : '#4caf50'}; color: var(--color-cream); border-radius: 4px; padding: 4px 8px; font-size: 0.72rem; cursor: pointer;"
        >
          ${a.checkedIn ? 'Batalkan' : 'Check-In'}
        </button>
      </td>
    </tr>
  `).join('');
}

function formatDateTime(date = new Date()) {
  const d = new Date(date);
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

window.toggleCheckIn = async function(ticketId) {
  const list = getAttendees();
  const attendee = list.find(a => a.ticketId === ticketId);
  if (!attendee) return;

  attendee.checkedIn = !attendee.checkedIn;
  attendee.checkedInAt = attendee.checkedIn ? formatDateTime(new Date()) : null;

  saveAttendees(list);
  initStatsAndTable(document.getElementById('manual-search-input').value);

  // Sync ke Firebase Firestore
  await updateCheckInFirebase(attendee.ticketId, attendee.checkedIn, attendee.checkedInAt);

  if (attendee.checkedIn) {
    playSound('success');
    showResultBanner('success', `Check-In Berhasil: ${attendee.fullname}`, `${attendee.jurusan || ''} (${attendee.ticketId})`, `Waktu: ${attendee.checkedInAt}`);
  } else {
    showResultBanner('warning', `Status Dibatalkan: ${attendee.fullname}`, 'Status diubah menjadi Belum Hadir');
  }
};

/* ================= 3. SCANNER ENGINE (HTML5-QRCODE) ================= */
function initScannerControls() {
  const startBtn = document.getElementById('start-scan-btn');
  const stopBtn = document.getElementById('stop-scan-btn');

  if (startBtn) {
    startBtn.addEventListener('click', () => {
      startCameraScanner();
    });
  }

  if (stopBtn) {
    stopBtn.addEventListener('click', () => {
      stopCameraScanner();
    });
  }
}

function startCameraScanner() {
  if (typeof Html5Qrcode === 'undefined') {
    alert('Library kamera scanner belum siap.');
    return;
  }

  html5QrCode = new Html5Qrcode('reader');
  const config = { fps: 10, qrbox: { width: 220, height: 220 } };

  html5QrCode.start(
    { facingMode: 'environment' },
    config,
    onQrScanSuccess,
    onQrScanError
  ).then(() => {
    isScanning = true;
    document.getElementById('start-scan-btn').style.display = 'none';
    document.getElementById('stop-scan-btn').style.display = 'inline-flex';
  }).catch(err => {
    console.warn('Gagal membuka kamera:', err);
    // Fallback info for demo / local tests
    alert('Kamera tidak dapat diakses langsung. Anda tetap dapat melakukan check-in via kotak pencarian manual di bawah.');
  });
}

function stopCameraScanner() {
  if (html5QrCode && isScanning) {
    html5QrCode.stop().then(() => {
      isScanning = false;
      document.getElementById('start-scan-btn').style.display = 'inline-flex';
      document.getElementById('stop-scan-btn').style.display = 'none';
    }).catch(console.error);
  }
}

let lastScanTime = 0;
let lastScannedCode = '';

function onQrScanSuccess(decodedText, decodedResult) {
  const now = Date.now();
  // Prevent duplicate trigger within 2 seconds
  if (now - lastScanTime < 2000 && lastScannedCode === decodedText) {
    return;
  }
  lastScanTime = now;
  lastScannedCode = decodedText;

  let ticketId = decodedText;
  try {
    const parsed = JSON.parse(decodedText);
    if (parsed.id) {
      ticketId = parsed.id;
    }
  } catch (e) {
    // Plain text ID fallback
  }

  processScannedTicket(ticketId);
}

function onQrScanError(errorMessage) {
  // Ignored continuous frame scan error
}

async function processScannedTicket(ticketId) {
  const list = getAttendees();
  const attendee = list.find(a => a.ticketId.toUpperCase() === ticketId.toUpperCase());

  if (!attendee) {
    playSound('error');
    showResultBanner('error', '❌ Tiket Tidak Dikenal', `Kode: ${ticketId} tidak terdaftar di sistem.`);
    return;
  }

  if (attendee.checkedIn) {
    playSound('duplicate');
    showResultBanner(
      'duplicate',
      `⚠️ SUDAH CHECK-IN`,
      `${attendee.fullname} (${attendee.jurusan || ''}) sudah check-in pada pukul ${attendee.checkedInAt || 'sebelumnya'}.`
    );
    return;
  }

  // Valid Check-In
  attendee.checkedIn = true;
  attendee.checkedInAt = formatDateTime(new Date());
  saveAttendees(list);
  initStatsAndTable();

  // Sync real-time ke Firebase Firestore
  await updateCheckInFirebase(attendee.ticketId, attendee.checkedIn, attendee.checkedInAt);

  playSound('success');
  showResultBanner(
    'success',
    `✅ SELAMAT DATANG!`,
    `${attendee.fullname} • ${attendee.jurusan || ''} (${attendee.campus || 'Petra'})`,
    `Check-in tercatat: ${attendee.checkedInAt}`
  );
}

function showResultBanner(type, title, details, timeText = '') {
  const banner = document.getElementById('scan-result-card');
  const titleEl = document.getElementById('scan-result-title');
  const detailsEl = document.getElementById('scan-result-details');
  const timeEl = document.getElementById('scan-result-time');

  if (!banner) return;

  if (type === 'success') {
    banner.style.background = 'rgba(46, 125, 50, 0.9)';
    banner.style.color = '#ffffff';
    banner.style.border = '1.5px solid #81c784';
  } else if (type === 'duplicate') {
    banner.style.background = 'rgba(237, 108, 2, 0.9)';
    banner.style.color = '#ffffff';
    banner.style.border = '1.5px solid #ffb74d';
  } else {
    banner.style.background = 'rgba(211, 47, 47, 0.9)';
    banner.style.color = '#ffffff';
    banner.style.border = '1.5px solid #e57373';
  }

  titleEl.textContent = title;
  detailsEl.textContent = details;
  timeEl.textContent = timeText;
  banner.style.display = 'block';

  setTimeout(() => {
    banner.style.display = 'none';
  }, 6000);
}

/* ================= 4. MANUAL SEARCH FILTER ================= */
function initManualSearch() {
  const input = document.getElementById('manual-search-input');
  if (!input) return;

  input.addEventListener('input', (e) => {
    initStatsAndTable(e.target.value);
  });
}

/* ================= 5. EXPORT CSV ================= */
function initExportCSV() {
  const exportBtn = document.getElementById('export-csv-btn');
  if (!exportBtn) return;

  exportBtn.addEventListener('click', () => {
    const list = getAttendees();
    if (list.length === 0) {
      alert('Belum ada data pendaftar.');
      return;
    }

    const headers = [
      'Ticket ID', 
      'Nama', 
      'Jurusan', 
      'Kuliah Dimana', 
      'Tahun Masuk', 
      'Instagram', 
      'No Telepon/WA', 
      'Konfirmasi Hadir 11 Sept', 
      'Waktu Daftar',
      'Status Kehadiran', 
      'Waktu Check-In'
    ];
    const rows = list.map(a => [
      `"${a.ticketId}"`,
      `"${a.fullname}"`,
      `"${a.jurusan || ''}"`,
      `"${a.campus || ''}"`,
      `"${a.year || ''}"`,
      `"${a.instagram || ''}"`,
      `"${a.whatsapp || ''}"`,
      `"${a.confirmation || ''}"`,
      `"${a.registeredAt || '-'}"`,
      `"${a.checkedIn ? 'Hadir' : 'Belum Hadir'}"`,
      `"${a.checkedInAt || '-'}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Rekap-Kehadiran-StandingFirm-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[m]);
}
