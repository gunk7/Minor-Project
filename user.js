// Highlight active navigation link based on current URL
document.addEventListener("DOMContentLoaded", () => {
    const links = document.querySelectorAll(".nav-links a");
    const currentUrl = window.location.href;

    links.forEach(link => {
        if (currentUrl.includes(link.getAttribute("href"))) {
            link.classList.add("active");
        }
    });
});

// Login input handling
function setupLoginLogic() {
    const continueBtn = document.querySelector("button");
    const inputField = document.querySelector("input");

    if (continueBtn && inputField) {
        continueBtn.addEventListener("click", () => {
            const inputValue = inputField.value.trim();
            if (inputValue === "") {
                alert("Please enter your phone number or email.");
            } else {
                alert(`Logging in with: ${inputValue}`);
                // Add real login logic here
            }
        });
    }
}

// Run login logic on login-user.html or login-provider.html
setupLoginLogic();
