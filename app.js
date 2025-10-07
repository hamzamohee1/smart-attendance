AOS.init();

// Firebase Config (Replace with your own)
const firebaseConfig = {
    apiKey: "PLACEHOLDER_API_KEY",
    authDomain: "PLACEHOLDER_AUTH_DOMAIN",
    projectId: "PLACEHOLDER_PROJECT_ID",
    storageBucket: "PLACEHOLDER_STORAGE_BUCKET",
    messagingSenderId: "PLACEHOLDER_MESSAGING_SENDER_ID",
    appId: "PLACEHOLDER_APP_ID"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const functions = firebase.functions();
const messaging = firebase.messaging();

// Theme Toggle
let theme = localStorage.getItem('theme') || 'dark';
document.body.classList.add(theme);
document.getElementById('toggle-theme').addEventListener('click', () => {
    theme = theme === 'dark' ? 'light' : 'dark';
    document.body.classList.remove('dark', 'light');
    document.body.classList.add(theme);
    localStorage.setItem('theme', theme);
});

// Hide All Sections
function hideAll() {
    document.getElementById('auth-page').style.display = 'none';
    document.getElementById('admin-dashboard').style.display = 'none';
    document.getElementById('doctor-dashboard').style.display = 'none';
    document.getElementById('student-dashboard').style.display = 'none';
    document.getElementById('top-bar').style.display = 'none';
}

// Auth State Listener
auth.onAuthStateChanged(async user => {
    if (user) {
        const userDoc = await db.doc(`users/${user.uid}`).get();
        const data = userDoc.data();
        const role = data.role;
        document.getElementById('username').textContent = data.name || user.email;
        document.getElementById('top-bar').style.display = 'flex';
        hideAll();
        document.getElementById(`${role}-dashboard`).style.display = 'block';
        if (role === 'admin') loadAdminHome();
        if (role === 'doctor') loadDoctorHome();
        if (role === 'student') loadStudentHome();
        setupPushNotifications(user);
    } else {
        hideAll();
        document.getElementById('auth-page').style.display = 'block';
    }
});

// Logout
document.getElementById('logout').addEventListener('click', () => auth.signOut());

// Auth Form
const authForm = document.getElementById('auth-form');
const authBtn = document.getElementById('auth-btn');
const switchBtn = document.getElementById('switch-auth');
const nameInput = document.getElementById('name');
let isLogin = true;

switchBtn.addEventListener('click', () => {
    isLogin = !isLogin;
    authBtn.textContent = isLogin ? 'Login' : 'Register';
    switchBtn.textContent = isLogin ? 'Switch to Register' : 'Switch to Login';
    nameInput.style.display = isLogin ? 'none' : 'block';
});

authForm.addEventListener('submit', e => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const name = nameInput.value;
    if (isLogin) {
        auth.signInWithEmailAndPassword(email, password).catch(err => showToast(err.message, 'error'));
    } else {
        auth.createUserWithEmailAndPassword(email, password)
            .then(cred => {
                return db.doc(`users/${cred.user.uid}`).set({ name, email, role: 'student' });
            })
            .catch(err => showToast(err.message, 'error'));
    }
});

// Toast
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.style.background = type === 'success' ? var(--accent) : 'red';
    toast.style.display = 'block';
    setTimeout(() => toast.style.display = 'none', 3000);
}

// Push Notifications (Bonus)
async function setupPushNotifications(user) {
    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            const token = await messaging.getToken({ vapidKey: 'YOUR_VAPID_KEY' }); // Replace with your VAPID key
            await db.doc(`users/${user.uid}`).update({ pushToken: token });
        }
    } catch (err) {
        console.error(err);
    }
}

// Fingerprint for Device ID
async function getDeviceId() {
    const fp = await FingerprintJS.load();
    const result = await fp.get();
    return result.visitorId;
}

// Geo Distance Calculation (Haversine)
function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Admin Home
async function loadAdminHome() {
    const content = document.getElementById('admin-content');
    content.innerHTML = `
        <h2>Admin Dashboard</h2>
        <div class="card">Total Users: <span id="total-users"></span></div>
        <div class="card">Total Lectures: <span id="total-lectures"></span></div>
        <canvas id="admin-chart" width="400" height="200"></canvas>
    `;
    const users = await db.collection('users').get();
    document.getElementById('total-users').textContent = users.size;
    const lectures = await db.collection('lectures').get();
    document.getElementById('total-lectures').textContent = lectures.size;

    // Chart
    const ctx = document.getElementById('admin-chart').getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: { labels: ['Users', 'Lectures'], datasets: [{ data: [users.size, lectures.size], backgroundColor: var(--accent) }] }
    });
}

// Manage Doctors
async function loadManageDoctors() {
    const content = document.getElementById('admin-content');
    content.innerHTML = `
        <h2>Manage Doctors</h2>
        <form id="add-doctor-form">
            <input type="email" id="doctor-email" placeholder="Email">
            <input type="password" id="doctor-password" placeholder="Password">
            <input type="text" id="doctor-name" placeholder="Name">
            <button type="submit">Add Doctor</button>
        </form>
        <ul id="doctors-list"></ul>
    `;
    const doctors = await db.collection('users').where('role', '==', 'doctor').get();
    const list = document.getElementById('doctors-list');
    doctors.forEach(doc => {
        const li = document.createElement('li');
        li.textContent = `${doc.data().name} (${doc.data().email})`;
        const btn = document.createElement('button');
        btn.textContent = 'Remove';
        btn.onclick = () => functions.httpsCallable('deleteUser')({ uid: doc.id }).then(() => li.remove());
        li.appendChild(btn);
        list.appendChild(li);
    });

    document.getElementById('add-doctor-form').addEventListener('submit', e => {
        e.preventDefault();
        const email = document.getElementById('doctor-email').value;
        const password = document.getElementById('doctor-password').value;
        const name = document.getElementById('doctor-name').value;
        functions.httpsCallable('addUser')({ email, password, role: 'doctor', name }).then(() => showToast('Doctor added'));
    });
}

// System Reports
async function loadSystemReports() {
    const content = document.getElementById('admin-content');
    content.innerHTML = `<h2>System Reports</h2><button onclick="exportSystemReport()">Export Full Report</button>`;
    // Add more as needed
}

async function exportSystemReport() {
    const lectures = await db.collection('lectures').get();
    const data = lectures.docs.map(doc => doc.data());
    exportData(data, 'system-report');
}

// Doctor Home
async function loadDoctorHome() {
    const content = document.getElementById('doctor-content');
    content.innerHTML = `
        <h2>Doctor Dashboard</h2>
        <div class="card">Total Courses: <span id="total-courses"></span></div>
        <div class="card">Total Lectures: <span id="total-doc-lectures"></span></div>
        <canvas id="doctor-chart" width="400" height="200"></canvas>
    `;
    const user = auth.currentUser;
    const courses = await db.collection('courses').where('createdBy', '==', user.uid).get();
    document.getElementById('total-courses').textContent = courses.size;
    const lectures = await db.collection('lectures').where('createdBy', '==', user.uid).get();
    document.getElementById('total-doc-lectures').textContent = lectures.size;

    // Chart
    const ctx = document.getElementById('doctor-chart').getContext('2d');
    new Chart(ctx, {
        type: 'pie',
        data: { labels: ['Courses', 'Lectures'], datasets: [{ data: [courses.size, lectures.size], backgroundColor: [var(--accent), var(--warning)] }] }
    });
}

// Create Course
async function loadCreateCourse() {
    const content = document.getElementById('doctor-content');
    content.innerHTML = `
        <h2>Create Course</h2>
        <form id="create-course-form">
            <input type="text" id="course-name" placeholder="Course Name">
            <button type="submit">Create</button>
        </form>
        <ul id="courses-list"></ul>
    `;
    const user = auth.currentUser;
    const courses = await db.collection('courses').where('createdBy', '==', user.uid).get();
    const list = document.getElementById('courses-list');
    courses.forEach(doc => {
        const li = document.createElement('li');
        li.textContent = `${doc.data().name} (Join Code: ${doc.id})`;
        list.appendChild(li);
    });

    document.getElementById('create-course-form').addEventListener('submit', async e => {
        e.preventDefault();
        const name = document.getElementById('course-name').value;
        const courseRef = db.collection('courses').doc(); // Auto ID as join code
        await courseRef.set({ name, createdBy: user.uid, students: [] });
        showToast('Course created');
        loadCreateCourse();
    });
}

// Create Lecture
async function loadCreateLecture() {
    const content = document.getElementById('doctor-content');
    content.innerHTML = `
        <h2>Create Lecture</h2>
        <form id="create-lecture-form">
            <select id="course-select"></select>
            <input type="date" id="lecture-date">
            <input type="time" id="lecture-time">
            <input type="number" id="lecture-duration" placeholder="Duration (minutes)">
            <input type="number" id="lat" placeholder="Classroom Lat">
            <input type="number" id="lon" placeholder="Classroom Lon">
            <input type="number" id="radius" placeholder="Radius (meters)" value="50">
            <button type="submit">Create</button>
        </form>
        <div id="qr-section" style="display:none;">
            <canvas id="qr-canvas"></canvas>
            <div id="attendance-list"></div>
            <button onclick="exportLectureReport()">Export</button>
        </div>
    `;
    const user = auth.currentUser;
    const courses = await db.collection('courses').where('createdBy', '==', user.uid).get();
    const select = document.getElementById('course-select');
    courses.forEach(doc => {
        const option = document.createElement('option');
        option.value = doc.id;
        option.textContent = doc.data().name;
        select.appendChild(option);
    });

    let interval;
    document.getElementById('create-lecture-form').addEventListener('submit', async e => {
        e.preventDefault();
        const courseId = select.value;
        const date = document.getElementById('lecture-date').value;
        const time = document.getElementById('lecture-time').value;
        const duration = parseInt(document.getElementById('lecture-duration').value) * 60 * 1000;
        const lat = parseFloat(document.getElementById('lat').value);
        const lon = parseFloat(document.getElementById('lon').value);
        const radius = parseFloat(document.getElementById('radius').value);
        const timestamp = new Date(`${date}T${time}`).toISOString();
        const expirationTime = new Date(Date.now() + duration);
        const lectureRef = db.collection('lectures').doc();
        await lectureRef.set({
            courseId,
            courseName: (await db.doc(`courses/${courseId}`).get()).data().name,
            createdBy: user.uid,
            timestamp,
            expirationTime: firebase.firestore.Timestamp.fromDate(expirationTime),
            lat, lon, radius,
            closed: false
        });
        const { data } = await functions.httpsCallable('updateToken')({ lectureId: lectureRef.id });
        const token = data.token;
        document.getElementById('qr-section').style.display = 'block';
        QRCode.toCanvas(document.getElementById('qr-canvas'), `${lectureRef.id}:${token}`);

        // Refresh token every 30s
        interval = setInterval(async () => {
            if (new Date() > expirationTime) {
                clearInterval(interval);
                await lectureRef.update({ closed: true });
                showToast('Lecture closed');
                return;
            }
            const res = await functions.httpsCallable('updateToken')({ lectureId: lectureRef.id });
            QRCode.toCanvas(document.getElementById('qr-canvas'), `${lectureRef.id}:${res.data.token}`);
        }, 30000);

        // Real-time attendance
        lectureRef.collection('students').onSnapshot(snap => {
            const list = document.getElementById('attendance-list');
            list.innerHTML = '';
            snap.forEach(s => {
                const li = document.createElement('li');
                li.textContent = `${s.data().name} - ${s.data().time.toDate()}`;
                list.appendChild(li);
            });
        });
    });
}

// Doctor Reports
async function loadDoctorReports() {
    const content = document.getElementById('doctor-content');
    content.innerHTML = `<h2>Reports</h2><canvas id="attendance-chart" width="400" height="200"></canvas><ul id="absentees"></ul>`;
    const user = auth.currentUser;
    const lectures = await db.collection('lectures').where('createdBy', '==', user.uid).get();
    // Example chart data
    const labels = lectures.docs.map(l => l.data().timestamp);
    const data = lectures.docs.map(l => /* calculate % */ 80); // Placeholder
    const ctx = document.getElementById('attendance-chart').getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: { labels, datasets: [{ label: 'Attendance %', data, borderColor: var(--accent) }] }
    });

    // Frequent absentees
    // Logic: For each course, check students not present in last 3 lectures
    // Placeholder
    const list = document.getElementById('absentees');
    list.innerHTML = '<li>Student X ⚠️</li>';
}

function exportLectureReport() {
    // Query data, export
    // Placeholder: assume current lecture
    const data = [{ name: 'Ahmed', status: 'present' }]; // From snapshot
    exportData(data, 'lecture');
}

// Doctor Settings
function loadDoctorSettings() {
    const content = document.getElementById('doctor-content');
    content.innerHTML = `<h2>Settings</h2><p>Configure preferences here.</p>`;
}

// Export Data Function
function exportData(data, filename) {
    // CSV
    const csv = data.map(row => Object.values(row).join(',')).join('\n');
    const csvBlob = new Blob([csv], { type: 'text/csv' });
    downloadBlob(csvBlob, `${filename}.csv`);

    // Excel
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(data);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, `${filename}.xlsx`);

    // PDF
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.text('Smart Attendance Report', 10, 10);
    // Add table, etc.
    data.forEach((row, i) => doc.text(Object.values(row).join(' '), 10, 20 + i * 10));
    doc.save(`${filename}.pdf`);
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
}

// Student Home
async function loadStudentHome() {
    const content = document.getElementById('student-content');
    content.innerHTML = `
        <h2>Student Dashboard</h2>
        <button onclick="startScan()">Scan QR</button>
        <div class="card">Attendance %: <span id="attendance-pct"></span></div>
        <canvas id="student-chart" width="200" height="200"></canvas>
    `;
    // Calculate %
    // Placeholder
    const pct = 85;
    document.getElementById('attendance-pct').textContent = pct;

    // Progress circle
    const ctx = document.getElementById('student-chart').getContext('2d');
    new Chart(ctx, {
        type: 'doughnut',
        data: { datasets: [{ data: [pct, 100 - pct], backgroundColor: [var(--accent), 'gray'] }] }
    });
}

// Join Course
async function loadJoinCourse() {
    const content = document.getElementById('student-content');
    content.innerHTML = `
        <h2>Join Course</h2>
        <form id="join-course-form">
            <input type="text" id="course-code" placeholder="Course Code">
            <button type="submit">Join</button>
        </form>
        <ul id="enrolled-courses"></ul>
    `;
    const user = auth.currentUser;
    const userDoc = await db.doc(`users/${user.uid}`).get();
    const enrolled = userDoc.data().enrolledCourses || [];
    const list = document.getElementById('enrolled-courses');
    for (let cid of enrolled) {
        const course = await db.doc(`courses/${cid}`).get();
        const li = document.createElement('li');
        li.textContent = course.data().name;
        list.appendChild(li);
    }

    document.getElementById('join-course-form').addEventListener('submit', async e => {
        e.preventDefault();
        const code = document.getElementById('course-code').value;
        const courseRef = db.doc(`courses/${code}`);
        if (!(await courseRef.get()).exists) return showToast('Invalid code', 'error');
        await courseRef.update({ students: firebase.firestore.FieldValue.arrayUnion(user.uid) });
        await db.doc(`users/${user.uid}`).update({ enrolledCourses: firebase.firestore.FieldValue.arrayUnion(code) });
        showToast('Joined course');
        loadJoinCourse();
    });
}

// Student History
async function loadStudentHistory() {
    const content = document.getElementById('student-content');
    content.innerHTML = `<h2>Attendance History</h2><ul id="history-list"></ul>`;
    const user = auth.currentUser;
    const userDoc = await db.doc(`users/${user.uid}`).get();
    const enrolled = userDoc.data().enrolledCourses || [];
    const list = document.getElementById('history-list');
    for (let cid of enrolled) {
        const lectures = await db.collection('lectures').where('courseId', '==', cid).get();
        for (let lec of lectures.docs) {
            const att = await lec.ref.collection('students').doc(user.uid).get();
            const li = document.createElement('li');
            li.textContent = `${lec.data().courseName} - ${lec.data().timestamp} : ${att.exists ? 'Present' : 'Absent'}`;
            if (!att.exists && /* check consecutive */ false) li.innerHTML += ' ⚠️';
            list.appendChild(li);
        }
    }
    // Smart absence: sort lectures by time, check streak
}

// Scan QR
let videoStream;
async function startScan() {
    document.getElementById('scan-modal').style.display = 'block';
    const video = document.getElementById('video');
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    videoStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    video.srcObject = videoStream;
    video.play();

    const tick = () => {
        if (video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.height = video.videoHeight;
            canvas.width = video.videoWidth;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            if (code) {
                const [lectureId, token] = code.data.split(':');
                markAttendance(lectureId, token);
                closeScanModal();
                return;
            }
        }
        requestAnimationFrame(tick);
    };
    tick();
}

async function markAttendance(lectureId, token) {
    const position = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej));
    const { latitude: lat, longitude: lon } = position.coords;
    const deviceId = await getDeviceId();
    const res = await functions.httpsCallable('markAttendance')({ lectureId, token, lat, lon, deviceId });
    if (res.data.success) {
        showToast('Attendance marked');
        anime({
            targets: '#toast',
            scale: [0, 1],
            duration: 1000,
            easing: 'easeInOutQuad'
        });
    } else {
        showToast(res.data.error, 'error');
    }
}

function closeScanModal() {
    document.getElementById('scan-modal').style.display = 'none';
    if (videoStream) videoStream.getTracks().forEach(track => track.stop());
}