function toggleMode() {
  // Toggle HTML theme
  const html = document.documentElement
  html.classList.toggle("light")

  // Select avatar
  const img = document.querySelector(".avatar img")
  if (html.classList.contains("light")) {
    // Light theme avatar
    img.setAttribute("src", "./assets/avatarpsy.png")
  } else {
    // Dark theme avatar
    img.setAttribute("src", "./assets/avatar.png")
  }
}
