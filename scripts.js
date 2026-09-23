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
     1b. Motor atmosférico — meteorologia + astronomia + localização real

     A cena usa três fontes complementares:
       • Geolocalização do navegador (watchPosition) para obter a posição
         atual com a melhor precisão disponível, sem persistir coordenadas;
       • Open-Meteo para clima atual, nuvens, chuva, visibilidade, vento e
         nascer/pôr do sol;
       • astronomia local calculada no cliente para posição aparente do
         Sol/Lua, fase lunar, escala visual e direção da luz.

     Sem permissão/rede, o site cai silenciosamente no modelo local anterior.
     O modo manual continua disponível para demonstração dos fenômenos.
     ------------------------------------------------------------------ */
  (function initAtmosphere() {
    var scene = document.querySelector(".scene");
    if (!scene) return;

    var rain = document.getElementById("sceneRain");
    var dust = document.getElementById("sceneDryDust");
    var lightning = document.getElementById("sceneLightning");
    var weatherToggle = document.getElementById("weatherToggle");
    var weatherPanel = document.getElementById("weatherPanel");
    var weatherMode = document.getElementById("weatherMode");
    var weatherReadout = document.getElementById("weatherReadout");
    var locationReadout = document.getElementById("locationReadout");
    var weatherDetails = document.getElementById("weatherDetails");
    var orb = scene.querySelector(".scene__orb");

    var WEATHER_KEY = "novgorod-weather-mode";
    var manualMode = "auto";
    var autoState = "clear";
    var lightningTimer = null;
    var cloudTimer = null;
    var weatherRefreshTimer = null;
    var locationWatchId = null;
    var fetchController = null;
    var lastWeatherFetch = 0;
    var rainCount = window.matchMedia("(max-width: 700px)").matches ? 50 : 88;
    var weatherState = {
      latitude: null,
      longitude: null,
      accuracy: null,
      current: null,
      daily: null,
      timezone: null,
      source: "simulado"
    };

    function clamp(n, min, max) {
      return Math.max(min, Math.min(max, n));
    }

    function rad(deg) { return deg * Math.PI / 180; }
    function deg(radValue) { return radValue * 180 / Math.PI; }
    function normalizeDeg(value) {
      return (value % 360 + 360) % 360;
    }
    function shortestAngleDiff(a, b) {
      var d = normalizeDeg(a - b + 180) - 180;
      return d;
    }

    function isSecureGeoContext() {
      return !!window.isSecureContext || location.hostname === "localhost" || location.hostname === "127.0.0.1";
    }

    function haversineKm(lat1, lon1, lat2, lon2) {
      var dLat = rad(lat2 - lat1);
      var dLon = rad(lon2 - lon1);
      var a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
      return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function formatTime(value) {
      if (!value) return "--:--";
      var parts = String(value).split("T");
      return parts.length > 1 ? parts[1].slice(0, 5) : String(value);
    }

    function localNow() {
      return new Date();
    }

    function setReadout(text, detail) {
      if (weatherReadout) weatherReadout.textContent = text;
      if (weatherDetails) weatherDetails.textContent = detail || "";
    }

    function setLocationStatus(text) {
      if (locationReadout) locationReadout.textContent = text;
    }

    function setSceneTime(isDay) {
      html.setAttribute("data-scene-time", isDay ? "day" : "night");
      if (isDay) {
        scene.style.setProperty("--scene-cold-light", "rgba(188,222,255,.10)");
        scene.style.setProperty("--scene-warm-light", "rgba(255,213,146,.42)");
      } else {
        scene.style.setProperty("--scene-cold-light", "rgba(128,165,255,.24)");
        scene.style.setProperty("--scene-warm-light", "rgba(255,180,118,.10)");
      }
    }

    function makeParticles() {
      if (!rain || !dust) return;
      rain.textContent = "";
      dust.textContent = "";
      for (var i = 0; i < rainCount; i++) {
        var drop = document.createElement("span");
        drop.style.setProperty("--x", (Math.random() * 112 - 6).toFixed(2) + "%");
        drop.style.setProperty("--w", (Math.random() * 1.55 + 0.5).toFixed(2) + "px");
        drop.style.setProperty("--h", (Math.random() * 20 + 9).toFixed(1) + "px");
        drop.style.setProperty("--speed", (Math.random() * 1.55 + 0.62).toFixed(2) + "s");
        drop.style.setProperty("--delay", (-Math.random() * 4.5).toFixed(2) + "s");
        drop.style.setProperty("--angle", (-10 - Math.random() * 10).toFixed(1) + "deg");
        drop.style.setProperty("--drift", (Math.random() * 90 + 35).toFixed(0) + "px");
        drop.style.setProperty("--a", (0.16 + Math.random() * 0.54).toFixed(2));
        rain.appendChild(drop);
      }
    }

    function moonPhase(date) {
      var jd = date.getTime() / 86400000 + 2440587.5;
      var phase = ((jd - 2451550.09765) / 29.530588853) % 1;
      if (phase < 0) phase += 1;
      var illumination = (1 - Math.cos(2 * Math.PI * phase)) / 2;
      return { phase: phase, illumination: illumination, age: phase * 29.530588853 };
    }

    /* Posição solar aparente (algoritmo compacto baseado no NOAA). */
    function sunPosition(date, lat, lon) {
      var jd = date.getTime() / 86400000 + 2440587.5;
      var n = jd - 2451545.0;
      var L = normalizeDeg(280.460 + 0.9856474 * n);
      var g = rad(normalizeDeg(357.528 + 0.9856003 * n));
      var lambda = rad(normalizeDeg(L + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)));
      var eps = rad(23.439 - 0.0000004 * n);
      var ra = Math.atan2(Math.cos(eps) * Math.sin(lambda), Math.cos(lambda));
      var dec = Math.asin(Math.sin(eps) * Math.sin(lambda));
      var gmst = normalizeDeg(280.46061837 + 360.98564736629 * (jd - 2451545.0));
      var H = rad(shortestAngleDiff(normalizeDeg(gmst + lon - deg(ra)), 0));
      var phi = rad(lat);
      var alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
      var az = normalizeDeg(deg(Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(H))) + 180);
      return { altitude: deg(alt), azimuth: az };
    }

    /* Lua: aproximação suficiente para animação/posição visual local.
       A fase é calculada independentemente com o mês sinódico. */
    function moonPosition(date, lat, lon) {
      var jd = date.getTime() / 86400000 + 2440587.5;
      var d = jd - 2451543.5;
      var N = rad(normalizeDeg(125.1228 - 0.0529538083 * d));
      var i = rad(5.1454);
      var w = rad(normalizeDeg(318.0634 + 0.1643573223 * d));
      var a = 60.2666;
      var e = 0.0549;
      var M = rad(normalizeDeg(115.3654 + 13.0649929509 * d));
      var E = M;
      for (var k = 0; k < 5; k++) E = M + e * Math.sin(E) * (1 + e * Math.cos(E));
      var xv = a * (Math.cos(E) - e);
      var yv = a * (Math.sqrt(1 - e * e) * Math.sin(E));
      var v = Math.atan2(yv, xv);
      var r = Math.sqrt(xv * xv + yv * yv);
      var xh = r * (Math.cos(N) * Math.cos(v + w) - Math.sin(N) * Math.sin(v + w) * Math.cos(i));
      var yh = r * (Math.sin(N) * Math.cos(v + w) + Math.cos(N) * Math.sin(v + w) * Math.cos(i));
      var zh = r * (Math.sin(v + w) * Math.sin(i));
      var ecl = rad(23.4393);
      var xe = xh;
      var ye = yh * Math.cos(ecl) - zh * Math.sin(ecl);
      var ze = yh * Math.sin(ecl) + zh * Math.cos(ecl);
      var ra = Math.atan2(ye, xe);
      var dec = Math.atan2(ze, Math.sqrt(xe * xe + ye * ye));
      var gmst = normalizeDeg(280.46061837 + 360.98564736629 * (jd - 2451545.0));
      var H = rad(shortestAngleDiff(normalizeDeg(gmst + lon - deg(ra)), 0));
      var phi = rad(lat);
      var alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
      var az = normalizeDeg(deg(Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(H))) + 180);
      return { altitude: deg(alt), azimuth: az };
    }

    function updateOrbAndLight() {
      var date = localNow();
      var hasCoords = typeof weatherState.latitude === "number" && typeof weatherState.longitude === "number";
      var sun = hasCoords ? sunPosition(date, weatherState.latitude, weatherState.longitude) : null;
      var moon = hasCoords ? moonPosition(date, weatherState.latitude, weatherState.longitude) : null;
      var current = weatherState.current || {};
      var isDay = typeof current.is_day === "number" ? current.is_day === 1 : (sun ? sun.altitude > -0.35 : (date.getHours() >= 6 && date.getHours() < 18));
      setSceneTime(isDay);

      var astro = isDay ? sun : moon;
      if (!astro) astro = { altitude: isDay ? 55 : 30, azimuth: isDay ? 140 : 40 };

      var altitudeNorm = clamp((astro.altitude + 8) / 68, 0, 1);
      var size = 58 + altitudeNorm * 39;
      if (!isDay && weatherState.current && weatherState.current.cloud_cover > 80) size *= 0.92;
      var az = normalizeDeg(astro.azimuth);
      var x = 50 + Math.sin(rad(az)) * 34;
      var y = 12 + (1 - altitudeNorm) * 34;

      if (orb) {
        orb.style.setProperty("--orb-size", size.toFixed(1) + "px");
        orb.style.setProperty("--orb-x", x.toFixed(2) + "%");
        orb.style.setProperty("--orb-y", y.toFixed(2) + "%");
        orb.style.setProperty("--orb-altitude", astro.altitude.toFixed(2));
      }

      scene.style.setProperty("--light-angle", normalizeDeg(az + 90).toFixed(1) + "deg");
      scene.style.setProperty("--light-altitude", clamp(altitudeNorm, 0, 1).toFixed(3));
      var lightStrength = isDay ? clamp(0.42 + altitudeNorm * 0.58, .18, 1) : clamp(.18 + altitudeNorm * .22, .10, .42);
      scene.style.setProperty("--light-strength", lightStrength.toFixed(3));
      scene.style.setProperty("--shadow-strength", (0.16 + lightStrength * 0.34).toFixed(3));

      var phaseInfo = moonPhase(date);
      scene.style.setProperty("--moon-phase", phaseInfo.phase.toFixed(5));
      scene.style.setProperty("--moon-illumination", phaseInfo.illumination.toFixed(4));
      scene.style.setProperty("--moon-shadow-shift", ((0.5 - phaseInfo.phase) * 1.68).toFixed(4));
    }

    function setSky(p) {
      var isDay = html.getAttribute("data-scene-time") === "day";
      var base = isDay ? {
        sky1: p.sky1 || "#4b86c2",
        sky2: p.sky2 || "#78add8",
        sky3: p.sky3 || "#c4dced",
        ground: p.ground || "#e3d9c4"
      } : {
        sky1: p.sky1 || "#050a1a",
        sky2: p.sky2 || "#111a36",
        sky3: p.sky3 || "#3d4566",
        ground: p.ground || "#40394d"
      };
      var overlay = p.overlay || "rgba(255,255,255,0)";
      document.documentElement.style.setProperty(
        "--weather-body-bg",
        "radial-gradient(ellipse at 77% 10%, " + (isDay ? "rgba(255,238,180,.30)" : "rgba(110,140,210,.16)") + ", transparent 58%)," +
        "linear-gradient(180deg," + base.sky1 + " 0%," + base.sky2 + " 34%," + base.sky3 + " 67%," + base.ground + " 100%)"
      );
      document.documentElement.style.setProperty("--weather-overlay", overlay);
      document.documentElement.style.setProperty("--weather-ground", base.ground);
    }

    function modePreset(mode) {
      var isDay = html.getAttribute("data-scene-time") === "day";
      if (mode === "clear") return {
        sky1: isDay ? "#3f7cb8" : "#050a1a", sky2: isDay ? "#6ba3d6" : "#0b1226", sky3: isDay ? "#a8cdea" : "#34355a", ground: isDay ? "#e7dcc7" : "#4a3f52",
        cloud: isDay ? .34 : .20, brightness: isDay ? 1.06 : .44, saturation: isDay ? 1 : .52, contrast: 1.02, haze: isDay ? .07 : .025,
        groundTint: isDay ? "rgba(222,190,130,.11)" : "rgba(45,40,60,.10)", palace: isDay ? 1.03 : .28, palaceSat: isDay ? .84 : .44, lights: isDay ? 0 : .86,
        bands: [.22, .38, .10]
      };
      if (mode === "cloudy") return {
        sky1: isDay ? "#597b99" : "#11182c", sky2: isDay ? "#8399aa" : "#202943", sky3: isDay ? "#b6c1c7" : "#4a526b", ground: isDay ? "#b9b5aa" : "#454655",
        cloud: .86, brightness: isDay ? .80 : .30, saturation: .56, contrast: 1.08, haze: .28,
        groundTint: isDay ? "rgba(95,100,100,.16)" : "rgba(25,28,40,.18)", palace: isDay ? .78 : .24, palaceSat: .62, lights: isDay ? .08 : .90,
        bands: [.68, .88, .60]
      };
      if (mode === "rain") return {
        sky1: isDay ? "#3f566c" : "#080e1e", sky2: isDay ? "#657886" : "#151c31", sky3: isDay ? "#8d9ca3" : "#313a54", ground: isDay ? "#777a77" : "#343746",
        cloud: .96, brightness: isDay ? .62 : .23, saturation: .42, contrast: 1.18, haze: .44,
        groundTint: "rgba(55,65,70,.24)", palace: isDay ? .56 : .20, palaceSat: .50, lights: isDay ? .18 : .94,
        bands: [.84, .97, .80]
      };
      if (mode === "storm") return {
        sky1: "#080d1a", sky2: "#131e34", sky3: "#323b54", ground: "#2f303c",
        cloud: .99, brightness: .17, saturation: .28, contrast: 1.28, haze: .58,
        groundTint: "rgba(24,29,38,.38)", palace: .16, palaceSat: .35, lights: .99,
        bands: [.96, 1, .94]
      };
      return {
        sky1: isDay ? "#4e86a9" : "#141b2b", sky2: isDay ? "#9bb5b5" : "#303647", sky3: isDay ? "#d6caa8" : "#5a4e4a", ground: isDay ? "#c9ad72" : "#665443",
        cloud: .44, brightness: isDay ? .92 : .38, saturation: .78, contrast: 1.03, haze: .56,
        groundTint: "rgba(210,168,91,.27)", palace: isDay ? 1.06 : .34, palaceSat: .82, lights: isDay ? 0 : .80,
        bands: [.30, .42, .12]
      };
    }

    function applyLightAndWeather(mode) {
      var preset = modePreset(mode);
      setSky(preset);
      scene.style.setProperty("--weather-cloud-opacity", preset.cloud);
      scene.style.setProperty("--weather-cloud-brightness", preset.brightness);
      scene.style.setProperty("--weather-cloud-saturation", preset.saturation);
      scene.style.setProperty("--weather-cloud-contrast", preset.contrast);
      scene.style.setProperty("--weather-haze-opacity", preset.haze);
      scene.style.setProperty("--weather-ground-tint", preset.groundTint);
      scene.style.setProperty("--palace-brightness", preset.palace);
      scene.style.setProperty("--palace-saturation", preset.palaceSat);
      scene.style.setProperty("--palace-lights", preset.lights);
      scene.style.setProperty("--weather-vignette-opacity", mode === "storm" ? 1.14 : 1);

      var cloudBands = scene.querySelectorAll(".scene__clouds");
      cloudBands.forEach(function (band, index) {
        band.style.setProperty("--cloud-density", preset.bands[index] || .3);
        band.style.opacity = preset.bands[index] || .3;
      });

      var current = weatherState.current || {};
      var speed = Number(current.wind_speed_10m) || 7;
      var gust = Number(current.wind_gusts_10m) || speed;
      var direction = Number(current.wind_direction_10m);
      if (!isFinite(direction)) direction = 270;
      var speedFactor = clamp(.58 + speed / 22 + gust / 70, .65, 2.9);
      scene.style.setProperty("--weather-wind-factor", speedFactor.toFixed(3));
      scene.style.setProperty("--wind-bearing", direction.toFixed(1) + "deg");
      scene.style.setProperty("--wind-angle", normalizeDeg(direction + 180).toFixed(1) + "deg");
      scene.style.setProperty("--cloud-animation-direction", Math.sin(rad(direction)) >= 0 ? "normal" : "reverse");

      html.setAttribute("data-weather", mode);
      var labels = {
        clear: "Céu limpo · luz direta · sombras definidas",
        cloudy: "Nublado · luz difusa · camadas de nuvens calibradas",
        rain: "Chuva · alta cobertura de nuvens · atmosfera úmida",
        storm: "Tempestade · nuvens densas · relâmpagos intermitentes",
        drought: "Seca · ar quente · horizonte seco e poeira em suspensão"
      };
      var timeLabel = html.getAttribute("data-scene-time") === "day" ? "Dia" : "Noite";
      var sourceLabel = weatherState.source === "live" ? "dados locais em tempo real" : "modelo local de fallback";
      setReadout(timeLabel + " · " + labels[mode], sourceLabel);
      scheduleLightning(mode);
      updateOrbAndLight();
    }

    function modeFromLiveWeather() {
      var c = weatherState.current || {};
      var code = Number(c.weather_code);
      if ([95,96,99].indexOf(code) >= 0) return "storm";
      if ([51,53,55,56,57,61,63,65,66,67,80,81,82,85,86].indexOf(code) >= 0 || Number(c.rain) > 0.2 || Number(c.showers) > 0.2) return "rain";
      var cloud = Number(c.cloud_cover);
      var temp = Number(c.temperature_2m);
      if (cloud >= 88) return "cloudy";
      if (typeof temp === "number" && temp >= 31 && cloud < 45 && Number(c.precipitation) < 0.1) return "drought";
      if (cloud >= 38 || [1,2,3,45,48].indexOf(code) >= 0) return "cloudy";
      return "clear";
    }

    function chooseFallbackWeather() {
      var hour = localNow().getHours() + localNow().getMinutes() / 60;
      var wave = (Math.sin(Date.now() / 120000) + 1) / 2;
      if (hour >= 11 && hour <= 16 && wave > .76) return "drought";
      if (wave > .88) return "storm";
      if (wave > .64) return "rain";
      if (wave > .40) return "cloudy";
      return "clear";
    }

    function setFallback() {
      weatherState.source = "simulado";
      var date = localNow();
      /* Sem permissão de localização, não inventamos coordenadas. A cena
         continua funcionando com posição astronômica genérica e sincroniza
         imediatamente assim que watchPosition entregar uma posição real. */
      setSceneTime(date.getHours() >= 6 && date.getHours() < 18);
      if (!weatherState.current) weatherState.current = { wind_speed_10m: 7, wind_gusts_10m: 11, wind_direction_10m: 260 };
      if (manualMode === "auto") {
        autoState = chooseFallbackWeather();
        applyLightAndWeather(autoState);
      } else {
        applyLightAndWeather(manualMode);
      }
      setLocationStatus(isSecureGeoContext() ? "Aguardando permissão de localização…" : "Geolocalização exige HTTPS (ou localhost). Usando fallback.");
    }

    function scheduleLightning(mode) {
      if (lightningTimer) {
        clearTimeout(lightningTimer);
        lightningTimer = null;
      }
      if (!lightning || prefersReducedMotion || mode !== "storm") return;
      var delay = 3600 + Math.random() * 9400;
      lightningTimer = setTimeout(function () {
        lightning.classList.remove("is-flash");
        void lightning.offsetWidth;
        lightning.classList.add("is-flash");
        scheduleLightning(mode);
      }, delay);
    }

    function fetchLiveWeather() {
      if (typeof weatherState.latitude !== "number" || typeof weatherState.longitude !== "number") return Promise.resolve(false);
      var nowMs = Date.now();
      if (nowMs - lastWeatherFetch < 60000) return Promise.resolve(true);
      lastWeatherFetch = nowMs;
      if (fetchController) fetchController.abort();
      fetchController = new AbortController();
      var lat = weatherState.latitude.toFixed(6);
      var lon = weatherState.longitude.toFixed(6);
      var url = "https://api.open-meteo.com/v1/forecast?latitude=" + lat +
        "&longitude=" + lon +
        "&current=temperature_2m,relative_humidity_2m,precipitation,rain,showers,snowfall,weather_code,cloud_cover,cloud_cover_low,cloud_cover_mid,cloud_cover_high,wind_speed_10m,wind_direction_10m,wind_gusts_10m,is_day,visibility,shortwave_radiation,direct_radiation,diffuse_radiation" +
        "&daily=sunrise,sunset,daylight_duration" +
        "&forecast_days=1&timezone=auto";
      setLocationStatus("Localização precisa obtida · atualizando meteorologia…");
      return fetch(url, { signal: fetchController.signal, headers: { "Accept": "application/json" } })
        .then(function (res) {
          if (!res.ok) throw new Error("weather-http-" + res.status);
          return res.json();
        })
        .then(function (data) {
          weatherState.current = data.current || {};
          weatherState.daily = data.daily || {};
          weatherState.timezone = data.timezone || null;
          weatherState.source = "live";
          var mode = manualMode === "auto" ? modeFromLiveWeather() : manualMode;
          autoState = modeFromLiveWeather();
          applyLightAndWeather(mode);
          var c = weatherState.current;
          var d = weatherState.daily;
          var temp = isFinite(Number(c.temperature_2m)) ? Number(c.temperature_2m).toFixed(1) + " °C" : "temperatura indisponível";
          var wind = isFinite(Number(c.wind_speed_10m)) ? Math.round(Number(c.wind_speed_10m)) + " km/h" : "vento indisponível";
          var cloud = isFinite(Number(c.cloud_cover)) ? Math.round(Number(c.cloud_cover)) + "% de nuvens" : "nuvens indisponíveis";
          var precip = Number(c.precipitation) || 0;
          var sunrise = d.sunrise && d.sunrise[0] ? formatTime(d.sunrise[0]) : "--:--";
          var sunset = d.sunset && d.sunset[0] ? formatTime(d.sunset[0]) : "--:--";
          setLocationStatus("Localização precisa · ±" + Math.round(Number(weatherState.accuracy) || 0) + " m · atualização dinâmica");
          setReadout((html.getAttribute("data-scene-time") === "day" ? "Dia" : "Noite") + " · " + (mode === "storm" ? "Tempestade" : mode === "rain" ? "Chuva" : mode === "cloudy" ? "Nublado" : mode === "drought" ? "Seca" : "Céu limpo"), "" + temp + " · " + wind + " · " + cloud + " · precipitação " + precip.toFixed(1) + " mm · nascer " + sunrise + " · pôr " + sunset);
          updateOrbAndLight();
          return true;
        })
        .catch(function (err) {
          if (err && err.name === "AbortError") return false;
          weatherState.source = "simulado";
          setLocationStatus("Localização obtida · API meteorológica indisponível, usando fallback visual.");
          applyLightAndWeather(manualMode === "auto" ? chooseFallbackWeather() : manualMode);
          return false;
        });
    }

    function onLocation(position) {
      var coords = position.coords || {};
      var lat = Number(coords.latitude);
      var lon = Number(coords.longitude);
      if (!isFinite(lat) || !isFinite(lon)) return;
      var moved = true;
      if (typeof weatherState.latitude === "number" && typeof weatherState.longitude === "number") {
        moved = haversineKm(weatherState.latitude, weatherState.longitude, lat, lon) > 0.12;
      }
      weatherState.latitude = lat;
      weatherState.longitude = lon;
      weatherState.accuracy = Number(coords.accuracy) || null;
      setLocationStatus("Localização precisa detectada · ±" + Math.round(weatherState.accuracy || 0) + " m");
      updateOrbAndLight();
      if (moved || !weatherState.current || Date.now() - lastWeatherFetch > 300000) fetchLiveWeather();
    }

    function onLocationError(error) {
      locationWatchId = null;
      var message = "Localização não autorizada · usando ciclo local";
      if (error && error.code === 2) message = "Localização indisponível · usando ciclo local";
      if (error && error.code === 3) message = "Tempo de localização excedido · tentando novamente em segundo plano";
      setLocationStatus(message);
      if (!weatherState.current) setFallback();
    }

    function startGeolocation() {
      if (!("geolocation" in navigator)) {
        setFallback();
        return;
      }
      if (!isSecureGeoContext()) {
        setFallback();
        return;
      }
      try {
        locationWatchId = navigator.geolocation.watchPosition(onLocation, onLocationError, {
          enableHighAccuracy: true,
          maximumAge: 60000,
          timeout: 15000
        });
      } catch (err) {
        setFallback();
      }
    }

    function syncThemeLighting() {
      var mode = manualMode === "auto" ? (weatherState.source === "live" ? modeFromLiveWeather() : chooseFallbackWeather()) : manualMode;
      applyLightAndWeather(mode);
      updateOrbAndLight();
    }

    makeParticles();
    try {
      var savedMode = localStorage.getItem(WEATHER_KEY);
      if (savedMode && ["auto","clear","cloudy","rain","storm","drought"].indexOf(savedMode) >= 0) manualMode = savedMode;
    } catch (err) {}
    if (weatherMode) weatherMode.value = manualMode;

    if (weatherToggle && weatherPanel) {
      weatherToggle.addEventListener("click", function () {
        if (weatherState.source !== "live" && locationWatchId === null) startGeolocation();
        var open = weatherToggle.getAttribute("aria-expanded") === "true";
        weatherToggle.setAttribute("aria-expanded", String(!open));
        weatherPanel.hidden = open;
      });
    }

    if (weatherMode) {
      weatherMode.addEventListener("change", function () {
        manualMode = weatherMode.value;
        try { localStorage.setItem(WEATHER_KEY, manualMode); } catch (err) {}
        syncThemeLighting();
      });
    }

    window.addEventListener("resize", function () {
      var nextCount = window.matchMedia("(max-width: 700px)").matches ? 50 : 88;
      if (nextCount !== rainCount) { rainCount = nextCount; makeParticles(); }
    }, { passive: true });

    cloudTimer = window.setInterval(function () {
      updateOrbAndLight();
      if (manualMode === "auto" && weatherState.source === "simulado") syncThemeLighting();
      else applyLightAndWeather(manualMode === "auto" ? modeFromLiveWeather() : manualMode);
    }, 30000);

    weatherRefreshTimer = window.setInterval(function () {
      if (weatherState.source === "live") fetchLiveWeather();
    }, 180000);

    window.addEventListener("beforeunload", function () {
      if (locationWatchId !== null && navigator.geolocation) navigator.geolocation.clearWatch(locationWatchId);
      if (fetchController) fetchController.abort();
      if (cloudTimer) clearInterval(cloudTimer);
      if (weatherRefreshTimer) clearInterval(weatherRefreshTimer);
    });

    window.NovgorodWeather = {
      syncTheme: syncThemeLighting,
      refresh: fetchLiveWeather,
      getState: function () { return weatherState; }
    };

    setFallback();
    startGeolocation();
    updateOrbAndLight();
  })();

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
    if (window.NovgorodWeather) {
      window.NovgorodWeather.syncTheme();
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

  var BREEZE = 0.85;        // brisa visual de repouso
  var GUST_MAX = 3.2;       // rajada visual máxima causada pela rolagem
  var weatherWindFactor = 1;
  var lastScroll = window.scrollY || 0;
  var lastTime = performance.now();
  var wind = BREEZE;
  var windTarget = BREEZE;
  var windLoop = null;
  var ticking = false;

  function writeWind() {
    var liveFactor = window.NovgorodWeather && window.NovgorodWeather.getState ? (Number(window.NovgorodWeather.getState().current && window.NovgorodWeather.getState().current.wind_speed_10m) || 7) : 7;
    weatherWindFactor = Math.max(0.65, Math.min(2.9, 0.58 + liveFactor / 22));
    html.style.setProperty("--wind", (wind * weatherWindFactor).toFixed(3));
    html.style.setProperty("--scroll-wind-boost", Math.max(0, wind - BREEZE).toFixed(3));
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
