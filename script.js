// ✅ Ensure DOM is fully loaded before running the script
document.addEventListener('DOMContentLoaded', () => {
    setupModals();
    setupForms();
    checkUserSession();
    loadServices();
});

// ✅ Setup Modal Functionality
function setupModals() {
    const loginBtn = document.querySelector('.login-btn');
    const signupBtn = document.querySelector('.signup-btn');
    const loginModal = document.getElementById('loginModal');
    const signupModal = document.getElementById('signupModal');
    const closeBtns = document.querySelectorAll('.close');

    if (loginBtn) loginBtn.addEventListener('click', () => loginModal.style.display = 'block');
    if (signupBtn) signupBtn.addEventListener('click', () => signupModal.style.display = 'block');

    closeBtns.forEach(btn => btn.addEventListener('click', () => {
        loginModal.style.display = 'none';
        signupModal.style.display = 'none';
    }));

    window.addEventListener('click', (e) => {
        if (e.target === loginModal || e.target === signupModal) {
            loginModal.style.display = 'none';
            signupModal.style.display = 'none';
        }
    });
}

// ✅ Setup Form Submission Handlers
function setupForms() {
    const signupForm = document.getElementById('signupForm');
    const loginForm = document.getElementById('loginForm');

    if (signupForm) {
        signupForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = e.target.querySelector('input[name="name"]').value;
            const email = e.target.querySelector('input[name="email"]').value;
            const password = e.target.querySelector('input[name="password"]').value;
            const contact_number = e.target.querySelector('input[name="contact_number"]').value;

            try {
                const response = await fetch('http://localhost:3000/api/signup', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, email, password, contact_number })
                });

                const data = await response.json();
                console.log("📌 Signup API Response:", data);

                if (data.success) {
                    localStorage.setItem('user', JSON.stringify(data.user));
                    localStorage.setItem('token', data.token);
                    updateUIAfterLogin(data.user);
                    signupModal.style.display = 'none';
                    showNotification('✅ Registration successful!', 'success');
                } else {
                    showNotification(`❌ Error: ${data.message}`, 'error');
                }
            } catch (error) {
                console.error("❌ Signup Error:", error);
                showNotification('❌ An error occurred during signup', 'error');
            }
        });
    }

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = e.target.querySelector('input[name="email"]').value;
            const password = e.target.querySelector('input[name="password"]').value;

            try {
                const response = await fetch('http://localhost:3000/api/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, password })
                });

                const data = await response.json();
                console.log("📌 Login API Response:", data);

                if (data.success) {
                    localStorage.setItem('user', JSON.stringify(data.user));
                    localStorage.setItem("token", data.token);
                    updateUIAfterLogin(data.user);
                    loginModal.style.display = 'none';
                    showNotification('✅ Login successful!', 'success');
                } else {
                    showNotification('❌ Invalid credentials', 'error');
                }
            } catch (error) {
                console.error("❌ Login Error:", error);
                showNotification('❌ An error occurred during login', 'error');
            }
        });
    }
}

// ✅ Check If User is Already Logged In
function checkUserSession() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (user.role === 'admin') {
        document.getElementById('adminPanel').style.display = 'block'; // Show admin panel
    } else {
        document.getElementById('adminPanel').style.display = 'none'; // Hide it for users
    }
}
// ✅ Update UI After Login
function updateUIAfterLogin(user) {
    const navLinks = document.querySelector('.nav-links');
    if (!navLinks) {
        console.error("❌ Error: Navigation links container not found.");
        return;
    }

    document.querySelector('.login-btn')?.remove();
    document.querySelector('.signup-btn')?.remove();

    const userProfile = document.createElement('div');
    userProfile.className = 'user-profile';
    userProfile.innerHTML = `
        <span>Welcome, ${user.name}</span>
        <button class="logout-btn">Logout</button>
    `;
    navLinks.appendChild(userProfile);

    document.querySelector('.logout-btn').addEventListener('click', () => {
        localStorage.removeItem('user');
        localStorage.removeItem('token');
        location.reload();
    });
}

// ✅ Load Available Services
async function loadServices() {
    try {
        const response = await fetch("http://localhost:3000/api/services");

        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const services = await response.json();
        console.log("✅ Services loaded successfully:", services);

        let serviceList = document.getElementById("service-list");
        if (!serviceList) {
            console.error("❌ Error: Element with ID 'service-list' not found.");
            return;
        }

        serviceList.innerHTML = "";
        services.forEach(service => {
            serviceList.innerHTML += `
                <div class="service-card" data-service="${service.id}">
                    <h3>${service.name}</h3>
                    <p>${service.description}</p>
                    <p>Price: $${service.price}</p>
                    <button class="book-now-btn" onclick="bookService(${service.id})">Book Now</button>
                </div>
            `;
        });
    } catch (error) {
        console.error("❌ Error loading services:", error);
    }
}

// ✅ Book Service (With JWT Authentication)
async function bookService(serviceId) {
    const token = localStorage.getItem("token");

    if (!token) {
        showNotification("❌ Please login to book a service", "error");
        return;
    }

    const bookingData = {
        service_id: serviceId,
        scheduled_time: new Date().toISOString(),
        address: "123 Street, City, Country",
        description: "Booking request for service."
    };

    try {
        const response = await fetch('/api/book-service', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(bookingData)
        });

        const result = await response.json();
        console.log("📌 Booking API Response:", result);

        if (result.success) {
            showNotification(result.message, 'success');
        } else {
            showNotification(`❌ Booking Failed: ${result.message}`, 'error');
        }
    } catch (error) {
        console.error("❌ Booking Error:", error);
        showNotification('❌ An error occurred while booking', 'error');
    }
}

// ✅ Show Notification Messages
function showNotification(message, type) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;

    document.body.appendChild(notification);
    console.log("✅ Notification Displayed:", message);

    setTimeout(() => notification.remove(), 3000);
}
