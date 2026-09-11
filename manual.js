import { 
  saveManualAttendeeToFirebase, 
  getManualAttendeesFromFirebase, 
  subscribeManualAttendeesFromFirebase 
} from "./firebaseService.js";

let audioCtx = null;

document.addEventListener('DOMContentLoaded', async () => {
  initParticleBackground();
  initCategoryToggle();
  initManualFormHandler();
  initRealtimeCounter();
});

/* ================= 1. AMBIENT PARTICLE BACKGROUND ================= */
function initParticleBackground() {
  const canvas = document.getElementById('particle-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  let particles = [];
  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  class Particle {
    constructor() {
      this.reset();
    }
    reset() {
      this.x = Math.random() * width;
      this.y = Math.random() * height;
      this.size = Math.random() * 2.2 + 0.8;
      this.speedY = -(Math.random() * 0.4 + 0.15);
      this.speedX = (Math.random() - 0.5) * 0.3;
      this.opacity = Math.random() * 0.6 + 0.2;
      this.pulseSpeed = Math.random() * 0.02 + 0.01;
    }
    update() {
      this.y += this.speedY;
      this.x += this.speedX;
      this.opacity += Math.sin(Date.now() * this.pulseSpeed * 0.1) * 0.01;

      if (this.y < -10 || this.x < -10 || this.x > width + 10) {
        this.reset();
        this.y = height + 5;
      }
    }
    draw() {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(244, 239, 230, ${Math.max(0.1, Math.min(0.8, this.opacity))})`;
      ctx.fill();
    }
  }

  for (let i = 0; i < 30; i++) {
    particles.push(new Particle());
  }

  function animate() {
    ctx.clearRect(0, 0, width, height);
    particles.forEach(p => {
      p.update();
      p.draw();
    });
    requestAnimationFrame(animate);
  }

  animate();
}

/* ================= 2. AUDIO FEEDBACK ================= */
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
      // Ascending Chime (C5 -> E5 -> G5)
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now);
      osc.frequency.setValueAtTime(659.25, now + 0.1);
      osc.frequency.setValueAtTime(783.99, now + 0.2);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.5);
    }
  } catch (e) {
    console.log('Audio playback error:', e);
  }
}

/* ================= 3. CATEGORY TOGGLE (MAHASISWA VS UMUM) ================= */
function initCategoryToggle() {
  const radioMahasiswa = document.getElementById('label-cat-mahasiswa');
  const radioUmum = document.getElementById('label-cat-umum');
  const studentFields = document.getElementById('student-fields-group');

  const campusInput = document.getElementById('input-manual-campus');
  const jurusanInput = document.getElementById('input-manual-jurusan');
  const whatsappInput = document.getElementById('input-manual-whatsapp');

  function setCategory(category) {
    if (category === 'Mahasiswa') {
      radioMahasiswa.classList.add('active');
      radioUmum.classList.remove('active');
      studentFields.style.display = 'block';

      campusInput.required = true;
      jurusanInput.required = true;
      whatsappInput.required = true;
    } else {
      radioMahasiswa.classList.remove('active');
      radioUmum.classList.add('active');
      studentFields.style.display = 'none';

      campusInput.required = false;
      jurusanInput.required = false;
      whatsappInput.required = false;
    }
  }

  radioMahasiswa.addEventListener('click', () => {
    radioMahasiswa.querySelector('input').checked = true;
    setCategory('Mahasiswa');
  });

  radioUmum.addEventListener('click', () => {
    radioUmum.querySelector('input').checked = true;
    setCategory('Umum');
  });
}

/* ================= 4. FORM HANDLER & FIRESTORE OTS SAVE ================= */
function initManualFormHandler() {
  const form = document.getElementById('manual-ots-form');
  const submitBtn = document.getElementById('submit-manual-btn');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>Menyimpan & Check-In...</span> <i class="bi bi-arrow-repeat"></i>';

    const formData = new FormData(form);
    const fullname = formData.get('fullname')?.trim() || '';
    const category = formData.get('category') || 'Mahasiswa';
    const campus = category === 'Mahasiswa' ? (formData.get('campus')?.trim() || '-') : 'Umum';
    const jurusan = category === 'Mahasiswa' ? (formData.get('jurusan')?.trim() || '-') : 'Umum';
    const rawWhatsapp = category === 'Mahasiswa' ? (formData.get('whatsapp')?.trim() || '-') : '-';
    const whatsappLink = category === 'Mahasiswa' ? formatWhatsAppLink(rawWhatsapp) : '-';

    // Generate Unique Ticket Code (e.g. SG-OTS-001)
    let existingManualList = [];
    try {
      existingManualList = await getManualAttendeesFromFirebase();
    } catch (err) {
      existingManualList = getLocalManualAttendees();
    }

    const sequenceNumber = (existingManualList.length + 1).toString().padStart(3, '0');
    const ticketId = `SG-OTS-${sequenceNumber}`;
    const timestamp = formatDateTime(new Date());

    const manualRecord = {
      ticketId,
      fullname,
      category,
      jurusan,
      campus,
      year: category === 'Mahasiswa' ? '2026' : '-',
      instagram: '-',
      whatsapp: whatsappLink,
      whatsappRaw: rawWhatsapp,
      source: 'OTS / Walk-In Hari-H',
      infoSource: 'OTS / Walk-In Hari-H',
      confirmation: 'Hadir di Tempat (OTS)',
      registeredAt: timestamp,
      checkedIn: true,
      checkedInAt: timestamp,
      isManualOTS: true
    };

    // 1. Simpan ke Firestore (collection manual_attendees) & Google Sheets (Data Manual)
    await saveManualAttendeeToFirebase(manualRecord);

    // 2. Update local storage cache
    const list = getLocalManualAttendees();
    list.push(manualRecord);
    localStorage.setItem('solid_ground_manual_attendees', JSON.stringify(list));

    // 3. Audio Chime & Confetti
    playSound('success');
    triggerConfetti();

    // 4. Toast Alert (Popup sementara)
    showToast(`Pendaftaran Berhasil! ${fullname} tercatat Hadir.`, '🎉');

    // 5. Reset form for next person in line
    form.reset();
    // Default back to Mahasiswa category
    document.getElementById('label-cat-mahasiswa').click();
    document.getElementById('input-manual-fullname').focus();

    submitBtn.disabled = false;
    submitBtn.innerHTML = '<span>SIMPAN & CHECK-IN HADIR</span> <i class="bi bi-check-circle-fill" style="font-size: 1.1rem;"></i>';
  });
}

function formatWhatsAppLink(phone) {
  if (!phone || phone === '-') return '-';
  let cleaned = String(phone).replace(/\D/g, '');
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.slice(1);
  } else if (cleaned.startsWith('8')) {
    cleaned = '62' + cleaned;
  }
  return cleaned ? `https://wa.me/${cleaned}` : phone;
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

function getLocalManualAttendees() {
  const data = localStorage.getItem('solid_ground_manual_attendees');
  return data ? JSON.parse(data) : [];
}

function triggerConfetti() {
  if (typeof confetti === 'function') {
    confetti({
      particleCount: 50,
      spread: 60,
      origin: { y: 0.5 }
    });
  }
}

/* ================= 5. REAL-TIME COUNTER ================= */
function initRealtimeCounter() {
  const countEl = document.getElementById('ots-count-val');
  if (!countEl) return;

  const localList = getLocalManualAttendees();
  countEl.textContent = localList.length;

  subscribeManualAttendeesFromFirebase((liveList) => {
    countEl.textContent = liveList.length;
  });
}

/* ================= 6. UTILITIES ================= */
function showToast(message, icon = '✅') {
  const toast = document.getElementById('toast-alert');
  const msgEl = document.getElementById('toast-message');
  const iconEl = document.getElementById('toast-icon');

  if (!toast) return;

  msgEl.textContent = message;
  iconEl.textContent = icon;
  toast.classList.add('show');

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3500);
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
