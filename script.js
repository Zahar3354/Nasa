// ==========================================
// 1. НАЛАШТУВАННЯ 3D СЦЕНИ (Світіння Сонця та планети)
// ==========================================
const canvas = document.getElementById('space-canvas');
const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
function updateCameraDistance() {
    // На вузьких екранах трохи віддаляємо камеру, щоб 3D-планети виглядали гармонійно
    camera.position.z = window.innerWidth <= 768 ? 16 : 12;
}
updateCameraDistance();

const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const sunLight = new THREE.DirectionalLight(0xffffff, 1.9);
sunLight.position.set(12, 6, 10);
scene.add(sunLight);

// Зорі
const starsGeometry = new THREE.BufferGeometry();
const posArray = new Float32Array(3500 * 3);
for (let i = 0; i < 10500; i++) posArray[i] = (Math.random() - 0.5) * 110;
starsGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
const starField = new THREE.Points(
    starsGeometry,
    new THREE.PointsMaterial({ size: 0.07, color: 0xffffff, transparent: true, opacity: 0.85 })
);
scene.add(starField);

// Завантажувач текстур
const textureLoader = new THREE.TextureLoader();
const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

function loadPlanetTexture(path) {
    const texture = textureLoader.load(path);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = maxAnisotropy;
    return texture;
}

const sunUniforms = { uTime: { value: 0 } };

const simplexNoiseGLSL = `
    vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
    vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
    float snoise(vec3 v){ 
        const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
        const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
        vec3 i  = floor(v + dot(v, C.yyy) );
        vec3 x0 =   v - i + dot(i, C.xxx) ;
        vec3 g = step(x0.yzx, x0.xyz);
        vec3 l = 1.0 - g;
        vec3 i1 = min( g.xyz, l.zxy );
        vec3 i2 = max( g.xyz, l.zxy );
        vec3 x1 = x0 - i1 + 1.0 * C.xxx;
        vec3 x2 = x0 - i2 + 2.0 * C.xxx;
        vec3 x3 = x0 - 1. + 3.0 * C.xxx;
        i = mod(i, 289.0 ); 
        vec4 p = permute( permute( permute( 
                 i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
               + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
               + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
        float n_ = 1.0/7.0;
        vec3  ns = n_ * D.wyz - D.xzx;
        vec4 j = p - 49.0 * floor(p * ns.z *ns.z);
        vec4 x_ = floor(j * ns.z);
        vec4 y_ = floor(j - 7.0 * x_ );
        vec4 x = x_ *ns.x + ns.yyyy;
        vec4 y = y_ *ns.x + ns.yyyy;
        vec4 h = 1.0 - abs(x) - abs(y);
        vec4 b0 = vec4( x.xy, y.xy );
        vec4 b1 = vec4( x.zw, y.zw );
        vec4 s0 = floor(b0)*2.0 + 1.0;
        vec4 s1 = floor(b1)*2.0 + 1.0;
        vec4 sh = -step(h, vec4(0.0));
        vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
        vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
        vec3 p0 = vec3(a0.xy,h.x);
        vec3 p1 = vec3(a0.zw,h.y);
        vec3 p2 = vec3(a1.xy,h.z);
        vec3 p3 = vec3(a1.zw,h.w);
        vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
        p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
        vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
        m = m * m;
        return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
    }
    float fbm(vec3 p) {
        float value = 0.0;
        float amp = 0.5;
        for (int i = 0; i < 6; i++) {
            value += amp * snoise(p);
            p *= 2.1;
            amp *= 0.5;
        }
        return value;
    }
`;

const sunSurfaceMaterial = new THREE.ShaderMaterial({
    uniforms: sunUniforms,
    vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPos;
        void main() {
            vNormal = normalize(normalMatrix * normal);
            vPos = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
    `,
    fragmentShader: `
        uniform float uTime;
        varying vec3 vNormal;
        varying vec3 vPos;
        ${simplexNoiseGLSL}
        void main() {
            vec3 dir = normalize(vPos);
            vec3 q = vec3(
                fbm(dir * 2.5 + vec3(0.0, uTime * 0.08, 0.0)),
                fbm(dir * 2.5 + vec3(5.2, 1.3, uTime * 0.08)),
                fbm(dir * 2.5 + vec3(2.1, uTime * 0.08, 4.7))
            );
            float detail = fbm(dir * 14.0 + q * 2.5 - uTime * 0.12);
            float spots = snoise(dir * 3.2 + q * 1.2 + uTime * 0.04);
            float heat = clamp(0.55 + detail * 0.65 + spots * 0.35, 0.0, 1.0);
            vec3 colDark = vec3(0.08, 0.005, 0.0);
            vec3 colRed = vec3(0.72, 0.09, 0.0);
            vec3 colOrange = vec3(1.0, 0.42, 0.02);
            vec3 colGold = vec3(1.0, 0.85, 0.25);
            vec3 colWhite = vec3(1.0, 0.99, 0.92);
            vec3 color = mix(colDark, colRed, smoothstep(0.05, 0.32, heat));
            color = mix(color, colOrange, smoothstep(0.32, 0.58, heat));
            color = mix(color, colGold, smoothstep(0.58, 0.82, heat));
            color = mix(color, colWhite, smoothstep(0.82, 0.98, heat));
            float ndotv = clamp(dot(vNormal, vec3(0.0, 0.0, 1.0)), 0.0, 1.0);
            color *= pow(ndotv, 0.42) * 1.15;
            float rim = pow(1.0 - ndotv, 3.8);
            color += vec3(1.0, 0.35, 0.04) * rim * 1.4;
            gl_FragColor = vec4(color, 1.0);
        }
    `
});

const sun = new THREE.Mesh(new THREE.SphereGeometry(4.2, 128, 128), sunSurfaceMaterial);
sun.position.set(16, 4, 0);
scene.add(sun);

const marsTexture = loadPlanetTexture('textures/2k_mars.jpg');
const mars = new THREE.Mesh(
    new THREE.SphereGeometry(3.2, 64, 64),
    new THREE.MeshStandardMaterial({ map: marsTexture, bumpMap: marsTexture, bumpScale: 0.04, roughness: 0.85 })
);
mars.rotation.z = THREE.MathUtils.degToRad(25.2);
mars.position.set(12, 6, -1.5);
mars.visible = false;
scene.add(mars);

const moonTexture = loadPlanetTexture('textures/2k_moon.jpg');
const moon = new THREE.Mesh(
    new THREE.SphereGeometry(3.2, 64, 64),
    new THREE.MeshStandardMaterial({ map: moonTexture, bumpMap: moonTexture, bumpScale: 0.05, roughness: 0.92 })
);
moon.rotation.z = THREE.MathUtils.degToRad(6.7);
moon.position.set(12, 6, -1.5);
moon.visible = false;
scene.add(moon);

function animate() {
    requestAnimationFrame(animate);
    sunUniforms.uTime.value += 0.015;
    starField.rotation.y += 0.00015;
    sun.rotation.y += 0.0012;
    mars.rotation.y += 0.003;
    moon.rotation.y += 0.002;
    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    updateCameraDistance();
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// GSAP Хореографія з розділенням на ПК та мобільні екрани
gsap.registerPlugin(ScrollTrigger);

const mm = gsap.matchMedia();

mm.add({
    isDesktop: "(min-width: 951px)",
    isMobile: "(max-width: 950px)"
}, (context) => {
    const { isMobile } = context.conditions;
    const slideOffset = isMobile ? 120 : 300;
    const scrollPerSlide = isMobile ? 750 : 950;

    gsap.utils.toArray('.slide-left').forEach(el => {
        gsap.fromTo(el,
            { opacity: 0, x: isMobile ? -35 : -80 },
            {
                opacity: 1, x: 0, duration: 1.2, ease: "power2.out",
                scrollTrigger: { trigger: el, start: "top 88%", end: "top 55%", scrub: 0.8 }
            }
        );
    });

    gsap.to(sun.position, {
        x: isMobile ? -12 : -18,
        y: -2,
        scrollTrigger: { trigger: "#nasa-company", start: "top bottom", end: "bottom top", scrub: 1 }
    });

    function buildSmoothPlanetScene(sectionId, planetMesh, slidePrefix, totalSlides) {
        const leftEls = [], rightEls = [];
        for (let i = 1; i <= totalSlides; i++) {
            leftEls.push(`#${slidePrefix}-${i} .from-left`);
            rightEls.push(`#${slidePrefix}-${i} .from-right`);
        }

        gsap.set(leftEls.join(', '), { x: -slideOffset, opacity: 0 });
        gsap.set(rightEls.join(', '), { x: slideOffset, opacity: 0 });

        const scrollLength = totalSlides * scrollPerSlide;

        const tl = gsap.timeline({
            scrollTrigger: {
                trigger: sectionId,
                start: "top top",
                end: `+=${scrollLength}`,
                pin: true,
                scrub: 1.2,
                onEnter: () => { planetMesh.visible = true; },
                onLeave: () => { planetMesh.visible = false; },
                onEnterBack: () => { planetMesh.visible = true; },
                onLeaveBack: () => { planetMesh.visible = false; }
            }
        });

        tl.fromTo(planetMesh.position,
            { x: isMobile ? 7 : 12, y: isMobile ? 4 : 6, z: -1.5 },
            { x: isMobile ? -5 : -8, y: isMobile ? -7 : -10, z: 0, ease: "none", duration: totalSlides * 2 },
            0
        );

        for (let i = 1; i <= totalSlides; i++) {
            const stepTime = (i - 1) * 2;
            const animDuration = (i === 1) ? 1.0 : 1.2;

            tl.to(`#${slidePrefix}-${i} .from-left`, { x: 0, opacity: 1, duration: animDuration, ease: "power2.out" }, stepTime)
              .to(`#${slidePrefix}-${i} .from-right`, { x: 0, opacity: 1, duration: animDuration, ease: "power2.out" }, stepTime);

            if (i < totalSlides) {
                tl.to(`#${slidePrefix}-${i} .from-left`, { x: -slideOffset, opacity: 0, duration: 1.2, ease: "power2.in" }, stepTime + 1.6)
                  .to(`#${slidePrefix}-${i} .from-right`, { x: slideOffset, opacity: 0, duration: 1.2, ease: "power2.in" }, stepTime + 1.6);
            }
        }
    }

    buildSmoothPlanetScene("#mars", mars, "mars-slide", 7);
    buildSmoothPlanetScene("#moon", moon, "moon-slide", 7);
});

// ==========================================
// ЛІТАЮЧІ МЕТЕОРИТИ ВИКЛЮЧНО В ШАПЦІ
// ==========================================
function initHeroMeteors() {
    const container = document.querySelector('.meteors-container');
    if (!container) return;

    const meteorCount = 6;

    for (let i = 0; i < meteorCount; i++) {
        createMeteor(container, true);
    }
}

function createMeteor(container, randomDelay = false) {
    const meteor = document.createElement('div');
    meteor.className = 'meteor';
    
    const startX = Math.random() * window.innerWidth;
    const startY = Math.random() * (window.innerHeight * 0.4);
    const duration = 1.5 + Math.random() * 2.5;
    const delay = randomDelay ? Math.random() * 4 : 0;
    const size = 1 + Math.random() * 1.5;

    meteor.style.left = `${startX}px`;
    meteor.style.top = `${startY}px`;
    meteor.style.width = `${size * 60}px`;
    meteor.style.height = `${size}px`;
    meteor.style.animationDuration = `${duration}s`;
    meteor.style.animationDelay = `${delay}s`;

    container.appendChild(meteor);

    setTimeout(() => {
        meteor.remove();
        createMeteor(container, false);
    }, (duration + delay) * 1000);
}

window.addEventListener('DOMContentLoaded', () => {
    switchResearchPlanet('mars');
    initHeroMeteors();
});

// ==========================================
// 2. ДАНІ ТА КРУГОВА КАРУСЕЛЬ ФОТО NASA
// ==========================================
const researchData = {
    mars: {
        tag: "ЧЕРВОНА ПЛАНЕТА • МАРС",
        title: "Чому людство досліджує Марс?",
        why: "Марс є найближчою до Землі планетою, умови на якій колись були схожими на земні. Головна мета вивчення — з'ясувати, чи існувало там давнє мікробіологічне життя, та зрозуміти, чому планета втратила свою атмосферу й вологу.",
        help: "Дослідження Марса дає уявлення про глобальні зміни клімату на Землі. Крім того, розробка технологій для виживання у суворих марсіанських умовах стимулює інновації в медицині, робототехніці, генерації енергії та готує людство до майбутніх пілотованих польотів.",
        photos: [
            { url: "https://svs.gsfc.nasa.gov/vis/a030000/a031300/a031343/mars_PIA26551_zoom_and_pan_1920x1080.png", caption: "Панорама марсіанського пейзажу від марсохода Curiosity" },
            { url: "https://svs.gsfc.nasa.gov/vis/a010000/a011800/a011875/WC_MarsSunset-1920-MASTER_iPad_1920x0180_print.jpg", caption: "Захід сонця на Марсі (знімок марсохода Curiosity)" },
            { url: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTFm9N3slyAKZgkHrzy7zws8rd0MxF63cbtFOdvhuhcVkOQMypgR6-F6TI&s=10", caption: "Марсіанські дюни та скельні утворення в кратері Єзеро" },
            { url: "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSvta42tVbeRdCaAeysM4N_pCBr36gRdM-xakRJhE7gQRYkReyyJIycGZQM&s=10", caption: "Глобальний вигляд поверхні Марса з орбіти" },
            { url: "https://images.mentoday.ru/upload/img_cache/3e7/3e779041b1b617df0e72bc7d74327b66_ce_666x444x0x0.jpg", caption: "Кратер Гейл, зазнімкований орбітальним апаратом" }
        ]
    },
    moon: {
        tag: "СУПУТНИК ЗЕМЛІ • МІСЯЦЬ",
        title: "Чому людство досліджує Місяць?",
        why: "Місяць — найближчий космічний об'єкт і природний форпост для вивчення глибокого космосу. Вивчення його геології допомагає розкрити таємниці ранньої історії формування Землі та всієї Сонячної системи.",
        help: "Місяць слугує унікальним майданчиком для тестування новітніх космічних технологій, видобутку ресурсів (зокрема водного льоду) та створення майбутніх наукових баз для подальших польотів на Марс і далі у Всесвіт.",
        photos: [
            { url: "https://thumb.wikimedia.org/wikipedia/commons/thumb/9/98/Aldrin_Apollo_11_original.jpg/250px-Aldrin_Apollo_11_original.jpg?utm_source=uk.wikipedia.org&utm_campaign=parser&utm_content=thumbnail", caption: "Астронавт Базз Олдрін на поверхні Місяця (Apollo 11)" },
            { url: "https://images-assets.nasa.gov/image/PIA00405/PIA00405~medium.jpg", caption: "Зворотний бік Місяця у високій деталізації" },
            { url: "https://preview.redd.it/earthset-first-photo-from-the-far-side-of-the-moon-captured-v0-9bfk4p4rjrtg1.jpeg?auto=webp&s=a1f1c73eb812b62b6f150e41368d67cab0b71b7d", caption: "Схід Землі над місячним горизонтом (Apollo 17)" },
            { url: "https://socportal.info/site/assets/files/0/07/10/423/mcgetchin-new-lunar-crater.780x480.jpg?3idfkp", caption: "Кратери та деталі рельєфу від Lunar Reconnaissance Orbiter" },
            { url: "https://24tv.ua/resources/photos/news/202305/2318322.jpg?v=1684740585000", caption: "Місячний модуль на тлі гірського масиву Декарт" }
        ]
    }
};

let currentCarouselIndex = 0;
let activePlanetKey = 'mars';

function switchResearchPlanet(planetKey) {
    activePlanetKey = planetKey;
    currentCarouselIndex = 0;

    document.querySelectorAll('.planet-btn').forEach(btn => {
        btn.classList.toggle('active', btn.textContent.toLowerCase().includes(planetKey === 'mars' ? 'марс' : 'місяць'));
    });

    const data = researchData[planetKey];
    document.getElementById('research-tag').innerText = data.tag;
    document.getElementById('research-title').innerText = data.title;
    document.getElementById('research-why').innerText = data.why;
    document.getElementById('research-help').innerText = data.help;

    renderCarousel(data.photos);
}

// ==========================================
// 3. АДАПТОВАНИЙ SWIPER ДЛЯ КАРУСЕЛІ
// ==========================================
let researchSwiper = null;

function renderCarousel(photos) {
    const track = document.getElementById('carousel-track');
    track.className = 'swiper-wrapper';
    track.innerHTML = '';
    
    photos.forEach(photo => {
        const slide = document.createElement('div');
        slide.className = 'swiper-slide carousel-slide';
        slide.innerHTML = `
            <img src="${photo.url}" alt="${photo.caption}">
            <div class="carousel-caption">${photo.caption}</div>
        `;
        track.appendChild(slide);
    });

    if (typeof Swiper !== 'undefined') {
        if (researchSwiper) {
            researchSwiper.destroy(true, true);
        }
        
        researchSwiper = new Swiper('.carousel-viewport', {
            loop: true,
            grabCursor: true,
            simulateTouch: true,
            spaceBetween: 20,
            navigation: {
                nextEl: '.next-btn',
                prevEl: '.prev-btn',
            },
            breakpoints: {
                0: { slidesPerView: 1, spaceBetween: 15 },
                600: { slidesPerView: 2, spaceBetween: 20 },
                950: { slidesPerView: 3, spaceBetween: 25 }
            }
        });
    }
}

function moveCarousel(direction) {
    if (!researchSwiper) return;
    if (direction > 0) {
        researchSwiper.slideNext();
    } else {
        researchSwiper.slidePrev();
    }
}

// ==========================================
// 4. МОДАЛЬНІ ВІКНА (ІСТОРІЇ МІСІЙ)
// ==========================================
const storiesData = {
    opportunity: { 
        tag: "МАРС • 2004–2018", 
        title: "Марсохід Opportunity", 
        status: "Статус: Долина Наполегливості (Завершено)", 
        text: `
            <p>Марсохід Opportunity (MER-B) здійснив посадку на рівнині Меридіана 25 січня 2004 року за допомогою системи надувних подушок, відскочивши від поверхні Марса 26 разів перед тим, як закотитися прямо в невеликий ударний кратер Ігл.</p>
            <p>Головним науковим проривом місії стало виявлення сферичних мінеральних утворень — так званих «марсіанських чорниць» із гематиту, а також осадових порід, які могли сформуватися виключно у присутності рідкої води мільярди років тому. За 14 років і 136 днів роботи ровер подолав 45,16 км, перевищивши початковий гарантійний термін у 55 разів.</p>
            <p>У червні 2018 року планету охопила гігантська пилова буря, яка повністю перекрила доступ сонячного світла до батарей апарата. Останній сеанс зв'язку відбувся 10 червня 2018 року: телеметрія показала критично низький заряд і високу запиленість неба, що інженери поетично переклали як «Моя батарея сідає, і стає темно».</p>
        ` 
    },
    ingenuity: { 
        tag: "МАРС • 2021–2024", 
        title: "Гелікоптер Ingenuity", 
        status: "Статус: Кратер Єзеро (Завершено)", 
        text: `
            <p>Ingenuity прибув на Марс закріпленим під днищем марсохода Perseverance. Головним інженерним викликом було створити гвинтокрил, здатний піднятися в повітря, щільність якого становить лише 1% від земної — це еквівалентно польоту на висоті понад 30 кілометрів над Землею.</p>
            <p>Щоб створити підйомну силу, два співвісні вуглепластикові гвинти діаметром 1,2 метра оберталися у протилежних напрямках зі швидкістю 2537 обертів за хвилину. 19 квітня 2021 року дрон здійснив перший в історії керований політ на іншій планеті, піднявшись на висоту 3 метри.</p>
            <p>Замість запланованих 5 демонстраційних вильотів апарат пропрацював майже три роки і здійснив 72 польоти, пролетівши загалом понад 17 кілометрів як повітряний розвідник. Під час 72-ї посадки в січні 2024 року на одноманітному піщаному рельєфі навігаційна система втратила орієнтири, і один із гвинтів отримав пошкодження при торканні ґрунту.</p>
        ` 
    },
    insight: { 
        tag: "МАРС • 2018–2022", 
        title: "Посадковий модуль InSight", 
        status: "Статус: Рівнина Елізій (Завершено)", 
        text: `
            <p>На відміну від марсоходів, які вивчають поверхню, InSight став першою стаціонарною геофізичною обсерваторією, створеною для дослідження глибоких надр Марса. Його головним інструментом був надчутливий французький сейсмометр SEIS, здатний фіксувати коливання ґрунту менші за діаметр атома водню.</p>
            <p>За чотири роки роботи апарат зареєстрував 1319 марсотрусів, включно з сейсмічними хвилями від падіння великих метеоритів. Аналіз швидкості проходження цих хвиль дозволив вченим вперше скласти «рентгенівський знімок» планети: визначити товщину кори (24–72 км), будову мантії та довести, що ядро Марса є рідким і багатим на легкі елементи.</p>
            <p>Оскільки модуль не мав щіток для очищення сонячних панелей, марсіанський пил поступово вкривав їх товстим шаром. У грудні 2022 року потужність енергосистеми впала нижче критичного рівня, і InSight востаннє вийшов на зв'язок із Землею.</p>
        ` 
    },
    spirit: { 
        tag: "МАРС • 2004–2010", 
        title: "Марсохід Spirit", 
        status: "Статус: Кратер Гусєва (Завершено)", 
        text: `
            <p>Spirit (MER-A) сів у кратері Гусєва 4 січня 2004 року — за три тижні до свого близнюка Opportunity. Спочатку дно кратера виявилося засипаним вулканічним базальтом без очевидних слідів води, тому інженери спрямували ровер до пагорбів Колумбії за три кілометри від місця посадки.</p>
            <p>Підйом на схили став тріумфом місії: Spirit знайшов породи, змінені водою. У 2006 році переднє праве колесо ровера заклинило, але замість зупинки він продовжив рух заднім ходом, тягнучи несправне колесо за собою. Ця випадковість призвела до одного з найбільших відкриттів: колесо зняло верхній шар пилу і оголило поклади чистого кремнезему — беззаперечний доказ існування давніх гарячих джерел або парових фумарол.</p>
            <p>У травні 2009 року колеса Spirit провалилися крізь крихку поверхневу кірку в пухкий сульфатний пісок в районі Трої. Після місяців спроб вивільнити апарат NASA перевело його у режим стаціонарної наукової станції, де він працював до березня 2010 року, поки не замерз під час суворої марсіанської зими.</p>
        ` 
    },
    viking1: { 
        tag: "МАРС • 1976–1982", 
        title: "Посадковий модуль Viking 1", 
        status: "Статус: Рівнина Хриса (Завершено)", 
        text: `
            <p>20 липня 1976 року — рівно через сім років після висадки Apollo 11 на Місяць — посадковий модуль Viking 1 став першим американським апаратом, який успішно сів на Марс і виконав повну наукову програму. Вже через кілька хвилин після торкання ґрунту він передав першу в історії чітку фотографію марсіанської поверхні.</p>
            <p>Апарат був оснащений триметровою роботизованою рукою з ковшем, якою брав проби ґрунту і завантажував їх у вбудовану біологічну лабораторію. Три спеціальні експерименти мали виявити ознаки обміну речовин мікроорганізмів. Результати виявилися настільки незвичними й суперечливими через високу хімічну активність марсіанського реголіту, що суперечки щодо них тривають у науковій спільноті досі.</p>
            <p>Завдяки живленню від двох радіоізотопних термоелектричних генераторів Viking 1 працював понад 6 років (2245 солів), поки помилкова команда із Землі під час оновлення програмного забезпечення випадково не вимкнула його антену.</p>
        ` 
    },
    sojourner: { 
        tag: "МАРС • 1997", 
        title: "Pathfinder та ровер Sojourner", 
        status: "Статус: Долина Арес (Завершено)", 
        text: `
            <p>Місія Mars Pathfinder 4 липня 1997 року довела, що вивчати інші планети можна швидко й відносно недорого. Посадкова станція (пізніше названа на честь Карла Сагана) не використовувала дорогих гальмівних двигунів на фінальному етапі, а впала на поверхню, загорнута в кокон із гігантських надувних подушок.</p>
            <p>Зі станції по висувній рампі з'їхав Sojourner — перший в історії колісний планетохід, що працював за межами системи Земля–Місяць. Маючи розміри 65×48×30 см і вагу всього 10,5 кг, він був оснащений рентгенівським спектрометром APXS, за допомогою якого визначив хімічний склад марсіанських каменів, яким вчені давали жартівливі імена на кшталт «Йогі» та «Барнакл Білл».</p>
            <p>Замість розрахункових 7 днів Sojourner пропрацював 83 марсіанські доби, подолавши близько 100 метрів і заклавши технологічний фундамент для всіх наступних марсоходів NASA.</p>
        ` 
    },
    phoenix: { 
        tag: "МАРС • 2008", 
        title: "Полярний зонд Phoenix", 
        status: "Статус: Арктична рівнина (Завершено)", 
        text: `
            <p>25 травня 2008 року зонд Phoenix здійснив посадку в полярному регіоні Долина Зелена на 68-й паралелі північної широти, щоб перевірити гіпотезу про наявність підповерхневого водяного льоду, раніше зафіксованого з орбіти.</p>
            <p>Використовуючи роботизовану руку завдовжки 2,35 метра, апарат викопав траншею глибиною кілька сантиметрів і виявив яскраво-білий шар. На знімках, зроблених із різницею в чотири дні, шматочки цієї речовини безслідно зникли — сублімували прямо в розріджену атмосферу, що стало стовідсотковим доказом наявності водяного льоду на Марсі.</p>
            <p>Крім того, Phoenix виявив у ґрунті перхлорати та карбонат кальцію, а його лазерний лідар зафіксував снігопад із крижаних кристалів на висоті 4 км. Місія завершилася в листопаді 2008 року з настанням полярної ночі, коли температура впала нижче -120 °C, а сонячні панелі скував лід із вуглекислого газу.</p>
        ` 
    },
    apollo11: { 
        tag: "МІСЯЦЬ • 1969", 
        title: "Посадковий ступінь «Орел» (Apollo 11)", 
        status: "Статус: Море Спокою (Об'єкт спадщини)", 
        text: `
            <p>20 липня 1969 року нижній посадковий ступінь місячного модуля LM-5 «Орел» доставив Ніла Армстронга та Базза Олдріна на рівнину Моря Спокою. Посадка відбувалася в ручному режимі, коли в баках залишалося палива менш ніж на 25 секунд польоту.</p>
            <p>Після 21 години та 36 хвилин перебування на Місяці верхній злітний ступінь відокремився, використавши нижню платформу як стартовий стіл. Посадковий ступінь залишився на поверхні разом із меморіальною табличкою на одній з опор, на якій викарбувано: «Тут люди з планети Земля вперше ступили на Місяць. Липень 1969 р. н.е. Ми прийшли з миром від імені всього людства».</p>
            <p>Орбітальний апарат LRO неодноразово фотографував місце посадки: на знімках чітко видно сам ступінь, залишені наукові прилади та темні стежки в реголіті, протоптані астронавтами.</p>
        ` 
    },
    lrrrs: { 
        tag: "МІСЯЦЬ • 1969–ДОТЕПЕР", 
        title: "Лазерні кутові відбивачі", 
        status: "Статус: Активні (Працюють і досі)", 
        text: `
            <p>Лазерні кутові відбивачі (LRRR) — єдині прилади програми Apollo, які продовжують давати наукові результати понад пів століття після завершення місій. Вони являють собою алюмінієві панелі зі 100 або 300 оптичними призмами з плавленого кварцу, залишені екіпажами Apollo 11, 14 та 15.</p>
            <p>Особливість кутового відбивача полягає в тому, що промінь світла, який падає на нього під будь-яким кутом, відбивається строго у зворотному напрямку. Обсерваторії на Землі спрямовують потужні лазери через телескопи на місця посадок і ловлять поодинокі відбиті фотони, що повертаються через 2,5 секунди.</p>
            <p>Цей експеримент дозволив виміряти відстань до Місяця з точністю до кількох міліметрів, довести, що супутник віддаляється від Землі зі швидкістю 3,8 см на рік через припливну взаємодію, а також перевірити загальну теорію відносності Ейнштейна.</p>
        ` 
    },
    lrv: { 
        tag: "МІСЯЦЬ • 1971–1972", 
        title: "Місячний електромобіль LRV", 
        status: "Статус: Місця посадок Apollo 15, 16, 17", 
        text: `
            <p>Lunar Roving Vehicle (LRV) — чотириколісний повнопривідний електромобіль, розроблений компаніями Boeing та Delco спеціально для розширення радіуса досліджень у пізніх експедиціях Apollo 15, 16 та 17. У складеному вигляді він поміщався у вантажному відсіку посадкового модуля і важив на Землі лише 210 кг.</p>
            <p>Кожне колесо ровера мало власний електродвигун потужністю 0,25 к.с. та плетений шинопровід із титанового дроту замість гуми, яка не витримала б космічного вакууму та перепадів температур. Енергію забезпечували дві неперезаряджувані срібно-цинкові батареї.</p>
            <p>Найбільшу відстань проїхав ровер місії Apollo 17 — 35,9 км. Наприкінці кожної експедиції астронавти паркували електромобіль приблизно за 100 метрів від корабля, щоб оператор із Землі міг керувати його телекамерою і зняти в прямому ефірі старт злітного ступеня.</p>
        ` 
    },
    surveyor3: { 
        tag: "МІСЯЦЬ • 1967", 
        title: "Автоматичний зонд Surveyor 3", 
        status: "Статус: Океан Бур", 
        text: `
            <p>Автоматична станція Surveyor 3 здійснила м'яку посадку в Океані Бур 20 квітня 1967 року, ставши розвідником для майбутніх висадок людей. Під час посадки двигуни не вимкнулися вчасно через хибний сигнал радара, тому апарат двічі підстрибнув і зупинився на схилі невеликого кратера.</p>
            <p>Зонд був оснащений телекамерою та першим в історії механічним ковшем для копання місячного ґрунту, яким вирив чотири траншеї, довівши, що реголіт достатньо щільний і витримає вагу пілотованого корабля.</p>
            <p>У листопаді 1969 року командир Apollo 12 Піт Конрад здійснив неймовірно точну посадку всього за 160 метрів від старого апарата. Астронавти спустилися в кратер, оглянули зонд, який за два з половиною роки змінив білий колір на світло-коричневий через сонячну радіацію, та зняли його камеру для повернення на Землю.</p>
        ` 
    },
    alsep: { 
        tag: "МІСЯЦЬ • 1969–1977", 
        title: "Наукові комплекси ALSEP", 
        status: "Статус: Місця посадок Apollo", 
        text: `
            <p>ALSEP (Apollo Lunar Surface Experiments Package) — це набір автономних геофізичних приладів, які астронавти місій Apollo 12, 14, 15, 16 та 17 встановлювали на поверхні Місяця і з'єднували кабелями з центральною станцією зв'язку.</p>
            <p>Оскільки сонячні батареї не могли працювати під час двотижневої місячної ночі, коли температура падає до -170 °C, кожен комплекс живився від радіоізотопного генератора SNAP-27. Капсулу з плутонієм-238 астронавти витягали зі спеціального захисного контейнера на посадковому модулі за допомогою довгих щипців і вставляли в генератор.</p>
            <p>Станції ALSEP безперервно працювали до 30 вересня 1977 року, передаючи дані про тисячі місяцетрусів, слабку місячну атмосферу, магнітні аномалії та внутрішній тепловий потік супутника, після чого їх вимкнули з Землі для економії бюджету на користь нових місій.</p>
        ` 
    },
    grail: { 
        tag: "МІСЯЦЬ • 2011–2012", 
        title: "Зонди-близнюки GRAIL (Ebb і Flow)", 
        status: "Статус: Кратер Саллі Райд (Завершено)", 
        text: `
            <p>Місія GRAIL складалася з двох ідентичних орбітальних апаратів — Ebb («Відплив») та Flow («Приплив»), які вийшли на полярну орбіту Місяця наприкінці 2011 року. Вони літали один за одним на висоті всього 55 км, безперервно обмінюючись радіосигналами Ка-діапазону.</p>
            <p>Коли перший зонд пролітав над ділянкою з вищою щільністю порід — гірським хребтом або масконом під ударним басейном — посилена гравітація злегка прискорювала його, змінюючи відстань до другого апарата на частки мікрона. Це дозволило побудувати найточнішу гравітаційну карту Місяця і з'ясувати, що його кора значно тонша й сильніше роздроблена ударами, ніж вважалося раніше.</p>
            <p>17 грудня 2012 року, коли паливо закінчилося, інженери скерували обидва зонди у схил безіменної гори поблизу північного полюса, щоб виключити ризик їхнього неконтрольованого падіння на історичні місця посадок Apollo. Місце падіння назвали на честь першої американської астронавтки Саллі Райд.</p>
        ` 
    },
    lcross: { 
        tag: "МІСЯЦЬ • 2009", 
        title: "Ударний зонд LCROSS", 
        status: "Статус: Кратер Кабеус (Завершено)", 
        text: `
            <p>Місія LCROSS (Lunar Crater Observation and Sensing Satellite) була створена для остаточної відповіді на питання, чи є в полярних кратерах Місяця запаси водяного льоду. Вчені обрали кратер Кабеус поблизу південного полюса, дно якого мільярди років перебуває у вічній тіні при температурі близько -230 °C.</p>
            <p>9 жовтня 2009 року відпрацьований верхній ступінь ракети Atlas V (Centaur) масою понад 2 тонни врізався у дно кратера на швидкості 2,5 км/с, утворивши новий кратер діаметром близько 25 метрів і викинувши вгору шлейф пилу та пари.</p>
            <p>Сам апарат LCROSS летів слідом за розгінним блоком з інтервалом у чотири хвилини: його спектрометри проаналізували освітлений Сонцем стовп уламків і зафіксували наявність чистої водяної пари та льоду (близько 5,6% від маси викинутого ґрунту) буквально за секунди до того, як сам зонд теж врізався в поверхню Місяця.</p>
        ` 
    }
};
function openModal(id) {
    const data = storiesData[id];
    if (!data) return;
    document.getElementById('modal-tag').innerText = data.tag;
    document.getElementById('modal-title').innerText = data.title;
    document.getElementById('modal-status').innerText = data.status;
    document.getElementById('modal-body').innerHTML = data.text;
    document.getElementById('story-modal').style.display = 'flex';
}

function closeModal() { 
    document.getElementById('story-modal').style.display = 'none'; 
}

window.onclick = function(e) { 
    if (e.target === document.getElementById('story-modal')) closeModal(); 
};