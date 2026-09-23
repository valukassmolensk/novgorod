/* ==========================================================================
   Casa Principesca de Novgorod — scripts
   Este arquivo é compartilhado por index.html e por todas as páginas de
   publicação (blog0001.html, blog0002.html, blog0003.html, ...). Cada
   página só precisa dos elementos com os IDs/classes usados abaixo; o
   script verifica a presença de cada um antes de usá-lo, então é seguro
   incluí-lo sem alterações em qualquer nova página do site.

   Índice geral:
   1. Alternador de tema (claro/escuro) com persistência — também troca o
      avatar (<img id="avatarImg"> + <source id="avatarSource"> em WebP)
      quando presente na página.
   2. Barra de progresso de rolagem + paralaxe sutil da bandeira
   3. Revelação de elementos ao entrar na tela (classe .reveal)
   4. Compartilhamento das publicações do blog (Web Share API ou
      cópia do link para a área de transferência)
   ========================================================================== */

(function () {
  "use strict";

  var prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ------------------------------------------------------------------
     1. Alternador de tema
     ------------------------------------------------------------------ */
  var THEME_KEY = "novgorod-theme";
  var html = document.documentElement;
  var themeToggle = document.getElementById("themeToggle");
  var avatarImg = document.getElementById("avatarImg");
  var avatarSource = document.getElementById("avatarSource");

  var AVATAR_DARK = { png: "./assets/card.png", webp: "./assets/card.webp" };
  var AVATAR_LIGHT = { png: "./assets/brasao-pequenas-armas.png", webp: "./assets/brasao-pequenas-armas.webp" };

  function applyTheme(isLight) {
    html.classList.toggle("light", isLight);
    if (themeToggle) {
      themeToggle.setAttribute("aria-checked", String(isLight));
    }
    var avatar = isLight ? AVATAR_LIGHT : AVATAR_DARK;
    if (avatarImg) {
      avatarImg.src = avatar.png;
    }
    if (avatarSource) {
      avatarSource.srcset = avatar.webp;
    }
  }

  function initTheme() {
    var saved = null;
    try {
      saved = localStorage.getItem(THEME_KEY);
    } catch (err) {
      /* localStorage indisponível (ex.: navegação privada); segue com o padrão */
    }

    if (saved === "light" || saved === "dark") {
      applyTheme(saved === "light");
      return;
    }

    var prefersLight = window.matchMedia("(prefers-color-scheme: light)").matches;
    applyTheme(prefersLight);
  }

  function toggleTheme() {
    var isLight = !html.classList.contains("light");
    applyTheme(isLight);
    try {
      localStorage.setItem(THEME_KEY, isLight ? "light" : "dark");
    } catch (err) {
      /* segue sem persistir */
    }
  }

  if (themeToggle) {
    themeToggle.addEventListener("click", toggleTheme);
  }

  initTheme();

  /* ------------------------------------------------------------------
     2. Barra de progresso de rolagem + paralaxe da bandeira
     ------------------------------------------------------------------ */
  var progressBanner = document.getElementById("progressBanner");
  var ticking = false;

  function updateOnScroll() {
    var scrollTop = window.scrollY || document.documentElement.scrollTop;
    var docHeight = document.documentElement.scrollHeight - window.innerHeight;
    var progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;

    if (progressBanner) {
      progressBanner.style.width = progress + "%";
    }

    if (!prefersReducedMotion) {
      document.documentElement.style.setProperty("--scroll-y", scrollTop.toFixed(1));
    }

    ticking = false;
  }

  function onScroll() {
    if (!ticking) {
      window.requestAnimationFrame(updateOnScroll);
      ticking = true;
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  updateOnScroll();

  /* ------------------------------------------------------------------
     3. Revelação de elementos ao entrar na tela
     ------------------------------------------------------------------ */
  var revealTargets = document.querySelectorAll(".reveal");

  if ("IntersectionObserver" in window && revealTargets.length) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      /* Sem limiar percentual: publicações longas podem ser mais altas que a
         própria janela e nunca atingiriam 15% de interseção, ficando
         permanentemente invisíveis (opacity: 0). O rootMargin negativo na
         base mantém o efeito de "revelar ao subir a página". */
      { threshold: 0, rootMargin: "0px 0px -15% 0px" }
    );

    revealTargets.forEach(function (target) {
      observer.observe(target);
    });
  } else {
    revealTargets.forEach(function (target) {
      target.classList.add("is-visible");
    });
  }

  /* ------------------------------------------------------------------
     4. Compartilhamento das publicações do blog
     ------------------------------------------------------------------ */
  var toast = document.getElementById("toast");
  var toastTimer = null;

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("is-visible");

    if (toastTimer) {
      clearTimeout(toastTimer);
    }
    toastTimer = setTimeout(function () {
      toast.classList.remove("is-visible");
    }, 2400);
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }

    return new Promise(function (resolve, reject) {
      var textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try {
        document.execCommand("copy");
        resolve();
      } catch (err) {
        reject(err);
      } finally {
        document.body.removeChild(textarea);
      }
    });
  }

  document.querySelectorAll(".share-btn").forEach(function (button) {
    button.addEventListener("click", function () {
      var post = button.closest("[data-share-url]");
      var title = (post && post.dataset.shareTitle) || document.title;
      var url = (post && post.dataset.shareUrl) || window.location.href;

      if (navigator.share) {
        navigator.share({ title: title, url: url }).catch(function () {
          /* usuário cancelou o compartilhamento; nada a fazer */
        });
        return;
      }

      copyToClipboard(url)
        .then(function () {
          showToast("Link copiado para a área de transferência!");
        })
        .catch(function () {
          showToast("Não foi possível copiar o link.");
        });
    });
  });
})();
