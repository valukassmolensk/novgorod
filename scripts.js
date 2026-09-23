/* ==========================================================================
   Casa Principesca de Novgorod — scripts
   Este arquivo é compartilhado por index.html e por todas as páginas de
   publicação (blog0001.html, blog0002.html, blog0003.html, ...). Cada
   página só precisa dos elementos com os IDs/classes usados abaixo; o
   script verifica a presença de cada um antes de usá-lo, então é seguro
   incluí-lo sem alterações em qualquer nova página do site.

   Índice geral:
   0. Detecção de capacidade gráfica — liga o tecido animado completo
      (#cloth-wave) apenas onde ele roda bem; nos demais aparelhos fica a
      versão leve (#cloth-wave-lite), já aplicada pelo CSS.
   1. Alternador de tema (claro/escuro) com persistência — também troca o
      avatar (<img id="avatarImg"> + <source id="avatarSource"> em WebP)
      quando presente na página.
   2. Barra de progresso de rolagem + paralaxe sutil da bandeira
   3. Revelação de elementos ao entrar na tela (classe .reveal), com
      escalonamento automático dentro de cada grupo
   4. Transição de saída ao navegar entre páginas do próprio site
   5. Compartilhamento das publicações do blog (Web Share API ou
      cópia do link para a área de transferência)
   ========================================================================== */

(function () {
  "use strict";

  var html = document.documentElement;
  var motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  var prefersReducedMotion = motionQuery.matches;

  /* ------------------------------------------------------------------
     0. Capacidade gráfica — tecido completo ou versão leve
     ------------------------------------------------------------------ */
  var qualityLocked = false;

  function evaluateSceneQuality() {
    if (qualityLocked) return;

    var cores = navigator.hardwareConcurrency || 4;
    var memory = navigator.deviceMemory || 4;
    var saveData = navigator.connection && navigator.connection.saveData;

    /* O flamular custa pouco: são três camadas pequenas em fusão cruzada,
       e há um jogo de quadros reduzido para telas menores. Por isso ele vale
       também em telefones — ficam de fora apenas os aparelhos declaradamente
       modestos, quem pediu economia de dados e quem prefere menos movimento. */
    var capable = !prefersReducedMotion && !saveData && (cores >= 4 || memory >= 4);

    html.classList.toggle("fx-full", !!capable);
  }

  evaluateSceneQuality();

  /* Guarda de desempenho: mede a taxa de quadros logo após o carregamento.
     Se a máquina não estiver dando conta do flamular, ele é desligado de
     vez (fica o quadro único) — vale mais uma página fluida do que uma
     bandeira animada engasgando. */
  function watchFrameRate() {
    if (!html.classList.contains("fx-full")) return;

    var frames = 0;
    var start = performance.now();

    function step(now) {
      frames++;
      if (now - start < 1400) {
        requestAnimationFrame(step);
        return;
      }
      var fps = frames / ((now - start) / 1000);
      if (fps < 24) {
        html.classList.remove("fx-full");
        qualityLocked = true;
      }
    }

    requestAnimationFrame(step);
  }

  window.addEventListener("load", function () {
    setTimeout(watchFrameRate, 900);
  });

  /* ------------------------------------------------------------------
     1. Alternador de tema
     ------------------------------------------------------------------ */
  var THEME_KEY = "novgorod-theme";
  var themeToggle = document.getElementById("themeToggle");
  var avatarImg = document.getElementById("avatarImg");
  var avatarSource = document.getElementById("avatarSource");
  var themeColorMeta = document.querySelector('meta[name="theme-color"]');

  var AVATAR_DARK = { png: "./assets/card.png", webp: "./assets/card.webp" };
  var AVATAR_LIGHT = {
    png: "./assets/brasao-pequenas-armas.png",
    webp: "./assets/brasao-pequenas-armas.webp"
  };

  function applyTheme(isLight) {
    html.classList.toggle("light", isLight);
    if (themeToggle) {
      themeToggle.setAttribute("aria-checked", String(isLight));
    }
    if (themeColorMeta) {
      themeColorMeta.setAttribute("content", isLight ? "#6ba3d6" : "#0b1226");
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

    applyTheme(window.matchMedia("(prefers-color-scheme: light)").matches);
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
     2. Rolagem: barra de progresso, paralaxe da cena e VENTO

     A rolagem é o vento da cena. A velocidade com que a página corre vira
     --wind, que o CSS usa para acelerar o flamular da bandeira e a passagem
     das nuvens e para inclinar o mastro. O valor sobe depressa (a rajada
     chega junto com o gesto) e cai devagar (o vento amaina), com um piso de
     brisa para que a cena nunca fique parada.

     Tudo passa por duas variáveis apenas — --scroll-y e --wind — escritas
     no máximo uma vez por quadro; as camadas se movem por transform, sem
     repintura.
     ------------------------------------------------------------------ */
  var progressBanner = document.getElementById("progressBanner");

  var BREEZE = 0.85;        // vento de repouso
  var GUST_MAX = 2.6;       // rajada máxima
  var lastScroll = window.scrollY || 0;
  var lastTime = performance.now();
  var wind = BREEZE;
  var windTarget = BREEZE;
  var windLoop = null;
  var ticking = false;

  function writeWind() {
    html.style.setProperty("--wind", wind.toFixed(3));
  }

  function updateOnScroll() {
    var scrollTop = window.scrollY || document.documentElement.scrollTop || 0;
    var docHeight = document.documentElement.scrollHeight - window.innerHeight;
    var progress = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;

    if (progressBanner) {
      progressBanner.style.width = Math.min(100, Math.max(0, progress)) + "%";
    }

    html.style.setProperty("--scroll-y", prefersReducedMotion ? "0" : scrollTop.toFixed(1));

    if (!prefersReducedMotion) {
      var now = performance.now();
      var dt = Math.max(16, now - lastTime);
      var speed = Math.abs(scrollTop - lastScroll) / dt;    // px por ms
      lastScroll = scrollTop;
      lastTime = now;

      windTarget = Math.min(GUST_MAX, BREEZE + speed * 0.55);
      startWindLoop();
    }

    ticking = false;
  }

  /* O vento tem inércia própria: continua correndo alguns instantes depois
     que a rolagem parou, até voltar à brisa. */
  function startWindLoop() {
    if (windLoop !== null) return;

    var step = function () {
      // sobe rápido, desce devagar — é assim que uma rajada se comporta
      var rate = windTarget > wind ? 0.22 : 0.035;
      wind += (windTarget - wind) * rate;
      windTarget += (BREEZE - windTarget) * 0.04;
      writeWind();

      if (Math.abs(wind - BREEZE) < 0.01 && Math.abs(windTarget - BREEZE) < 0.01) {
        wind = BREEZE;
        windTarget = BREEZE;
        writeWind();
        windLoop = null;
        return;
      }
      windLoop = window.requestAnimationFrame(step);
    };

    windLoop = window.requestAnimationFrame(step);
  }

  function onScroll() {
    if (!ticking) {
      window.requestAnimationFrame(updateOnScroll);
      ticking = true;
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });

  if (!prefersReducedMotion) {
    writeWind();
    /* Uma rajada de boas-vindas ao abrir a página */
    windTarget = 1.6;
    startWindLoop();
  }

  /* ------------------------------------------------------------------
     3. Revelação de elementos ao entrar na tela
     ------------------------------------------------------------------ */
  var revealTargets = Array.prototype.slice.call(document.querySelectorAll(".reveal"));
  var sweepTimer = null;

  /* Escalonamento automático: cada elemento recebe o seu índice dentro do
     grupo de irmãos .reveal, para que grades (publicações, links, vídeos)
     apareçam em cascata sem regras :nth-child() escritas à mão. */
  function assignStagger() {
    var groups = new Map();

    revealTargets.forEach(function (el) {
      var parent = el.parentElement || document.body;
      var index = groups.get(parent) || 0;
      groups.set(parent, index + 1);
      el.style.setProperty("--reveal-i", String(Math.min(index, 8)));
    });
  }

  if (revealTargets.length) {
    assignStagger();
  }

  function revealAll() {
    revealTargets.forEach(function (target) {
      target.classList.add("is-visible");
    });
  }

  if (prefersReducedMotion) {
    revealAll();
  } else if ("IntersectionObserver" in window && revealTargets.length) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          /* Além dos elementos que entram na tela, revelamos também os que
             já ficaram para trás (topo acima da janela) — do contrário, um
             salto de rolagem, uma âncora (#blog) ou a volta pelo histórico
             deixariam blocos inteiros permanentemente invisíveis. */
          if (entry.isIntersecting || entry.boundingClientRect.top < 0) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      /* Sem limiar percentual: publicações longas podem ser mais altas que a
         própria janela e nunca atingiriam 15% de interseção, ficando
         permanentemente invisíveis (opacity: 0). O rootMargin negativo na
         base mantém o efeito de "revelar ao subir a página". */
      { threshold: 0, rootMargin: "0px 0px -12% 0px" }
    );

    revealTargets.forEach(function (target) {
      observer.observe(target);
    });

    /* Rede de segurança: qualquer elemento que já esteja na tela (ou acima
       dela) é revelado, mesmo que o observador não tenha sido acionado. */
    var sweep = function () {
      revealTargets.forEach(function (target) {
        if (target.classList.contains("is-visible")) return;
        var rect = target.getBoundingClientRect();
        if (rect.top < window.innerHeight * 0.98) {
          target.classList.add("is-visible");
        }
      });
    };

    window.addEventListener("load", function () {
      setTimeout(sweep, 350);
    });
    window.addEventListener("hashchange", function () {
      setTimeout(sweep, 120);
    });
    window.addEventListener("scroll", function () {
      if (sweepTimer) clearTimeout(sweepTimer);
      sweepTimer = setTimeout(sweep, 220);
    }, { passive: true });
  } else {
    revealAll();
  }

  /* ------------------------------------------------------------------
     4. Transição de saída entre páginas do site
     ------------------------------------------------------------------ */
  if (!prefersReducedMotion) {
    document.addEventListener("click", function (event) {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      var link = event.target.closest && event.target.closest("a[href]");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) return;

      var url;
      try {
        url = new URL(link.href, window.location.href);
      } catch (err) {
        return;
      }

      if (url.origin !== window.location.origin) return;
      /* Âncora na própria página: deixa a rolagem suave do CSS agir */
      if (url.pathname === window.location.pathname && url.hash) return;
      if (url.href === window.location.href) return;

      event.preventDefault();
      document.body.classList.add("is-leaving");
      setTimeout(function () {
        window.location.href = url.href;
      }, 240);
    });

    /* Ao voltar pelo histórico, o navegador pode restaurar a página já com
       a classe de saída aplicada — limpa-a. */
    window.addEventListener("pageshow", function () {
      document.body.classList.remove("is-leaving");
    });
  }

  /* ------------------------------------------------------------------
     5. Compartilhamento das publicações do blog
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

  Array.prototype.forEach.call(document.querySelectorAll(".share-btn"), function (button) {
    button.addEventListener("click", function () {
      var post = button.closest("[data-share-url]");
      var title = (post && post.dataset.shareTitle) || document.title;
      var url = (post && post.dataset.shareUrl) || window.location.href;

      if (navigator.share) {
        navigator
          .share({ title: title, url: url })
          .catch(function () {
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

  /* ------------------------------------------------------------------
     Reavaliações em mudanças de contexto (giro de tela, redimensionamento,
     preferência de movimento)
     ------------------------------------------------------------------ */
  var resizeTimer = null;
  window.addEventListener(
    "resize",
    function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        evaluateSceneQuality();
        updateOnScroll();
      }, 180);
    },
    { passive: true }
  );

  window.addEventListener("orientationchange", function () {
    setTimeout(updateOnScroll, 260);
  });

  if (motionQuery.addEventListener) {
    motionQuery.addEventListener("change", function (event) {
      prefersReducedMotion = event.matches;
      evaluateSceneQuality();
      if (prefersReducedMotion) revealAll();
    });
  }

  updateOnScroll();
})();
