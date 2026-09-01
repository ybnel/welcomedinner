import { saveAttendeeToFirebase, getAttendeesFromFirebase } from "./firebaseService.js";

document.addEventListener('DOMContentLoaded', async () => {
  initParticleBackground();
  initNavigation();
  initFormHandler();
  initTicketExporter();
  initLightbox();
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

  for (let i = 0; i < 35; i++) {
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

/* ================= 2. VIEW NAVIGATION & TRANSITIONS ================= */
function initNavigation() {
  const landingView = document.getElementById('landing-view');
  const formView = document.getElementById('form-view');
  const openRegisterBtn = document.getElementById('open-register-btn');
  const backToLandingBtn = document.getElementById('back-to-landing-btn');
  const brandHomeBtn = document.getElementById('brand-home-btn');

  function showLanding() {
    formView.classList.remove('active');
    landingView.style.display = 'flex';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function showForm() {
    landingView.style.display = 'none';
    formView.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  if (openRegisterBtn) {
    openRegisterBtn.addEventListener('click', () => {
      showForm();
    });
  }

  if (backToLandingBtn) {
    backToLandingBtn.addEventListener('click', () => {
      showLanding();
    });
  }

  if (brandHomeBtn) {
    brandHomeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      showLanding();
    });
  }
}

/* ================= 3. REGISTRATION FORM & TICKET STORAGE ================= */
let currentTicketData = null;

function initFormHandler() {
  const form = document.getElementById('rsvp-registration-form');
  const submitBtn = document.getElementById('submit-btn');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Disable button to prevent double-submit
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>Menghubungkan ke Cloud...</span> ⏳';

    const formData = new FormData(form);
    const fullname = formData.get('fullname').trim();
    const jurusan = formData.get('jurusan').trim();
    const campus = formData.get('campus').trim();
    const year = formData.get('year').trim();
    const instagram = formData.get('instagram').trim();
    const whatsapp = formData.get('whatsapp').trim();
    const confirmation = formData.get('confirmation');

    // Generate Unique Ticket Code (e.g. SG-PTR-104)
    let existingList = [];
    try {
      existingList = await getAttendeesFromFirebase();
    } catch (err) {
      existingList = getAttendeesList();
    }
    
    const sequenceNumber = (existingList.length + 1).toString().padStart(3, '0');
    const ticketId = `SG-PTR-${sequenceNumber}`;
    const timestamp = new Date().toISOString();

    const attendeeRecord = {
      ticketId,
      fullname,
      jurusan,
      campus,
      year,
      instagram,
      whatsapp,
      confirmation,
      registeredAt: timestamp,
      checkedIn: false,
      checkedInAt: null
    };

    // Save to Firebase Firestore & LocalStorage Backup
    await saveAttendee(attendeeRecord);
    currentTicketData = attendeeRecord;

    // Trigger Celebratory Confetti Burst
    triggerConfetti();

    // Display Ticket Modal
    setTimeout(() => {
      renderTicketModal(attendeeRecord);
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<span>RSVP & REGISTER NOW</span> <span>🎟️</span>';
      showToast('Pendaftaran Berhasil! Data tersimpan di Cloud Firestore.', '🎉');
    }, 400);
  });
}

function getAttendeesList() {
  const data = localStorage.getItem('solid_ground_attendees');
  return data ? JSON.parse(data) : [];
}

async function saveAttendee(attendee) {
  // 1. Simpan ke Firebase Firestore
  await saveAttendeeToFirebase(attendee);
  
  // 2. Simpan ke LocalStorage cache
  const list = getAttendeesList();
  list.push(attendee);
  localStorage.setItem('solid_ground_attendees', JSON.stringify(list));
}

/* ================= 4. E-TICKET RENDERING & QR CODE ================= */
function renderTicketModal(data) {
  const modal = document.getElementById('ticket-modal');
  const nameEl = document.getElementById('ticket-name-val');
  const prodiEl = document.getElementById('ticket-prodi-val');
  const ticketIdEl = document.getElementById('ticket-id-val');
  const qrContainer = document.getElementById('ticket-qrcode');
  const closeBtn = document.getElementById('close-ticket-btn');

  nameEl.textContent = data.fullname;
  prodiEl.textContent = `${data.jurusan} (${data.campus}) • ${data.year}`;
  ticketIdEl.textContent = data.ticketId;

  // Clear previous QR
  qrContainer.innerHTML = '';

  // Generate QR Code with Payload JSON
  const qrPayload = JSON.stringify({
    id: data.ticketId,
    name: data.fullname,
    jurusan: data.jurusan,
    campus: data.campus
  });

  if (typeof QRCode !== 'undefined') {
    new QRCode(qrContainer, {
      text: qrPayload,
      width: 140,
      height: 140,
      colorDark: '#16222F',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.M
    });
  } else {
    // Fallback QR API
    qrContainer.innerHTML = `<img src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(qrPayload)}" alt="QR Code" width="140" height="140" />`;
  }

  modal.classList.add('active');

  closeBtn.onclick = () => {
    modal.classList.remove('active');
  };
}

/* ================= 5. HIGH-RESOLUTION TICKET EXPORTER (CANVAS PNG) ================= */
function initTicketExporter() {
  const downloadBtn = document.getElementById('download-ticket-btn');
  if (!downloadBtn) return;

  downloadBtn.addEventListener('click', () => {
    if (!currentTicketData) return;

    showToast('Menyiapkan gambar tiket...', '⏳');

    // Create an offscreen high-res Canvas (Width: 800px, Height: 1200px)
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 1250;
    const ctx = canvas.getContext('2d');

    // Draw background & card
    ctx.fillStyle = '#234A16';
    ctx.fillRect(0, 0, 800, 1250);

    // Card boundary (Rounded Rectangle)
    const cardX = 40;
    const cardY = 40;
    const cardW = 720;
    const cardH = 1170;
    const radius = 32;

    // Draw Cream Card
    ctx.fillStyle = '#F4EFE6';
    drawRoundedRect(ctx, cardX, cardY, cardW, cardH, radius);
    ctx.fill();

    // Top Forest Green Header section of the ticket
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cardX + radius, cardY);
    ctx.lineTo(cardX + cardW - radius, cardY);
    ctx.quadraticCurveTo(cardX + cardW, cardY, cardX + cardW, cardY + radius);
    ctx.lineTo(cardX + cardW, cardY + 280);
    ctx.lineTo(cardX, cardY + 280);
    ctx.lineTo(cardX, cardY + radius);
    ctx.quadraticCurveTo(cardX, cardY, cardX + radius, cardY);
    ctx.closePath();
    ctx.fillStyle = '#234A16';
    ctx.fill();
    ctx.restore();

    // Header Texts
    ctx.textAlign = 'center';
    ctx.fillStyle = '#FAF7F2';
    ctx.font = '600 20px -apple-system, sans-serif';
    ctx.letterSpacing = '4px';
    ctx.fillText('UNIVERSITY CHRISTIAN FELLOWSHIP', 400, 110);

    ctx.font = 'bold 50px Georgia, serif';
    ctx.fillText('SOLID GROUND', 400, 180);

    ctx.font = 'italic 24px Georgia, serif';
    ctx.fillStyle = '#F4EFE6';
    ctx.fillText('Welcome Gathering • Petra Campus Area', 400, 230);

    // Attendee Name
    ctx.fillStyle = '#16222F';
    ctx.font = 'bold 42px Georgia, serif';
    ctx.fillText(currentTicketData.fullname, 400, 360);

    // Prodi & Status
    ctx.fillStyle = '#234A16';
    ctx.font = '600 22px -apple-system, sans-serif';
    ctx.fillText(`${currentTicketData.jurusan} (${currentTicketData.campus}) • ${currentTicketData.year}`, 400, 410);

    // Event Info Grid Box
    ctx.fillStyle = '#E8E1D5';
    drawRoundedRect(ctx, 90, 460, 620, 160, 16);
    ctx.fill();

    ctx.textAlign = 'left';
    ctx.fillStyle = '#777777';
    ctx.font = 'bold 18px -apple-system, sans-serif';
    ctx.fillText('TANGGAL', 120, 505);
    ctx.fillText('WAKTU', 420, 505);
    ctx.fillText('LOKASI', 120, 575);
    ctx.fillText('STATUS', 420, 575);

    ctx.fillStyle = '#16222F';
    ctx.font = 'bold 22px -apple-system, sans-serif';
    ctx.fillText('11 Sept 2024', 120, 535);
    ctx.fillText('18:00 WIB', 420, 535);
    ctx.fillText('Fellowship Hall Petra', 120, 605);
    ctx.fillStyle = '#234A16';
    ctx.fillText('Confirmed ✅', 420, 605);

    // Dashed Divider line with notches
    ctx.strokeStyle = '#BDB5A7';
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 10]);
    ctx.beginPath();
    ctx.moveTo(70, 660);
    ctx.lineTo(730, 660);
    ctx.stroke();
    ctx.setLineDash([]); // Reset dash

    // Draw Notches on left and right
    ctx.fillStyle = '#234A16';
    ctx.beginPath();
    ctx.arc(40, 660, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(760, 660, 24, 0, Math.PI * 2);
    ctx.fill();

    // QR Code Section
    const qrImg = document.querySelector('#ticket-qrcode img') || document.querySelector('#ticket-qrcode canvas');
    if (qrImg) {
      // Draw white background frame for QR
      ctx.fillStyle = '#FFFFFF';
      drawRoundedRect(ctx, 270, 710, 260, 260, 16);
      ctx.fill();
      ctx.drawImage(qrImg, 290, 730, 220, 220);
    }

    // Ticket Code ID
    ctx.textAlign = 'center';
    ctx.fillStyle = '#16222F';
    ctx.font = 'bold 30px monospace';
    ctx.letterSpacing = '3px';
    ctx.fillText(currentTicketData.ticketId, 400, 1025);

    ctx.fillStyle = '#666666';
    ctx.font = '20px -apple-system, sans-serif';
    ctx.fillText('Tunjukkan QR Code ini ke panitia di meja registrasi Hari-H', 400, 1075);
    ctx.fillText('Selamat bergabung di komunitas Solid Ground!', 400, 1115);

    // Export to Image & Trigger Download
    setTimeout(() => {
      const imageURL = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `Tiket-SolidGround-${currentTicketData.ticketId}.png`;
      link.href = imageURL;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast('Tiket berhasil didownload!', '✅');
    }, 200);
  });
}

function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/* ================= 6. LIGHTBOX MODAL ================= */
function initLightbox() {
  const trigger = document.getElementById('poster-card-trigger');
  const lightbox = document.getElementById('poster-lightbox');
  const closeBtn = document.getElementById('close-lightbox-btn');

  if (trigger && lightbox) {
    trigger.addEventListener('click', () => {
      lightbox.classList.add('active');
    });
  }

  if (closeBtn && lightbox) {
    closeBtn.addEventListener('click', () => {
      lightbox.classList.remove('active');
    });
  }

  if (lightbox) {
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox) {
        lightbox.classList.remove('active');
      }
    });
  }
}

/* ================= 7. UTILITIES & TOAST ================= */
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

function triggerConfetti() {
  if (typeof confetti === 'function') {
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#234A16', '#F4EFE6', '#16222F', '#D4AF37']
    });
  }
}
