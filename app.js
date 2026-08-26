// ==========================================
// 1. CONFIGURACIÓN DE BASE DE DATOS Y MODO OFFLINE (SIGO 7.0)
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, enableIndexedDbPersistence, collection, addDoc, getDocs, getDoc, updateDoc, deleteDoc, doc, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCsmWPpVM8hy5N1B0Pmhe-GHO_FbZAGIDw",
  authDomain: "sigo-tercera.firebaseapp.com",
  projectId: "sigo-tercera",
  storageBucket: "sigo-tercera.firebasestorage.app",
  messagingSenderId: "365813300933",
  appId: "1:365813300933:web:e8a24b4e6a88478c45baac",
  measurementId: "G-BB9JT7D318"
};

const app = initializeApp(firebaseConfig);
const dbCloud = getFirestore(app);
const MAPBOX_TOKEN = "pk.eyJ1IjoiY29rZXJsMyIsImEiOiJjbXFpcDNxMXEwNG9jMnBxMHByOHpwZHRwIn0.SrTD7F73glnBYS8Dtairmg";

try { enableIndexedDbPersistence(dbCloud); } catch (err) { console.warn("Modo offline no soportado: ", err.code); }

// ==========================================
// NUEVO: SISTEMA DE SESIÓN AYUDANTES Y TECLADO
// ==========================================
let pinAdminIngresado = "";
let criterioOrdenRanking = "cargo"; 

function aplicarPermisos() {
    const exp = localStorage.getItem("sigo_oficial_exp");
    const esOficial = exp && Date.now() < parseInt(exp);
    const btnPerfil = document.getElementById("btn-perfil");

    if (esOficial) {
        document.body.classList.add("modo-oficial");
        if(btnPerfil) {
            btnPerfil.innerHTML = `<i class="fa-solid fa-user-shield"></i> Perfil: Ayudante (Activo)`;
            btnPerfil.style.color = "var(--dorado)";
        }
    } else {
        document.body.classList.remove("modo-oficial");
        if(btnPerfil) {
            btnPerfil.innerHTML = `<i class="fa-solid fa-user"></i> Perfil: Voluntario`;
            btnPerfil.style.color = "rgba(255,255,255,0.4)";
        }
    }
    
    // Refrescar las vistas en pantalla para aplicar los bloqueos de fecha dinámicos
    if(document.getElementById('historial') && document.getElementById('historial').classList.contains('active')) cargarHistorial();
    if(document.getElementById('estadisticas') && document.getElementById('estadisticas').classList.contains('active')) actualizarDashboard();
    if(document.getElementById('personal') && document.getElementById('personal').classList.contains('active')) cargarRankingPersonal();
    
    // Si la ficha está abierta, refrescarla en vivo
    if(document.getElementById('modal-ficha-personal') && document.getElementById('modal-ficha-personal').style.display === "block" && bomberoFichaActual) {
        abrirFichaPersonal(bomberoFichaActual);
    }
}

setInterval(() => {
    const exp = localStorage.getItem("sigo_oficial_exp");
    if (exp && Date.now() > parseInt(exp)) {
        localStorage.removeItem("sigo_oficial_exp");
        aplicarPermisos();
        alert("🔒 La sesión de Ayudante ha caducado por inactividad (30 minutos).");
        location.reload();
    }
}, 30000);

window.abrirPadAdmin = function() {
    const exp = localStorage.getItem("sigo_oficial_exp");
    if (exp && Date.now() < parseInt(exp)) {
        if(confirm("¿Cerrar la sesión de Ayudante y volver a Voluntario?")) {
            localStorage.removeItem("sigo_oficial_exp");
            aplicarPermisos();
            location.reload();
        }
        return;
    }
    pinAdminIngresado = "";
    actualizarAdminDots();
    document.getElementById("admin-pin-pad").classList.add("active");
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('open');
}

window.cerrarPadAdmin = function() { document.getElementById("admin-pin-pad").classList.remove("active"); }

window.pressAdminKey = function(num) {
    if (pinAdminIngresado.length < 5) {
        pinAdminIngresado += num;
        actualizarAdminDots();
    }
    if (pinAdminIngresado.length === 5) setTimeout(verificarAdminPin, 150);
}

window.deleteAdminKey = function() {
    if (pinAdminIngresado.length > 0) {
        pinAdminIngresado = pinAdminIngresado.slice(0, -1);
        actualizarAdminDots();
    }
}

window.clearAdminPin = function() { pinAdminIngresado = ""; actualizarAdminDots(); }

function actualizarAdminDots() {
    const dots = document.querySelectorAll("#admin-pin-indicators .dot");
    dots.forEach((dot, index) => {
        if (index < pinAdminIngresado.length) dot.classList.add("filled");
        else dot.classList.remove("filled");
    });
}

// NUEVA FUNCIÓN DE VERIFICACIÓN BLINDADA
async function verificarAdminPin() {
    try {
        // Vamos a Firebase a buscar el PIN real
        const docRef = doc(dbCloud, "configuracion", "admin");
        const docSnap = await getDoc(docRef);
        
        if (docSnap.exists() && docSnap.data().pin === pinAdminIngresado) {
            // PIN Correcto
            localStorage.setItem("sigo_oficial_exp", Date.now() + (30 * 60 * 1000));
            cerrarPadAdmin();
            aplicarPermisos();
            alert("✅ Modo Ayudante Activado por 30 minutos.");
        } else {
            // PIN Incorrecto
            falloPin();
        }
    } catch(e) {
        alert("Error de conexión al verificar el PIN.");
        falloPin();
    }
}

function falloPin() {
    const indicators = document.getElementById("admin-pin-indicators");
    indicators.classList.add("error");
    setTimeout(() => {
        indicators.classList.remove("error");
        clearAdminPin();
    }, 400);
}

// ==========================================
// 2. DATOS INSTITUCIONALES TERCERA COMPAÑÍA
// ==========================================
const DatosClaves = {
    emergencias: [ 
        "10-0 Llamado estructural", "10-1 Fuego en vehículos", "10-2 Fuego en pastizales/bosques", 
        "10-3 Rescate simple", "10-4 Accidentes vehiculares", "10-5 Derrame químico", 
        "10-6 Emanación de químicos", "10-7 Llamado eléctrico", "10-8 No clasificado", 
        "10-9 Otros servicios", "10-10 Llamado a escombros", "10-12 Apoyo a otros cuerpos", 
        "10-14 Accidente aéreo", "10-15 Simulacro", "10-17 Inundación" 
    ],
    actividadesInternas: ["Sesión de Compañía", "Sesión Extraordinaria", "Junta de Oficiales", "Ejercicio de Compañía", "Otra (Especificar)"],
    carrosApoyo: ["B-1", "BT-1", "Z-1", "B-2", "BX-2"],
    cargosJuntaOficiales: [ 
        "Director", "Secretario", "Secretaria", "Tesorera", "Pro Tesorera", "Pro Tesorero", "Pro Secretaria", 
        "Pro Secretario", "Capitán", "Teniente 1°", "Teniente 2°", "Teniente 3°", "Ayudante", "Ayudante 2°" 
    ],
    latBase: -38.74465,
    lonBase: -72.95221,
    nominaOficial: [
        { nombre: "José Luis Vera Levio", cargo: "Director" },
        { nombre: "José Arturo Michael Contreras", cargo: "Director Honorario" },
        { nombre: "Juan Alejandro Valdebenito Canales", cargo: "ViceSuperintendente" },
        { nombre: "María Soledad Tamayo Verdugo", cargo: "Secretaria General" },
        { nombre: "Daniela Del Pilar Huenuman Lefiman", cargo: "Pro Tesorera General" },
        { nombre: "Luis Aroldo Reyes Gajardo", cargo: "Bombero Honorario" },
        { nombre: "Oscar Muñoz Ortiz", cargo: "Bombero Honorario" },
        { nombre: "Francisco Aurelio Jara Sánchez", cargo: "Bombero Honorario" },
        { nombre: "Miguel Ángel Barriga Barrera", cargo: "Bombero Honorario" },
        { nombre: "Leonardo Jacob Hernández Valle", cargo: "Bombero Honorario" },
        { nombre: "Sergio Villagrán Morales", cargo: "Bombero Honorario" },
        { nombre: "Guillermo Ojeda Melgarejo", cargo: "Bombero Honorario" },
        { nombre: "Gabriel Alejandro Millar Barra", cargo: "Capitán" },
        { nombre: "Alexis Edwardr Sepúlveda Peña", cargo: "Teniente 1°" },
        { nombre: "Felipe Andrés Povea Saez", cargo: "Teniente 2°" },
        { nombre: "Brayan Enrique Huina Huechuqueo", cargo: "Teniente 3°" },
        { nombre: "Soledad Angélica Friz Friz", cargo: "Secretaria" },
        { nombre: "Gabriela Francisca Valdebenito Jara", cargo: "Pro Secretaria" },
        { nombre: "Massiel Edith Jara Jara", cargo: "Tesorera" },
        { nombre: "Andrea Loreto Gabriela So Díaz Muñoz", cargo: "Pro Tesorero" },
        { nombre: "Alfredo Segundo San Martín Lizama", cargo: "Maquinista" },
        { nombre: "Oscar Hernán Basco Oliva", cargo: "Maquinista 2°" },
        { nombre: "Maximo Antonio Hidalgo Orellana", cargo: "Ayudante" },
        { nombre: "Jorge Antonio Rosales Landeros", cargo: "Ayudante 2°" },
        { nombre: "Mónica Mariliz Muñoz Ortiz", cargo: "Bombera Compañía" },
        { nombre: "Abel Alejandro Espinoza Cañete", cargo: "Bombero Compañía" },
        { nombre: "Juan Carlos Chamorro Guajardo", cargo: "Bombero Compañía" },
        { nombre: "Oscar Gabriel Fuentealba Oliva", cargo: "Bombero Compañía" },
        { nombre: "Fernando Moisés Gonzalez Cifuentes", cargo: "Bombero Compañía" },
        { nombre: "Sebastián Felipe González Tamayo", cargo: "Bombero Compañía" },
        { nombre: "Victor Nibaldo Riffo Suazo", cargo: "Bombero Compañía" },
        { nombre: "Daniela Andrea Castillo Quinchaleo", cargo: "Bombera Compañía" },
        { nombre: "Juan Isaac Colipi Huilipan", cargo: "Bombero Compañía" },
        { nombre: "Damariz Paulina Soto Fuentes", cargo: "Bombera Compañía" },
        { nombre: "Jorge Alberto Rudolph Delgado-Perez", cargo: "Bombero Compañía" },
        { nombre: "Alonso Julian Ignacio Lincoñir Herrera", cargo: "Bombero Compañía" },
        { nombre: "Eduardo Eliseo Olavarria Fischer", cargo: "Bombero Compañía" },
        { nombre: "Eduardo Alejandro Lepiqueo Levinao", cargo: "Bombero Compañía" },
        { nombre: "Luis Jesus Hidalgo Piutrin", cargo: "Bombero Compañía" },
        { nombre: "Juan Pablo Valenzuela Toledo", cargo: "Bombero Compañía" }
    ]
};

// ==========================================
// 3. VARIABLES GLOBALES Y SISTEMA DE RADIO
// ==========================================
let mapaGlobal = null;
let mapaSeleccion = null;
let marcadorSeleccion = null;
let graficoEmergenciasInstancia = null;

let MEMORIA_BOMBEROS = [];
let MEMORIA_MAQUINAS = [];
let MEMORIA_REPORTES = [];
let MEMORIA_INVENTARIO = [];
let MEMORIA_LICENCIAS = [];

let reporteTemporal = {
    actividad: "", direccion: "", fecha: null, esActividadInterna: false,
    maquinasUtilizadas: [], latitud: DatosClaves.latBase, longitud: DatosClaves.lonBase,
    estadoUbicacion: "Servicio sin ubicación confirmada", ubicacionEncontrada: false,
    asistentesNombres: [], licenciasNombres: [], faltasNombres: [], claveFinal: "",
    estadoServicio: "Finalizado", pinEmergencia: "", esDoble: false
};

async function iniciarSistema() {
    const subMenu = document.querySelector(".subtitle-menu");
    if(subMenu) subMenu.innerText = "SIGO Build 7.0";

    aplicarPermisos();
    await inicializarDatosEnNube();
    conectarRadioEnTiempoReal(); 

    if (new URLSearchParams(window.location.search).get("licencia") === "1") {
        abrirModalLicenciaDirecto();
    }
}
iniciarSistema();

let yaAbrioLicenciaDirecta = false;
function abrirModalLicenciaDirecto() {
    if (yaAbrioLicenciaDirecta) return;
    if (MEMORIA_BOMBEROS.length === 0 && DatosClaves.nominaOficial.length === 0) return;
    yaAbrioLicenciaDirecta = true;

    const menuBtn = document.getElementById("menu-toggle");
    if (menuBtn) menuBtn.style.display = "none";
    const sidebar = document.getElementById("sidebar");
    if (sidebar) sidebar.style.display = "none";

    const hero = document.querySelector("#inicio .hero");
    if (hero) hero.style.display = "none";

    abrirModalLicencia();

    const cerrarX = document.querySelector("#modal-licencia .close-btn");
    if (cerrarX) cerrarX.style.display = "none";
}

async function inicializarDatosEnNube() {
    try {
        const maquinasSnap = await getDocs(collection(dbCloud, "maquinas"));
        const maquinasGuardadas = maquinasSnap.docs.map(d => d.data().nomenclatura);
        if (!maquinasGuardadas.includes("B-3")) await addDoc(collection(dbCloud, "maquinas"), { nomenclatura: "B-3", estado: "Operativo" });
        if (!maquinasGuardadas.includes("BX-3")) await addDoc(collection(dbCloud, "maquinas"), { nomenclatura: "BX-3", estado: "Operativo" });
        if (!maquinasGuardadas.includes("G-3")) await addDoc(collection(dbCloud, "maquinas"), { nomenclatura: "G-3", estado: "Operativo" });

        const bomberosSnap = await getDocs(collection(dbCloud, "bomberos"));
        if (bomberosSnap.empty) {
            for (let b of DatosClaves.nominaOficial) {
                await addDoc(collection(dbCloud, "bomberos"), { nombre: b.nombre, cargo: b.cargo, grado: "Voluntario" });
            }
        }
    } catch(e) { console.warn("Modo offline activado"); }
}

function conectarRadioEnTiempoReal() {
    onSnapshot(query(collection(dbCloud, "reportes"), orderBy("fecha", "desc")), (snapshot) => {
        MEMORIA_REPORTES = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        revisarEmergenciasEnCurso(); 
        if(document.getElementById('historial').classList.contains('active')) cargarHistorial();
        if(document.getElementById('mapa').classList.contains('active')) inicializarMapaGlobal();
        if(document.getElementById('estadisticas').classList.contains('active')) actualizarDashboard();
        if(document.getElementById('personal').classList.contains('active')) cargarRankingPersonal();
        if(document.getElementById('inventario').classList.contains('active')) cargarInventarioCarros();
    });

    onSnapshot(collection(dbCloud, "maquinas"), (snapshot) => {
        let todas = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
        MEMORIA_MAQUINAS = [...new Map(todas.map(m => [m.nomenclatura, m])).values()];
        const ordenMaquinas = {"B-3": 1, "BX-3": 2, "G-3": 3};
        MEMORIA_MAQUINAS.sort((a, b) => (ordenMaquinas[a.nomenclatura] || 99) - (ordenMaquinas[b.nomenclatura] || 99));
        if(document.getElementById('inventario').classList.contains('active')) cargarInventarioCarros();
    });

    onSnapshot(collection(dbCloud, "bomberos"), (snapshot) => {
        let todos = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        MEMORIA_BOMBEROS = [...new Map(todos.map(b => [b.nombre, b])).values()];
        MEMORIA_BOMBEROS.sort((a, b) => {
            const indexA = DatosClaves.nominaOficial.findIndex(bom => bom.nombre === a.nombre);
            const indexB = DatosClaves.nominaOficial.findIndex(bom => bom.nombre === b.nombre);
            return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
        });
        if(document.getElementById('personal').classList.contains('active')) cargarRankingPersonal();
    });

    onSnapshot(collection(dbCloud, "inventario"), (snapshot) => {
        MEMORIA_INVENTARIO = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
        if(document.getElementById('modal-detalle-maquina').style.display === "block" && maquinaEditandoId) {
            const exp = localStorage.getItem("sigo_oficial_exp");
            const esOficial = exp && Date.now() < parseInt(exp);
            renderizarItemsMaquina(maquinaEditandoId, esOficial);
        }
    });

    onSnapshot(collection(dbCloud, "licencias"), (snapshot) => {
        MEMORIA_LICENCIAS = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
        if(document.getElementById('licencias-vista') && document.getElementById('licencias-vista').classList.contains('active')) {
            cargarListaLicencias();
        }
    });
}

// ==========================================
// 4. LÓGICA DE MENÚ Y NAVEGACIÓN
// ==========================================
window.toggleMenu = function() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebar-overlay').classList.toggle('open');
}

window.switchView = function(viewId, element) {
    document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    element.classList.add('active');
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('open');

    if (viewId === 'historial') cargarHistorial();
    if (viewId === 'mapa') inicializarMapaGlobal();
    if (viewId === 'estadisticas') actualizarDashboard();
    if (viewId === 'personal') cargarRankingPersonal();
    if (viewId === 'inventario') cargarInventarioCarros();
    if (viewId === 'licencias-vista') cargarListaLicencias();
}

// ==========================================
// 5. ASISTENTE: NUEVO SERVICIO Y AUTOREGISTRO
// ==========================================
window.abrirModal = function(id) { document.getElementById(id).style.display = "block"; }
window.cerrarModal = function(id) { document.getElementById(id).style.display = "none"; }

window.volverPaso1 = function() {
    document.querySelectorAll(".step").forEach(s => s.classList.remove("active"));
    document.getElementById("paso-1").classList.add("active");
    document.getElementById("modal-titulo").innerText = "Paso 1: Datos Operativos";
}

window.volverPaso2 = function() {
    document.querySelectorAll(".step").forEach(s => s.classList.remove("active"));
    document.getElementById("paso-2").classList.add("active");
    document.getElementById("modal-titulo").innerText = "Paso 2: Ubicación";
    setTimeout(() => { if (mapaSeleccion) mapaSeleccion.invalidateSize(); }, 300);
}

window.alCambiarActividad = function() {
    const sel = document.getElementById("sel-actividad");
    const inpOtra = document.getElementById("inp-actividad-otra");
    const contDoble = document.getElementById("contenedor-asistencia-doble");
    const chkDoble = document.getElementById("chk-asistencia-doble");
    const chkObligatoria = document.getElementById("chk-asistencia-obligatoria");

    if (sel.value === "Otra (Especificar)") {
        inpOtra.style.display = "block";
        inpOtra.focus();
    } else {
        inpOtra.style.display = "none";
    }

    if (sel.options.length > 0 && sel.selectedIndex >= 0) {
        const optgroup = sel.options[sel.selectedIndex].parentNode.label;
        if (optgroup === "Actividades Internas") {
            contDoble.style.display = "block";
            chkObligatoria.checked = true;
        } else {
            contDoble.style.display = "none";
            chkDoble.checked = false;
            chkObligatoria.checked = true;
        }
    }
}

window.irPaso1 = function() {
    reporteTemporal = {
        actividad: "", direccion: "", fecha: null, esActividadInterna: false,
        maquinasUtilizadas: [], latitud: DatosClaves.latBase, longitud: DatosClaves.lonBase,
        estadoUbicacion: "Servicio sin ubicación confirmada", ubicacionEncontrada: false,
        asistentesNombres: [], licenciasNombres: [], faltasNombres: [], claveFinal: "",
        estadoServicio: "Finalizado", pinEmergencia: "", esDoble: false
    };
    
    const sel = document.getElementById("sel-actividad");
    let opcionesEmergencias = DatosClaves.emergencias.map(e => `<option value="${e}">${e}</option>`).join('');
    let opcionesInternas = DatosClaves.actividadesInternas.map(i => `<option value="${i}">${i}</option>`).join('');
    sel.innerHTML = `<optgroup label="Emergencias">${opcionesEmergencias}</optgroup><optgroup label="Actividades Internas">${opcionesInternas}</optgroup>`;

    const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById("inp-fecha").value = now.toISOString().slice(0,16);

    const inpFecha = document.getElementById("inp-fecha");
    const exp = localStorage.getItem("sigo_oficial_exp");
    const esOficial = exp && Date.now() < parseInt(exp);
    if (esOficial) {
        inpFecha.removeAttribute("min");
        inpFecha.removeAttribute("max");
    } else {
        const ayer = new Date(); ayer.setDate(ayer.getDate() - 1); ayer.setHours(0,0,0,0);
        ayer.setMinutes(ayer.getMinutes() - ayer.getTimezoneOffset());
        inpFecha.min = ayer.toISOString().slice(0,16);
        inpFecha.max = now.toISOString().slice(0,16);
    }

    document.getElementById("inp-direccion").value = "";
    
    document.getElementById("inp-actividad-otra").style.display = "none";
    document.getElementById("inp-actividad-otra").value = "";
    document.getElementById("contenedor-asistencia-doble").style.display = "none";
    document.getElementById("chk-asistencia-doble").checked = false;

    let maquinas = MEMORIA_MAQUINAS.length > 0 ? MEMORIA_MAQUINAS : [{nomenclatura: "B-3"}, {nomenclatura: "BX-3"}, {nomenclatura: "G-3"}];
    document.getElementById("contenedor-maquinas").innerHTML = maquinas.map(m => `<label class="checkbox-item"><input type="checkbox" value="${m.nomenclatura}" class="chk-maquina"> ${m.nomenclatura}</label>`).join('');

    document.getElementById("contenedor-apoyo").innerHTML = DatosClaves.carrosApoyo.map(m => 
        `<label class="checkbox-item"><input type="checkbox" value="${m}" class="chk-apoyo"> ${m}</label>`
    ).join('');
    document.getElementById("inp-otras-maquinas").value = "";

    abrirModal('modal-servicio');
    volverPaso1();
}

window.irPaso2 = async function() {
    const sel = document.getElementById("sel-actividad");
    let act = sel.value;
    
    const optgroup = sel.options[sel.selectedIndex].parentNode.label;
    reporteTemporal.esActividadInterna = (optgroup === "Actividades Internas");

    if (act === "Otra (Especificar)") {
        act = document.getElementById("inp-actividad-otra").value;
        if (!act.trim()) { alert("Por favor, especifica el nombre de la actividad."); return; }
    }

    reporteTemporal.actividad = act;
    reporteTemporal.esDoble = document.getElementById("chk-asistencia-doble").checked;
    reporteTemporal.asistenciaObligatoria = reporteTemporal.esActividadInterna ? document.getElementById("chk-asistencia-obligatoria").checked : false;
    
    reporteTemporal.direccion = document.getElementById("inp-direccion").value;
    reporteTemporal.fecha = document.getElementById("inp-fecha").value;

    const expCheck = localStorage.getItem("sigo_oficial_exp");
    const esOficialCheck = expCheck && Date.now() < parseInt(expCheck);
    if (!esOficialCheck) {
        const fechaElegida = new Date(reporteTemporal.fecha);
        const ahora = new Date();
        const ayerLimite = new Date(); ayerLimite.setDate(ayerLimite.getDate() - 1); ayerLimite.setHours(0,0,0,0);
        if (fechaElegida < ayerLimite || fechaElegida > ahora) {
            alert("Como voluntario solo puedes registrar servicios del día de hoy o de ayer. Si necesitas registrar una fecha anterior, pide a un Ayudante que lo haga.");
            return;
        }
    }

    reporteTemporal.pinEmergencia = Math.floor(100 + Math.random() * 900).toString();

    let maquinasTercera = Array.from(document.querySelectorAll(".chk-maquina:checked")).map(cb => cb.value);
    let maquinasApoyo = Array.from(document.querySelectorAll(".chk-apoyo:checked")).map(cb => cb.value);
    reporteTemporal.maquinasUtilizadas = maquinasTercera.concat(maquinasApoyo);

    const otrasMaquinas = document.getElementById("inp-otras-maquinas").value;
    if (otrasMaquinas.trim() !== "") {
        const extras = otrasMaquinas.split(',').map(m => m.trim().toUpperCase()).filter(m => m !== "");
        reporteTemporal.maquinasUtilizadas = reporteTemporal.maquinasUtilizadas.concat(extras);
    }

    if (!reporteTemporal.direccion.trim()) { alert("Ingresa una dirección."); return; }

    document.querySelectorAll(".step").forEach(s => s.classList.remove("active"));
    document.getElementById("paso-2").classList.add("active");
    document.getElementById("modal-titulo").innerText = "Paso 2: Ubicación";
    document.getElementById("txt-direccion-confirmar").innerText = reporteTemporal.direccion;
    document.getElementById("txt-estado-gps").innerHTML = `<i class='fa-solid fa-spinner fa-spin'></i> Buscando en Mapbox...`;

    if (reporteTemporal.esActividadInterna) {
        document.getElementById("footer-emergencia").style.display = "none";
        document.getElementById("footer-interna").style.display = "flex";
    } else {
        document.getElementById("footer-emergencia").style.display = "flex";
        document.getElementById("footer-interna").style.display = "none";
    }

    let lat = DatosClaves.latBase; let lon = DatosClaves.lonBase;
    try {
        const urlBusqueda = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(reporteTemporal.direccion + ", Nueva Imperial, Araucanía, Chile")}.json?access_token=${MAPBOX_TOKEN}&limit=1`;
        const response = await fetch(urlBusqueda);
        const data = await response.json();
        
        if(data && data.features && data.features.length > 0) {
            lon = parseFloat(data.features[0].center[0]);
            lat = parseFloat(data.features[0].center[1]);
            reporteTemporal.latitud = lat; reporteTemporal.longitud = lon;
            reporteTemporal.ubicacionEncontrada = true;
            reporteTemporal.estadoUbicacion = "Ubicación encontrada por Mapbox";
            document.getElementById("txt-estado-gps").innerHTML = `<i class="fa-solid fa-check"></i> Dirección encontrada`;
            document.getElementById("txt-estado-gps").style.color = "var(--verde-ok)";
        } else {
            document.getElementById("txt-estado-gps").innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Dirección inexacta.`;
            document.getElementById("txt-estado-gps").style.color = "var(--dorado)";
        }
    } catch(e) {
        document.getElementById("txt-estado-gps").innerHTML = `<i class="fa-solid fa-satellite-dish"></i> Ubicando...`;
    }

    setTimeout(() => {
        if (!mapaSeleccion) {
            mapaSeleccion = L.map('mapa-seleccion').setView([lat, lon], 16);
            L.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/256/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`, { attribution: '© Mapbox' }).addTo(mapaSeleccion);
            marcadorSeleccion = L.marker([lat, lon], {draggable: true}).addTo(mapaSeleccion);
            marcadorSeleccion.on('dragend', function(e) {
                const pos = marcadorSeleccion.getLatLng();
                reporteTemporal.latitud = pos.lat; reporteTemporal.longitud = pos.lng;
                reporteTemporal.ubicacionEncontrada = true;
                reporteTemporal.estadoUbicacion = "Ubicación ajustada en mapa táctico";
                document.getElementById("txt-estado-gps").innerHTML = `<i class="fa-solid fa-check"></i> Coordenada fijada`;
                document.getElementById("txt-estado-gps").style.color = "var(--verde-ok)";
            });
        } else {
            mapaSeleccion.setView([lat, lon], 16);
            marcadorSeleccion.setLatLng([lat, lon]);
        }
        mapaSeleccion.invalidateSize();
    }, 500);
}

window.obtenerGPSDispositivo = function() {
    const txt = document.getElementById("txt-estado-gps");
    txt.innerHTML = "<i class='fa-solid fa-spinner fa-spin'></i> Buscando satélite...";
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            reporteTemporal.latitud = pos.coords.latitude;
            reporteTemporal.longitud = pos.coords.longitude;
            reporteTemporal.ubicacionEncontrada = true;
            reporteTemporal.estadoUbicacion = "GPS Satelital Confirmado";
            if(mapaSeleccion && marcadorSeleccion) {
                mapaSeleccion.setView([pos.coords.latitude, pos.coords.longitude], 17);
                marcadorSeleccion.setLatLng([pos.coords.latitude, pos.coords.longitude]);
            }
            txt.innerHTML = `<i class="fa-solid fa-satellite-dish"></i> GPS Confirmado`;
            txt.style.color = "var(--verde-ok)";
        }, err => { txt.innerHTML = "❌ GPS Denegado"; txt.style.color = "var(--rojo-emergencia)"; }, { enableHighAccuracy: true });
    }
}

window.guardarEnCurso = async function() {
    reporteTemporal.estadoServicio = "En Curso";
    try {
        await addDoc(collection(dbCloud, "reportes"), {...reporteTemporal, fecha: new Date(reporteTemporal.fecha).getTime()});
        cerrarModal('modal-servicio');
        alert("Emergencia iniciada. El personal ya puede registrar su asistencia desde sus teléfonos. (PIN de seguridad en caso de fallo de GPS: " + reporteTemporal.pinEmergencia + ")");
    } catch(e) {
        alert("Error de conexión.");
    }
}

window.irPaso3 = function() {
    document.querySelectorAll(".step").forEach(s => s.classList.remove("active"));
    document.getElementById("paso-3").classList.add("active");
    document.getElementById("modal-titulo").innerText = "Paso 3: Asistencia";
    document.getElementById("txt-resumen-servicio").innerText = `${reporteTemporal.actividad} | ${reporteTemporal.direccion}`;

    let bomberosDB = MEMORIA_BOMBEROS.length > 0 ? MEMORIA_BOMBEROS : DatosClaves.nominaOficial;
    
    if (reporteTemporal.actividad === "Junta de Oficiales") {
        bomberosDB = bomberosDB.filter(b => DatosClaves.cargosJuntaOficiales.includes(b.cargo));
    }

    const html = bomberosDB.map(b => {
        let opcionesSegmentadas = "";
        let tieneLicencia = false;

        if (reporteTemporal.esActividadInterna && reporteTemporal.asistenciaObligatoria) {
            // Revisión automática de licencias coincidentes
            const fechaActividad = new Date(reporteTemporal.fecha);
            fechaActividad.setHours(0,0,0,0);
            const timeActividad = fechaActividad.getTime();

            tieneLicencia = MEMORIA_LICENCIAS.some(lic => {
                // Si la licencia fue rechazada explícitamente, ignorarla para la asistencia.
                if (lic.estado === "Rechazada") return false;
                if (lic.nombre !== b.nombre) return false;
                const fInicio = new Date(lic.fechaInicio + "T00:00:00").getTime();
                const fFin = new Date(lic.fechaTermino + "T23:59:59").getTime();
                return timeActividad >= fInicio && timeActividad <= fFin;
            });
            
            opcionesSegmentadas = `
                <div class="segmented-control">
                    <div class="segment-btn ${!tieneLicencia ? 'active' : ''}" data-val="Falta" onclick="cambiarEstadoAsistencia(this, 'Falta')">Falta</div>
                    <div class="segment-btn" data-val="Asiste" onclick="cambiarEstadoAsistencia(this, 'Asiste')">Asiste</div>
                    <div class="segment-btn ${tieneLicencia ? 'active' : ''}" data-val="Licencia" onclick="cambiarEstadoAsistencia(this, 'Licencia')">Licencia</div>
                </div>`;
        } else if (reporteTemporal.esActividadInterna) {
            opcionesSegmentadas = `
                <div class="segmented-control">
                    <div class="segment-btn active" data-val="No Asistió" onclick="cambiarEstadoAsistencia(this, 'No Asistió')">No Asistió</div>
                    <div class="segment-btn" data-val="Asiste" onclick="cambiarEstadoAsistencia(this, 'Asiste')">Asiste</div>
                </div>`;
        } else {
            opcionesSegmentadas = `
                <div class="segmented-control">
                    <div class="segment-btn active" data-val="No Participó" onclick="cambiarEstadoAsistencia(this, 'No Participó')">No Participó</div>
                    <div class="segment-btn" data-val="Participó" onclick="cambiarEstadoAsistencia(this, 'Participó')">Participó</div>
                </div>`;
        }
        
        let bgClass = tieneLicencia && reporteTemporal.esActividadInterna ? "bg-licencia" : "";

        return `<div class="bombero-card ${bgClass}" data-nombre="${b.nombre}">
                    <div class="bombero-info"><span class="bombero-nombre">${b.nombre}</span><span class="bombero-cargo">${b.cargo}</span></div>
                    ${opcionesSegmentadas}
                </div>`;
    }).join('');
    
    document.getElementById("lista-asistencia").innerHTML = html;
}

window.cambiarEstadoAsistencia = function(elementoClickeado, valor) {
    const contenedor = elementoClickeado.parentElement;
    contenedor.querySelectorAll('.segment-btn').forEach(btn => btn.classList.remove('active'));
    elementoClickeado.classList.add('active');
    const tarjeta = contenedor.closest('.bombero-card');
    tarjeta.classList.remove('bg-asiste', 'bg-licencia');
    if (valor === 'Participó' || valor === 'Asiste') tarjeta.classList.add('bg-asiste');
    else if (valor === 'Licencia') tarjeta.classList.add('bg-licencia');
};

window.guardarReporteFinal = async function() {
    reporteTemporal.estadoServicio = "Finalizado";
    reporteTemporal.asistentesNombres = []; reporteTemporal.licenciasNombres = []; reporteTemporal.faltasNombres = [];
    
    document.querySelectorAll("#lista-asistencia .bombero-card").forEach(card => {
        const nombre = card.getAttribute("data-nombre");
        const estado = card.querySelector(".segment-btn.active").getAttribute("data-val");
        
        if (reporteTemporal.esActividadInterna && reporteTemporal.asistenciaObligatoria) {
            if (estado === "Asiste") reporteTemporal.asistentesNombres.push(nombre);
            else if (estado === "Licencia") reporteTemporal.licenciasNombres.push(nombre);
            else if (estado === "Falta") reporteTemporal.faltasNombres.push(nombre);
        } else if (reporteTemporal.esActividadInterna) {
            if (estado === "Asiste") reporteTemporal.asistentesNombres.push(nombre);
        } else {
            if (estado === "Participó") reporteTemporal.asistentesNombres.push(nombre);
        }
    });

    try {
        await addDoc(collection(dbCloud, "reportes"), {...reporteTemporal, fecha: new Date(reporteTemporal.fecha).getTime()});
        cerrarModal('modal-servicio');
        volverPaso1();
        document.getElementById("inp-direccion").value = "";
        document.querySelectorAll(".chk-maquina").forEach(c => c.checked = false);
        document.querySelectorAll(".chk-apoyo").forEach(c => c.checked = false);
        document.getElementById("inp-otras-maquinas").value = "";
        alert("¡Reporte guardado y finalizado correctamente!");
    } catch(e) { alert("Error de conexión."); }
}

// ==========================================
// 6. LÓGICA DEL ESCUDO DE AUTOREGISTRO Y ANDROID
// ==========================================
let emergenciaActivaId = null;

let deferredPrompt;
const btnInstalar = document.getElementById('btn-instalar-app');

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if(btnInstalar) btnInstalar.style.display = 'inline-flex';
});

if(btnInstalar) {
    btnInstalar.addEventListener('click', async () => {
        if (deferredPrompt !== null) {
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') { console.log('App instalada'); }
            deferredPrompt = null;
            btnInstalar.style.display = 'none';
        }
    });
}

function revisarEmergenciasEnCurso() {
    const emergenciasAbiertas = MEMORIA_REPORTES.filter(r => r.estadoServicio === "En Curso");
    const banner = document.getElementById("banner-emergencia");
    
    if (emergenciasAbiertas.length > 0) {
        const e = emergenciasAbiertas[0]; 
        emergenciaActivaId = e.id;
        banner.style.display = "block";
        banner.innerHTML = `
            <h3>🚨 ${e.actividad.toUpperCase()} EN CURSO 🚨</h3>
            <p>${e.direccion}</p>
            <button class="btn-primary" style="background: white; color: var(--rojo-emergencia); width: 100%;" onclick="abrirAutoregistro()"><i class="fa-solid fa-clipboard-user"></i> Registrar Mi Asistencia</button>
        `;
    } else {
        banner.style.display = "none";
        emergenciaActivaId = null;
    }
}

window.abrirAutoregistro = function() {
    const bomberos = MEMORIA_BOMBEROS.length > 0 ? MEMORIA_BOMBEROS : DatosClaves.nominaOficial;
    const sel = document.getElementById("sel-autoregistro-nombre");
    sel.innerHTML = `<option value="">-- Selecciona tu nombre --</option>` + bomberos.map(b => `<option value="${b.nombre}">${b.nombre}</option>`).join('');
    
    document.getElementById("txt-autoregistro-estado").innerText = "";
    document.getElementById("caja-pin-autoregistro").style.display = "none";
    document.getElementById("inp-autoregistro-pin").value = "";
    
    abrirModal("modal-autoregistro");
}

function calcularDistancia(lat1, lon1, lat2, lon2) {
    const R = 6371e3; 
    const phi1 = lat1 * Math.PI/180;
    const phi2 = lat2 * Math.PI/180;
    const deltaPhi = (lat2-lat1) * Math.PI/180;
    const deltaLambda = (lon2-lon1) * Math.PI/180;

    const a = Math.sin(deltaPhi/2) * Math.sin(deltaPhi/2) + Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLambda/2) * Math.sin(deltaLambda/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; 
}

window.procesarAutoregistro = function() {
    const nombre = document.getElementById("sel-autoregistro-nombre").value;
    if (!nombre) { alert("Selecciona tu nombre primero."); return; }
    
    const pinIngresado = document.getElementById("inp-autoregistro-pin").value;
    const emergencia = MEMORIA_REPORTES.find(r => r.id === emergenciaActivaId);
    const txtEstado = document.getElementById("txt-autoregistro-estado");
    
    if (document.getElementById("caja-pin-autoregistro").style.display === "block") {
        if (pinIngresado === emergencia.pinEmergencia) {
            confirmarAsistenciaFirebase(emergenciaActivaId, nombre);
        } else {
            txtEstado.innerHTML = "❌ PIN INCORRECTO. Pregunta la clave al Oficial a cargo.";
            txtEstado.style.color = "var(--rojo-emergencia)";
        }
        return;
    }

    txtEstado.innerHTML = "<i class='fa-solid fa-spinner fa-spin'></i> Calculando telemetría GPS...";
    txtEstado.style.color = "var(--texto-blanco)";
    
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(pos => {
            const miLat = pos.coords.latitude;
            const miLon = pos.coords.longitude;
            
            const distCuartel = calcularDistancia(miLat, miLon, DatosClaves.latBase, DatosClaves.lonBase);
            const distEmergencia = calcularDistancia(miLat, miLon, emergencia.latitud, emergencia.longitud);
            
            if (distCuartel <= 40 || distEmergencia <= 100) {
                confirmarAsistenciaFirebase(emergenciaActivaId, nombre);
            } else {
                document.getElementById("caja-pin-autoregistro").style.display = "block";
                document.getElementById("btn-procesar-asistencia").innerHTML = "<i class='fa-solid fa-key'></i> Validar PIN";
                txtEstado.innerHTML = "";
            }
        }, err => { 
            document.getElementById("caja-pin-autoregistro").style.display = "block";
            document.getElementById("btn-procesar-asistencia").innerHTML = "<i class='fa-solid fa-key'></i> Validar PIN";
            txtEstado.innerHTML = "⚠️ GPS no disponible. Usa el PIN.";
            txtEstado.style.color = "var(--dorado)";
        }, { enableHighAccuracy: true });
    }
}

async function confirmarAsistenciaFirebase(idRep, nombreBombero) {
    try {
        const reporteRef = doc(dbCloud, "reportes", idRep);
        const r = MEMORIA_REPORTES.find(rep => rep.id === idRep);
        
        if (!r.asistentesNombres.includes(nombreBombero)) {
            const nuevaLista = [...r.asistentesNombres, nombreBombero];
            await updateDoc(reporteRef, { asistentesNombres: nuevaLista });
            
            document.getElementById("txt-autoregistro-estado").innerHTML = "✅ ¡Asistencia Operativa Registrada!";
            document.getElementById("txt-autoregistro-estado").style.color = "var(--verde-ok)";
            setTimeout(() => { cerrarModal("modal-autoregistro"); }, 2000);
        } else {
            alert("Ya estabas registrado in esta emergencia.");
            cerrarModal("modal-autoregistro");
        }
    } catch(e) { alert("Error al guardar asistencia. Revisa internet."); }
}

// ==========================================
// 7. HISTORIAL Y EDICIÓN
// ==========================================
function cargarHistorial() {
    const exp = localStorage.getItem("sigo_oficial_exp");
    const esOficial = exp && Date.now() < parseInt(exp);
    
    let reportes = MEMORIA_REPORTES;

    // BLOQUEO: Voluntarios solo ven el mes actual en el historial
    if (!esOficial) {
        const ahora = new Date();
        const mesActualStr = `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}`;
        reportes = reportes.filter(r => {
            const d = new Date(r.fecha);
            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` === mesActualStr;
        });
    }

    const html = reportes.map(r => {
        const d = new Date(r.fecha);
        const maquinas = r.maquinasUtilizadas && r.maquinasUtilizadas.length > 0 ? r.maquinasUtilizadas.join(", ") : "Sin Carro";
        
        const badgeDoble = r.esDoble ? `<span style="color: var(--dorado); font-size: 0.75rem; font-weight: bold; margin-left: 8px; padding: 2px 6px; border: 1px solid rgba(217, 178, 51, 0.4); border-radius: 6px; background: rgba(217, 178, 51, 0.1);"><i class="fa-solid fa-star"></i> x2</span>` : "";
        const tituloReclasificado = r.claveFinal ? `${r.actividad} <span style="color:var(--texto-gris); font-size: 0.85rem;"><br>➡️ Cambió a: <span style="color:var(--dorado);">${r.claveFinal}</span></span>` : r.actividad;
        const badgeEstado = r.estadoServicio === "En Curso" ? `<span class="badge badge-red" style="animation: pulsarBanner 2s infinite;">EN CURSO</span>` : "";

        return `
            <div class="card-item" onclick="verDetalleReporte('${r.id}')">
                <div class="card-header" style="align-items: flex-start;">
                    <span class="card-title">${tituloReclasificado} ${badgeDoble}</span>
                    <span class="card-date">${d.toLocaleDateString()} ${d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
                <div style="color: white; margin: 8px 0;">${r.direccion} ${badgeEstado}</div>
                <div class="card-body">
                    <span><span class="material-symbols-outlined" style="color: var(--rojo-emergencia); font-size: 1.2rem; vertical-align: text-bottom; margin-right: 4px;">fire_truck</span> ${maquinas}</span>
                    <span style="color: var(--verde-ok);"><i class="fa-solid fa-users"></i> ${r.asistentesNombres.length} Asistencias</span>
                </div>
            </div>`;
    }).join('');
    document.getElementById("lista-historial").innerHTML = html || "<p style='color: var(--texto-gris);'>No hay servicios registrados en este periodo.</p>";
}

window.verDetalleReporte = function(id) {
    const exp = localStorage.getItem("sigo_oficial_exp");
    const esOficial = exp && Date.now() < parseInt(exp);

    const r = MEMORIA_REPORTES.find(rep => rep.id === id);
    const d = new Date(r.fecha);
    
    const tituloDetalle = r.claveFinal ? `${r.actividad} <br><span style="color:var(--dorado); font-size: 1rem;">➡️ Reclasificado a: ${r.claveFinal}</span>` : r.actividad;
    const badgeDobleDetalle = r.esDoble ? `<div style="margin-bottom: 15px;"><span class="badge badge-gold"><i class="fa-solid fa-star"></i> Servicio con Asistencia y Falta Doble</span></div>` : "";

    let html = `
        <div class="info-box" style="margin-bottom: 20px;">
            <h3 style="color: white; margin-bottom: 5px;">${tituloDetalle}</h3>
            <p style="color: var(--texto-gris); font-size: 0.9rem;">${r.direccion}</p>
            <p style="color: var(--texto-gris); font-size: 0.9rem;">${d.toLocaleDateString()} a las ${d.toLocaleTimeString()}</p>
        </div>
        ${badgeDobleDetalle}
        <h4 style="color: var(--dorado); margin-bottom: 10px;">Asistentes Confirmados (${r.asistentesNombres.length})</h4>
        <div style="display:flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px;">
            ${r.asistentesNombres.map(n => `<span class="badge badge-green">${n}</span>`).join('')}
        </div>`;

    if(r.esActividadInterna) {
        html += `
            <h4 style="color: var(--dorado); margin-bottom: 10px;">Licencias (${r.licenciasNombres.length})</h4>
            <div style="display:flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px;">${r.licenciasNombres.map(n => `<span class="badge badge-gold">${n}</span>`).join('')}</div>
            <h4 style="color: var(--dorado); margin-bottom: 10px;">Faltas (${r.faltasNombres.length})</h4>
            <div style="display:flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px;">${r.faltasNombres.map(n => `<span class="badge badge-red">${n}</span>`).join('')}</div>`;
    }
    
    if(r.estadoServicio === "En Curso" && esOficial) {
        html += `<div style="text-align: center; margin-bottom: 15px; padding: 10px; background: rgba(255, 77, 77, 0.2); border-radius: 10px; border: 1px solid var(--rojo-emergencia);">
            <p style="color: white; font-weight: bold;">SERVICIO EN CURSO</p>
            <p style="color: var(--dorado); font-size: 0.9rem;">PIN Autoregistro: ${r.pinEmergencia}</p>
        </div>`;
    }
    
    html += `
        <div class="req-oficial" style="display: flex; gap: 10px; margin-top: 25px; flex-wrap: wrap;">
            <button class="btn-secundary" style="flex: 1;" onclick="abrirEdicionReporte('${id}')"><i class="fa-solid fa-pen"></i> Editar / Cerrar</button>
            <button class="btn-secundary" style="flex: 1; color: var(--dorado); border-color: var(--dorado);" onclick="abrirSelectorFusion('${id}')"><i class="fa-solid fa-code-merge"></i> Fusionar Duplicado</button>
            <button class="btn-secundary" style="flex: 1; color: var(--rojo-emergencia); border-color: var(--rojo-emergencia);" onclick="borrarReporte('${id}')"><i class="fa-solid fa-trash"></i> Eliminar</button>
        </div>`;
    
    document.getElementById("contenido-detalle-reporte").innerHTML = html;
    abrirModal("modal-detalle-reporte");
}

let reporteFusionActual = null;

function unionListas(a, b) {
    return [...new Set([...(a || []), ...(b || [])])];
}

window.abrirSelectorFusion = function(id) {
    reporteFusionActual = id;
    const principal = MEMORIA_REPORTES.find(rep => rep.id === id);
    if (!principal) return;

    const candidatos = MEMORIA_REPORTES
        .filter(r => r.id !== id && r.esActividadInterna === principal.esActividadInterna)
        .sort((a, b) => b.fecha - a.fecha);

    const dPrincipal = new Date(principal.fecha);
    document.getElementById("fusion-info-principal").innerText = `${principal.actividad} — ${principal.direccion} — ${dPrincipal.toLocaleDateString()} ${dPrincipal.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} (${principal.asistentesNombres.length} asistentes)`;

    const sel = document.getElementById("fusion-select-duplicado");
    if (candidatos.length === 0) {
        sel.innerHTML = `<option value="">No hay otros servicios del mismo tipo para fusionar</option>`;
    } else {
        sel.innerHTML = `<option value="">-- Selecciona el servicio duplicado --</option>` + candidatos.map(r => {
            const d = new Date(r.fecha);
            return `<option value="${r.id}">${r.actividad} — ${r.direccion} — ${d.toLocaleDateString()} ${d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} (${r.asistentesNombres.length} asist.)</option>`;
        }).join('');
    }

    cerrarModal("modal-detalle-reporte");
    abrirModal("modal-fusion-servicio");
}

window.confirmarFusionServicio = async function() {
    const idDup = document.getElementById("fusion-select-duplicado").value;
    if (!idDup) { alert("Selecciona el servicio duplicado a fusionar."); return; }

    const principal = MEMORIA_REPORTES.find(r => r.id === reporteFusionActual);
    const duplicado = MEMORIA_REPORTES.find(r => r.id === idDup);
    if (!principal || !duplicado) return;

    if (!confirm(`¿Fusionar "${duplicado.actividad}" (${duplicado.direccion}) dentro de "${principal.actividad}" (${principal.direccion})?\n\nEl servicio duplicado se eliminará y sus asistentes y carros se sumarán al servicio principal. Esta acción no se puede deshacer.`)) return;

    const asistentesFusion = unionListas(principal.asistentesNombres, duplicado.asistentesNombres);
    const licenciasFusion = unionListas(principal.licenciasNombres, duplicado.licenciasNombres).filter(n => !asistentesFusion.includes(n));
    const faltasFusion = unionListas(principal.faltasNombres, duplicado.faltasNombres).filter(n => !asistentesFusion.includes(n) && !licenciasFusion.includes(n));
    const maquinasFusion = unionListas(principal.maquinasUtilizadas, duplicado.maquinasUtilizadas);
    const esDobleFusion = !!(principal.esDoble || duplicado.esDoble);

    try {
        await updateDoc(doc(dbCloud, "reportes", principal.id), {
            asistentesNombres: asistentesFusion,
            licenciasNombres: licenciasFusion,
            faltasNombres: faltasFusion,
            maquinasUtilizadas: maquinasFusion,
            esDoble: esDobleFusion
        });
        await deleteDoc(doc(dbCloud, "reportes", duplicado.id));
        cerrarModal("modal-fusion-servicio");
        alert("✅ Servicios fusionados correctamente.");
        cargarHistorial();
    } catch(e) {
        alert("Error al fusionar. Revisa tu conexión.");
        console.error(e);
    }
}

let reporteEditandoId = null;

window.abrirEdicionReporte = function(id) {
    reporteEditandoId = id;
    const r = MEMORIA_REPORTES.find(rep => rep.id === id);
    cerrarModal("modal-detalle-reporte");
    
    document.getElementById("edit-estado-servicio").value = r.estadoServicio || "Finalizado";
    document.getElementById("edit-actividad").innerText = r.actividad;
    
    const contDobleEdit = document.getElementById("edit-contenedor-asistencia-doble");
    const chkDobleEdit = document.getElementById("edit-chk-asistencia-doble");
    const chkObligatoriaEdit = document.getElementById("edit-chk-asistencia-obligatoria");
    
    if (r.esActividadInterna) {
        contDobleEdit.style.display = "block";
        chkDobleEdit.checked = r.esDoble === true;
        chkObligatoriaEdit.checked = r.asistenciaObligatoria !== false;
    } else {
        contDobleEdit.style.display = "none";
        chkDobleEdit.checked = false;
        chkObligatoriaEdit.checked = true;
    }
    
    const selReclasificacion = document.getElementById("edit-reclasificacion");
    let opcionesEmergencias = DatosClaves.emergencias.map(e => `<option value="${e}">${e}</option>`).join('');
    selReclasificacion.innerHTML = `<option value="">Mantener clave original</option>${opcionesEmergencias}`;
    selReclasificacion.value = r.claveFinal || ""; 
    
    document.getElementById("edit-direccion").value = r.direccion;
    
    const now = new Date(r.fecha);
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById("edit-fecha").value = now.toISOString().slice(0,16);

    const maquinas = MEMORIA_MAQUINAS;
    const nomenclaturasStandar = maquinas.map(m => m.nomenclatura);
    
    document.getElementById("edit-contenedor-maquinas").innerHTML = maquinas.map(m => {
        const checked = r.maquinasUtilizadas && r.maquinasUtilizadas.includes(m.nomenclatura) ? "checked" : "";
        return `<label class="checkbox-item"><input type="checkbox" value="${m.nomenclatura}" class="chk-edit-maquina" ${checked}> ${m.nomenclatura}</label>`;
    }).join('');

    document.getElementById("edit-contenedor-apoyo").innerHTML = DatosClaves.carrosApoyo.map(m => {
        const checked = r.maquinasUtilizadas && r.maquinasUtilizadas.includes(m) ? "checked" : "";
        return `<label class="checkbox-item"><input type="checkbox" value="${m}" class="chk-edit-apoyo" ${checked}> ${m}</label>`;
    }).join('');

    let maquinasExtra = [];
    if (r.maquinasUtilizadas) {
        maquinasExtra = r.maquinasUtilizadas.filter(m => !nomenclaturasStandar.includes(m) && !DatosClaves.carrosApoyo.includes(m));
    }
    document.getElementById("edit-otras-maquinas").value = maquinasExtra.join(", ");

    let bomberosDB = MEMORIA_BOMBEROS.length > 0 ? MEMORIA_BOMBEROS : DatosClaves.nominaOficial;
    if (r.actividad === "Junta de Oficiales") {
        bomberosDB = bomberosDB.filter(b => DatosClaves.cargosJuntaOficiales.includes(b.cargo));
    }

    const obligatoriaEdit = r.asistenciaObligatoria !== false;

    const htmlAsistencia = bomberosDB.map(b => {
        let opcionesSegmentadas = "";
        let estadoActual = r.esActividadInterna ? "Falta" : "No Participó"; 

        if (r.asistentesNombres && r.asistentesNombres.includes(b.nombre)) {
            estadoActual = r.esActividadInterna ? "Asiste" : "Participó";
        } else if (r.licenciasNombres && r.licenciasNombres.includes(b.nombre)) {
            estadoActual = "Licencia";
        } else if (r.faltasNombres && r.faltasNombres.includes(b.nombre)) {
            estadoActual = "Falta";
        } else if (r.esActividadInterna && !obligatoriaEdit) {
            estadoActual = "No Asistió";
        }

        if (r.esActividadInterna && obligatoriaEdit) {
            opcionesSegmentadas = `
                <div class="segmented-control">
                    <div class="segment-btn ${estadoActual === 'Falta' ? 'active' : ''}" data-val="Falta" onclick="cambiarEstadoAsistencia(this, 'Falta')">Falta</div>
                    <div class="segment-btn ${estadoActual === 'Asiste' ? 'active' : ''}" data-val="Asiste" onclick="cambiarEstadoAsistencia(this, 'Asiste')">Asiste</div>
                    <div class="segment-btn ${estadoActual === 'Licencia' ? 'active' : ''}" data-val="Licencia" onclick="cambiarEstadoAsistencia(this, 'Licencia')">Licencia</div>
                </div>`;
        } else if (r.esActividadInterna) {
            opcionesSegmentadas = `
                <div class="segmented-control">
                    <div class="segment-btn ${estadoActual !== 'Asiste' ? 'active' : ''}" data-val="No Asistió" onclick="cambiarEstadoAsistencia(this, 'No Asistió')">No Asistió</div>
                    <div class="segment-btn ${estadoActual === 'Asiste' ? 'active' : ''}" data-val="Asiste" onclick="cambiarEstadoAsistencia(this, 'Asiste')">Asiste</div>
                </div>`;
        } else {
            opcionesSegmentadas = `
                <div class="segmented-control">
                    <div class="segment-btn ${estadoActual === 'No Participó' ? 'active' : ''}" data-val="No Participó" onclick="cambiarEstadoAsistencia(this, 'No Participó')">No Participó</div>
                    <div class="segment-btn ${estadoActual === 'Participó' ? 'active' : ''}" data-val="Participó" onclick="cambiarEstadoAsistencia(this, 'Participó')">Participó</div>
                </div>`;
        }
        
        let bgClass = "";
        if (estadoActual === 'Participó' || estadoActual === 'Asiste') bgClass = "bg-asiste";
        else if (estadoActual === 'Licencia') bgClass = "bg-licencia";

        return `<div class="bombero-card ${bgClass}" data-nombre="${b.nombre}">
                    <div class="bombero-info"><span class="bombero-nombre">${b.nombre}</span><span class="bombero-cargo">${b.cargo}</span></div>
                    ${opcionesSegmentadas}
                </div>`;
    }).join('');
    
    document.getElementById("edit-lista-asistencia").innerHTML = htmlAsistencia;

    abrirModal("modal-editar-reporte");
}

window.guardarEdicionReporte = async function() {
    const rEdit = MEMORIA_REPORTES.find(rep => rep.id === reporteEditandoId);
    const estSer = document.getElementById("edit-estado-servicio").value;
    const dir = document.getElementById("edit-direccion").value;
    const fec = new Date(document.getElementById("edit-fecha").value).getTime();
    const claveReclasificada = document.getElementById("edit-reclasificacion").value;
    const esDobleEdit = document.getElementById("edit-chk-asistencia-doble").checked;
    const obligatoriaEdit = rEdit.esActividadInterna ? document.getElementById("edit-chk-asistencia-obligatoria").checked : false;
    
    let maqTercera = Array.from(document.querySelectorAll(".chk-edit-maquina:checked")).map(cb => cb.value);
    let maqApoyo = Array.from(document.querySelectorAll(".chk-edit-apoyo:checked")).map(cb => cb.value);
    let maqTotal = maqTercera.concat(maqApoyo);

    const otrasMaquinasEdit = document.getElementById("edit-otras-maquinas").value;
    if (otrasMaquinasEdit.trim() !== "") {
        const extrasEdit = otrasMaquinasEdit.split(',').map(m => m.trim().toUpperCase()).filter(m => m !== "");
        maqTotal = maqTotal.concat(extrasEdit);
    }

    let asistentesNombresEdit = [];
    let licenciasNombresEdit = [];
    let faltasNombresEdit = [];
    
    document.querySelectorAll("#edit-lista-asistencia .bombero-card").forEach(card => {
        const nombre = card.getAttribute("data-nombre");
        const estado = card.querySelector(".segment-btn.active").getAttribute("data-val");
        
        if (rEdit.esActividadInterna && obligatoriaEdit) {
            if (estado === "Asiste") asistentesNombresEdit.push(nombre);
            else if (estado === "Licencia") licenciasNombresEdit.push(nombre);
            else if (estado === "Falta") faltasNombresEdit.push(nombre);
        } else if (rEdit.esActividadInterna) {
            if (estado === "Asiste") asistentesNombresEdit.push(nombre);
        } else {
            if (estado === "Participó") asistentesNombresEdit.push(nombre);
        }
    });

    await updateDoc(doc(dbCloud, "reportes", reporteEditandoId), { 
        estadoServicio: estSer,
        direccion: dir, 
        fecha: fec, 
        maquinasUtilizadas: maqTotal,
        asistentesNombres: asistentesNombresEdit,
        licenciasNombres: licenciasNombresEdit,
        faltasNombres: faltasNombresEdit,
        claveFinal: claveReclasificada,
        esDoble: esDobleEdit,
        asistenciaObligatoria: obligatoriaEdit
    });
    
    alert("Servicio actualizado correctamente.");
    cerrarModal("modal-editar-reporte");
}

window.borrarReporte = async function(id) {
    if(confirm("¿Estás seguro de eliminar este servicio? Esta acción no se puede deshacer.")) {
        await deleteDoc(doc(dbCloud, "reportes", id));
        cerrarModal("modal-detalle-reporte");
    }
}

// ==========================================
// 8. MAPA OPERACIONAL GLOBAL
// ==========================================
function inicializarMapaGlobal() {
    if(!mapaGlobal) {
        mapaGlobal = L.map('mapa-global').setView([DatosClaves.latBase, DatosClaves.lonBase], 14);
        L.tileLayer(`https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/256/{z}/{x}/{y}@2x?access_token=${MAPBOX_TOKEN}`, { 
            attribution: '© Mapbox' 
        }).addTo(mapaGlobal);
    }
    mapaGlobal.eachLayer((layer) => { if (layer instanceof L.Marker) { mapaGlobal.removeLayer(layer); } });

    const reportes = MEMORIA_REPORTES;
    reportes.forEach(r => {
        if(r.ubicacionEncontrada && !r.esActividadInterna) {
            let icono = "📍";
            const actividadMostrada = r.claveFinal ? r.claveFinal : r.actividad;
            if (actividadMostrada.includes("10-0")) icono = "🔥";
            if (actividadMostrada.includes("10-2")) icono = "🌲";
            if (actividadMostrada.includes("10-4")) icono = "🚗";
            
            const divIcon = L.divIcon({ className: 'custom-div-icon', html: `<div style='font-size: 24px; background: rgba(255,255,255,0.9); border-radius: 50%; padding: 5px; text-align: center; box-shadow: 0 2px 5px rgba(0,0,0,0.5);'>${icono}</div>`, iconSize: [40, 40], iconAnchor: [20, 20] });
            const maqText = r.maquinasUtilizadas && r.maquinasUtilizadas.length > 0 ? r.maquinasUtilizadas.join(", ") : "Ninguno";
            L.marker([r.latitud, r.longitud], {icon: divIcon}).addTo(mapaGlobal)
                .bindPopup(`<b>${actividadMostrada}</b><br>${r.direccion}<br>Carros: ${maqText}`);
        }
    });
    setTimeout(() => { mapaGlobal.invalidateSize(); }, 500);
}

// ==========================================
// 9. DASHBOARD Y ESTADÍSTICAS
// ==========================================
window.actualizarDashboard = function() {
    const exp = localStorage.getItem("sigo_oficial_exp");
    const esOficial = exp && Date.now() < parseInt(exp);
    const selFiltro = document.getElementById("filtro-tiempo");

    // BLOQUEO: Voluntarios solo pueden ver el mes actual en estadísticas
    if (!esOficial) {
        selFiltro.value = "mes_actual";
        selFiltro.disabled = true;
    } else {
        selFiltro.disabled = false;
    }

    const diasFiltro = selFiltro.value;
    const ahora = new Date();
    let filtrados = [];

    if (diasFiltro === "mes_actual") {
        const mesActualStr = `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}`;
        filtrados = MEMORIA_REPORTES.filter(r => {
            const d = new Date(r.fecha);
            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` === mesActualStr;
        });
    } else {
        const limite = diasFiltro === "todo" ? 0 : ahora.getTime() - (parseInt(diasFiltro) * 24 * 60 * 60 * 1000);
        filtrados = MEMORIA_REPORTES.filter(r => r.fecha >= limite);
    }
    
    const emergencias = filtrados.filter(r => !r.esActividadInterna);
    const internas = filtrados.filter(r => r.esActividadInterna);
    
    let usoMaquinas = {};
    filtrados.forEach(r => {
        if(r.maquinasUtilizadas) {
            r.maquinasUtilizadas.forEach(m => usoMaquinas[m] = (usoMaquinas[m] || 0) + 1)
        }
    });
    const maqTop = Object.keys(usoMaquinas).length > 0 ? Object.keys(usoMaquinas).reduce((a, b) => usoMaquinas[a] > usoMaquinas[b] ? a : b) : "N/A";

    const totalAsist = filtrados.reduce((sum, r) => sum + (r.asistentesNombres ? r.asistentesNombres.length : 0), 0);
    const prom = filtrados.length > 0 ? (totalAsist / filtrados.length).toFixed(1) : "0";

    document.getElementById("dashboard-kpis").innerHTML = `
        <div class="kpi-card"><div class="kpi-icon" style="color: var(--rojo-emergencia);"><i class="fa-solid fa-fire"></i></div><div class="kpi-value">${emergencias.length}</div><div class="kpi-label">Emergencias</div></div>
        <div class="kpi-card"><div class="kpi-icon" style="color: var(--dorado);"><i class="fa-solid fa-building"></i></div><div class="kpi-value">${internas.length}</div><div class="kpi-label">Act. Internas</div></div>
        <div class="kpi-card"><div class="kpi-icon" style="color: #4da6ff;"><span class="material-symbols-outlined" style="font-size: 2.2rem;">fire_truck</span></div><div class="kpi-value">${maqTop}</div><div class="kpi-label">Carro Frecuente</div></div>
        <div class="kpi-card"><div class="kpi-icon" style="color: var(--verde-ok);"><i class="fa-solid fa-users"></i></div><div class="kpi-value">${prom}</div><div class="kpi-label">Prom. Asistencia</div></div>
    `;

    let conteoAct = {};
    emergencias.forEach(e => { 
        let claveReal = e.claveFinal ? e.claveFinal : e.actividad;
        let t = claveReal.split(" ")[0]; 
        conteoAct[t] = (conteoAct[t] || 0) + 1; 
    });
    
    const labelsGrafico = Object.keys(conteoAct);
    const dataGrafico = Object.values(conteoAct);

    if(graficoEmergenciasInstancia) graficoEmergenciasInstancia.destroy();
    const ctx = document.getElementById('grafico-emergencias').getContext('2d');
    graficoEmergenciasInstancia = new Chart(ctx, { type: 'bar', data: { labels: labelsGrafico, datasets: [{ label: 'Cantidad', data: dataGrafico, backgroundColor: '#ff4d4d', borderRadius: 5 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { color: 'white', stepSize: 1 }, grid: { color: 'rgba(255,255,255,0.1)' } }, x: { ticks: { color: 'white' }, grid: { display: false } } } } });
}

// ==========================================
// 10. FICHAS DE PERSONAL Y NÓMINA DINÁMICA
// ==========================================
window.cambiarCriterioRanking = function(criterio) {
    criterioOrdenRanking = criterio;
    window.cargarRankingPersonal();
}

window.cargarRankingPersonal = function() {
    const exp = localStorage.getItem("sigo_oficial_exp");
    const esOficial = exp && Date.now() < parseInt(exp);
    
    const tituloSeccion = document.querySelector("#personal .title-header");
    if(tituloSeccion) {
        tituloSeccion.innerText = esOficial ? "Ficha Personal" : "Nómina de Personal (Mes Actual)";
    }

    const bomberos = [...(MEMORIA_BOMBEROS.length > 0 ? MEMORIA_BOMBEROS : DatosClaves.nominaOficial)];
    let emergencias = MEMORIA_REPORTES.filter(r => !r.esActividadInterna);
    let internas = MEMORIA_REPORTES.filter(r => r.esActividadInterna);

    // BLOQUEO: Voluntarios solo pueden rankear y ver listas filtradas al mes actual
    if (!esOficial) {
        const ahora = new Date();
        const mesActualStr = `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}`;
        
        emergencias = emergencias.filter(r => {
            const d = new Date(r.fecha);
            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` === mesActualStr;
        });
        internas = internas.filter(r => {
            const d = new Date(r.fecha);
            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` === mesActualStr;
        });
    }

    let stats = bomberos.map(b => {
        const asisteE = emergencias.reduce((sum, r) => sum + ((r.asistentesNombres && r.asistentesNombres.includes(b.nombre)) ? (r.esDoble ? 2 : 1) : 0), 0);
        const asisteI = internas.reduce((sum, r) => sum + ((r.asistentesNombres && r.asistentesNombres.includes(b.nombre)) ? (r.esDoble ? 2 : 1) : 0), 0);
        
        let faltasI = internas.reduce((sum, r) => sum + ((r.faltasNombres && r.faltasNombres.includes(b.nombre)) ? (r.esDoble ? 2 : 1) : 0), 0);
        if (b.cargo === "Bombero Honorario" || b.cargo === "Director Honorario") { faltasI = 0; }

        return { ...b, totalAsistencias: asisteE + asisteI, totalFaltas: faltasI };
    });

    let htmlControles = "";

    if (esOficial) {
        htmlControles = `
            <div class="segmented-control" style="margin-bottom: 22px; max-width: 480px;">
                <div class="segment-btn ${criterioOrdenRanking === 'cargo' ? 'active' : ''}" onclick="window.cambiarCriterioRanking('cargo')">Por Cargo</div>
                <div class="segment-btn ${criterioOrdenRanking === 'asistencias' ? 'active' : ''}" onclick="window.cambiarCriterioRanking('asistencias')">Por Asistencias</div>
                <div class="segment-btn ${criterioOrdenRanking === 'faltas' ? 'active' : ''}" onclick="window.cambiarCriterioRanking('faltas')">Por Faltas</div>
            </div>
        `;

        if (criterioOrdenRanking === "asistencias") {
            stats.sort((a, b) => b.totalAsistencias - a.totalAsistencias);
        } else if (criterioOrdenRanking === "faltas") {
            stats.sort((a, b) => b.totalFaltas - a.totalFaltas);
        } else {
            stats.sort((a, b) => {
                const indexA = DatosClaves.nominaOficial.findIndex(bom => bom.nombre === a.nombre);
                const indexB = DatosClaves.nominaOficial.findIndex(bom => bom.nombre === b.nombre);
                return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
            });
        }
    } else {
        stats.sort((a, b) => {
            const indexA = DatosClaves.nominaOficial.findIndex(bom => bom.nombre === a.nombre);
            const indexB = DatosClaves.nominaOficial.findIndex(bom => bom.nombre === b.nombre);
            return (indexA === -1 ? 999 : indexA) - (indexB === -1 ? 999 : indexB);
        });
    }

    const htmlCards = stats.map((b, i) => {
        const ladoIzquierdo = (esOficial && criterioOrdenRanking !== 'cargo') ? 
            `<div style="font-size: 1.5rem; font-weight: bold; color: ${i<3 ? 'var(--dorado)' : 'var(--texto-gris)'}; width: 40px;">#${i+1}</div>` : 
            `<div style="font-size: 1.5rem; color: var(--texto-gris); width: 40px; text-align: center;"><i class="fa-solid fa-user"></i></div>`;
            
        const valorBadge = (criterioOrdenRanking === "faltas" && esOficial) ? 
            `<div style="font-weight: bold; color: var(--rojo-emergencia);">${b.totalFaltas} Faltas</div>` :
            `<div style="font-weight: bold; color: var(--verde-ok);">${b.totalAsistencias} Asistencias</div>`;

        return `
        <div class="card-item" onclick='abrirFichaPersonal("${b.nombre}")' style="flex-direction: row; align-items: center;">
            ${ladoIzquierdo}
            <div style="flex-grow: 1;">
                <div style="font-weight: bold; color: white;">${b.nombre}</div>
                <div style="font-size: 0.8rem; color: var(--texto-gris);">${b.cargo}</div>
            </div>
            ${valorBadge}
        </div>`;
    }).join('');

    document.getElementById("lista-personal").innerHTML = htmlControles + htmlCards;
}

let bomberoFichaActual = null;

window.abrirFichaPersonal = function(nombre) {
    bomberoFichaActual = nombre;
    const exp = localStorage.getItem("sigo_oficial_exp");
    const esOficial = exp && Date.now() < parseInt(exp);
    const sel = document.getElementById("filtro-mes-ficha");
    
    // BLOQUEO: Ficha de personal forzada al mes actual para voluntarios
    if (esOficial) {
        const mesesUnicos = [...new Set(MEMORIA_REPORTES.map(r => {
            const d = new Date(r.fecha);
            return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
        }))].sort().reverse();
        
        sel.innerHTML = `<option value="todo">Histórico Completo</option>` + mesesUnicos.map(m => {
            const [anio, mes] = m.split('-');
            const nombreMes = new Date(anio, mes - 1).toLocaleString('es-ES', { month: 'long' });
            return `<option value="${m}">${nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1)} ${anio}</option>`;
        }).join('');
        
        sel.value = "todo";
        sel.disabled = false;
        renderizarFichaPersonal(nombre, "todo");
    } else {
        const ahora = new Date();
        const mesActualStr = `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}`;
        const nombreMes = ahora.toLocaleString('es-ES', { month: 'long' });
        
        sel.innerHTML = `<option value="${mesActualStr}">${nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1)} ${ahora.getFullYear()} (Mes Actual)</option>`;
        sel.value = mesActualStr;
        sel.disabled = true;
        renderizarFichaPersonal(nombre, mesActualStr);
    }
    
    abrirModal('modal-ficha-personal');
}

window.cambiarFiltroFicha = function() {
    const periodo = document.getElementById("filtro-mes-ficha").value;
    renderizarFichaPersonal(bomberoFichaActual, periodo);
}

window.cambiarPestanaFicha = function(pestana) {
    document.getElementById("tab-gen").classList.remove("active");
    document.getElementById("tab-det").classList.remove("active");
    if(document.getElementById("tab-eq")) document.getElementById("tab-eq").classList.remove("active");

    document.getElementById("vista-general").style.display = "none";
    document.getElementById("vista-detallada").style.display = "none";
    if(document.getElementById("vista-equipo")) document.getElementById("vista-equipo").style.display = "none";

    if(pestana === 'general') {
        document.getElementById("tab-gen").classList.add("active");
        document.getElementById("vista-general").style.display = "block";
    } else if (pestana === 'detallada') {
        document.getElementById("tab-det").classList.add("active");
        document.getElementById("vista-detallada").style.display = "block";
    } else if (pestana === 'equipo') {
        document.getElementById("tab-eq").classList.add("active");
        document.getElementById("vista-equipo").style.display = "block";
    }
}

function renderizarFichaPersonal(nombre, periodo) {
    const bomberos = MEMORIA_BOMBEROS.length > 0 ? MEMORIA_BOMBEROS : DatosClaves.nominaOficial;
    const b = bomberos.find(bombero => bombero.nombre === nombre);
    
    let filtrados = MEMORIA_REPORTES;
    if (periodo !== "todo") {
        filtrados = MEMORIA_REPORTES.filter(r => {
            const d = new Date(r.fecha);
            const mesStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
            return mesStr === periodo;
        });
    }

    const repsE = filtrados.filter(r => !r.esActividadInterna);
    const repsI = filtrados.filter(r => r.esActividadInterna);

    const partE = repsE.reduce((sum, r) => sum + ((r.asistentesNombres && r.asistentesNombres.includes(nombre)) ? (r.esDoble ? 2 : 1) : 0), 0);
    const asisteI = repsI.reduce((sum, r) => sum + ((r.asistentesNombres && r.asistentesNombres.includes(nombre)) ? (r.esDoble ? 2 : 1) : 0), 0);
    const licsI = repsI.reduce((sum, r) => sum + ((r.licenciasNombres && r.licenciasNombres.includes(nombre)) ? (r.esDoble ? 2 : 1) : 0), 0);
    
    let faltasI = repsI.reduce((sum, r) => sum + ((r.faltasNombres && r.faltasNombres.includes(nombre)) ? (r.esDoble ? 2 : 1) : 0), 0);
    if (b.cargo === "Bombero Honorario" || b.cargo === "Director Honorario") { faltasI = 0; }

    const totalEsp = asisteI + licsI + faltasI;
    const porcInst = totalEsp > 0 ? ((asisteI + licsI) / totalEsp * 100).toFixed(1) : 100;
    
    const totalEmergenciasPuntaje = repsE.reduce((sum, r) => sum + (r.esDoble ? 2 : 1), 0);
    const porcE = totalEmergenciasPuntaje > 0 ? ((partE / totalEmergenciasPuntaje) * 100).toFixed(1) : 0;

    const totalAsistenciasUnificadas = partE + asisteI;
    const totalLlamadosUnificados = totalEmergenciasPuntaje + totalEsp;
    const porcentajeGlobal = totalLlamadosUnificados > 0 ? ((totalAsistenciasUnificadas + licsI) / totalLlamadosUnificados * 100).toFixed(1) : 100;

    const exp = localStorage.getItem("sigo_oficial_exp");
    const esOficial = exp && Date.now() < parseInt(exp);

    let htmlFaltasDetalle = "";
    let htmlFaltasGlobal = "";

    if (esOficial) {
        htmlFaltasDetalle = `<div class="kpi-card" style="padding: 10px; border-color: var(--rojo-emergencia);"><div class="kpi-value" style="font-size: 1.2rem;">${faltasI}</div><div class="kpi-label">Faltas</div></div>`;
        htmlFaltasGlobal = `<div class="kpi-card" style="padding: 15px; border-color: var(--rojo-emergencia);"><div class="kpi-value" style="font-size: 1.5rem;">${faltasI}</div><div class="kpi-label">Faltas Totales</div></div>`;
    } else {
        htmlFaltasDetalle = `<div class="kpi-card" style="padding: 10px; border-color: rgba(255,255,255,0.1);"><div class="kpi-value" style="font-size: 1.2rem; color: var(--texto-gris);"><i class="fa-solid fa-lock"></i></div><div class="kpi-label" style="color: var(--texto-gris);">Faltas</div></div>`;
        htmlFaltasGlobal = `<div class="kpi-card" style="padding: 15px; border-color: rgba(255,255,255,0.1);"><div class="kpi-value" style="font-size: 1.5rem; color: var(--texto-gris);"><i class="fa-solid fa-lock"></i></div><div class="kpi-label" style="color: var(--texto-gris);">Faltas Totales</div></div>`;
    }

    document.getElementById("contenido-ficha-personal").innerHTML = `
        <div style="text-align: center; margin-bottom: 20px;">
            <i class="fa-solid fa-user-shield" style="font-size: 4rem; color: var(--dorado); margin-bottom: 10px;"></i>
            <h3 style="color: white; font-size: 1.5rem;">${b.nombre}</h3>
            <p style="color: var(--texto-gris);">${b.cargo}</p>
        </div>

        <div class="segmented-control" style="margin-bottom: 20px;">
            <div id="tab-gen" class="segment-btn active" onclick="cambiarPestanaFicha('general')">Vista General</div>
            <div id="tab-det" class="segment-btn" onclick="cambiarPestanaFicha('detallada')">Vista Detallada</div>
            <div id="tab-eq" class="segment-btn" onclick="cambiarPestanaFicha('equipo')">Equipo</div>
        </div>
        
        <div id="vista-general" style="display:block;">
            <h4 style="color: var(--verde-ok); margin-bottom: 10px; text-align: center;">Resumen Global Operativo</h4>
            <div class="grid-kpi" style="grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                <div class="kpi-card" style="padding: 15px; border-color: var(--verde-ok);"><div class="kpi-value" style="font-size: 1.5rem;">${totalAsistenciasUnificadas}</div><div class="kpi-label">Asistencias Totales</div></div>
                <div class="kpi-card" style="padding: 15px; border-color: var(--dorado);"><div class="kpi-value" style="font-size: 1.5rem;">${licsI}</div><div class="kpi-label">Licencias Totales</div></div>
            </div>
            <div class="grid-kpi" style="grid-template-columns: 1fr 1fr; gap: 10px;">
                ${htmlFaltasGlobal}
                <div class="kpi-card" style="padding: 15px;"><div class="kpi-value" style="font-size: 1.5rem;">${porcentajeGlobal}%</div><div class="kpi-label">Cumplimiento Global</div></div>
            </div>
        </div>

        <div id="vista-detallada" style="display:none;">
            <h4 style="color: var(--rojo-emergencia); margin-bottom: 10px;">Desempeño Emergencias</h4>
            <div class="grid-kpi" style="grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 20px;">
                <div class="kpi-card" style="padding: 15px;"><div class="kpi-value" style="font-size: 1.5rem;">${partE}/${totalEmergenciasPuntaje}</div><div class="kpi-label">Asistencias</div></div>
                <div class="kpi-card" style="padding: 15px;"><div class="kpi-value" style="font-size: 1.5rem;">${porcE}%</div><div class="kpi-label">Porcentaje</div></div>
            </div>

            <h4 style="color: var(--dorado); margin-bottom: 10px;">Participación Institucional</h4>
            <div class="grid-kpi" style="grid-template-columns: 1fr 1fr; gap: 10px;">
                <div class="kpi-card" style="padding: 10px; border-color: var(--verde-ok);"><div class="kpi-value" style="font-size: 1.2rem;">${asisteI}</div><div class="kpi-label">Asistencias</div></div>
                <div class="kpi-card" style="padding: 10px; border-color: var(--dorado);"><div class="kpi-value" style="font-size: 1.2rem;">${licsI}</div><div class="kpi-label">Licencias</div></div>
                ${htmlFaltasDetalle}
                <div class="kpi-card" style="padding: 10px;"><div class="kpi-value" style="font-size: 1.2rem; color: var(--dorado);">${porcInst}%</div><div class="kpi-label">Cumplimiento</div></div>
            </div>
        </div>

        <div id="vista-equipo" style="display:none;">
            <h4 style="color: var(--rojo-emergencia); margin-bottom: 10px;"><i class="fa-solid fa-fire-burner"></i> EPP Estructural</h4>
            <div class="card-item" style="padding: 16px; margin-bottom: 20px; border-left: 3px solid var(--rojo-emergencia);">
                <div style="display: flex; flex-direction: column; gap: 10px; font-size: 0.95rem;">
                    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 5px;">
                        <span style="color: var(--texto-gris);">Casco (Código):</span> <span style="font-weight: 600; color: white;">${b.eppEstructural?.casco || 'No Registrado'}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 5px;">
                        <span style="color: var(--texto-gris);">Chaqueta (Cod/Talla):</span> <span style="font-weight: 600; color: white;">${b.eppEstructural?.chaqueta || 'No Registrado'}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 5px;">
                        <span style="color: var(--texto-gris);">Jardinera (Cod/Talla):</span> <span style="font-weight: 600; color: white;">${b.eppEstructural?.jardinera || 'No Registrado'}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 5px;">
                        <span style="color: var(--texto-gris);">Botas (Marca/Talla):</span> <span style="font-weight: 600; color: white;">${b.eppEstructural?.botas || 'No Registrado'}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 5px;">
                        <span style="color: var(--texto-gris);">Guantes (Marca/Talla):</span> <span style="font-weight: 600; color: white;">${b.eppEstructural?.guantes || 'No Registrado'}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: var(--texto-gris);">Esclavina (Sí/No):</span> <span style="font-weight: 600; color: white;">${b.eppEstructural?.esclavina || 'No Registrado'}</span>
                    </div>
                </div>
            </div>

            <h4 style="color: var(--verde-ok); margin-bottom: 10px;"><i class="fa-solid fa-tree"></i> EPP Multirol</h4>
            <div class="card-item" style="padding: 16px; border-left: 3px solid var(--verde-ok);">
                <div style="display: flex; flex-direction: column; gap: 10px; font-size: 0.95rem;">
                    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 5px;">
                        <span style="color: var(--texto-gris);">Casco (Código):</span> <span style="font-weight: 600; color: white;">${b.eppMultirol?.casco || 'No Registrado'}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 5px;">
                        <span style="color: var(--texto-gris);">Chaqueta (Cod/Talla):</span> <span style="font-weight: 600; color: white;">${b.eppMultirol?.chaqueta || 'No Registrado'}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 5px;">
                        <span style="color: var(--texto-gris);">Pantalón (Cod/Talla):</span> <span style="font-weight: 600; color: white;">${b.eppMultirol?.pantalon || 'No Registrado'}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: var(--texto-gris);">Botas (Marca/Talla):</span> <span style="font-weight: 600; color: white;">${b.eppMultirol?.botas || 'No Registrado'}</span>
                    </div>
                </div>
            </div>
            
            <div class="req-oficial" style="margin-top: 20px; text-align: center;">
                <button class="btn-secundary" style="width: 100%; color: var(--dorado); border-color: var(--dorado);" onclick="abrirEdicionEPP('${b.nombre}')"><i class="fa-solid fa-pen-to-square"></i> Asignar / Editar EPP</button>
            </div>
            
        </div>
    `;
}

// ==========================================
// 11. MATERIAL MAYOR E INVENTARIO TÁCTICO
// ==========================================
let maquinaEditandoId = null;
let gavetaSeleccionada = "G-3"; 

const inventarioBaseB3 = [
    { ubicacion: "G-3", nombreItem: "Tiras 38mm", cant: 4 },
    { ubicacion: "G-3", nombreItem: "Motobomba", cant: 1 },
    { ubicacion: "G-3", nombreItem: "Tiras 70mm con 02 pitones", cant: 2 },
    { ubicacion: "G-3", nombreItem: "Llave bujía", cant: 1 },
    { ubicacion: "G-3", nombreItem: "Aceite cadena", cant: 1 },
    { ubicacion: "G-3", nombreItem: "Bidón combustible y premezcla", cant: 1 },
    { ubicacion: "G-3", nombreItem: "Tiras 50mm con 02 pitones", cant: 2 },
    { ubicacion: "G-5", nombreItem: "Manguerín", cant: 1 },
    { ubicacion: "G-5", nombreItem: "Pitón de manguerín", cant: 1 },
    { ubicacion: "G-5", nombreItem: "Foco desmontable (busca camino)", cant: 1 },
    { ubicacion: "G-5", nombreItem: "Tira de 52mm", cant: 1 },
    { ubicacion: "Cabina", nombreItem: "Detector de gases combustible", cant: 1 },
    { ubicacion: "Cabina", nombreItem: "Cámara térmica", cant: 1 },
    { ubicacion: "Cabina", nombreItem: "Radio portátil Motorola", cant: 2 },
    { ubicacion: "Cabina", nombreItem: "Linterna", cant: 2 },
    { ubicacion: "Cabina", nombreItem: "Botiquín trauma", cant: 1 },
    { ubicacion: "Techo", nombreItem: "Manguera rígida 110mm", cant: 4 },
    { ubicacion: "Techo", nombreItem: "Escalas", cant: 2 }
];

window.cargarInventarioCarros = function() {
    const maquinas = MEMORIA_MAQUINAS;
    const reportes = MEMORIA_REPORTES;

    document.getElementById("lista-maquinas").innerHTML = maquinas.map(m => {
        const salidas = reportes.filter(r => r.maquinasUtilizadas && r.maquinasUtilizadas.includes(m.nomenclatura)).length;
        const colorSt = m.estado === "Operativo" ? "var(--verde-ok)" : (m.estado === "Mantenimiento" ? "var(--dorado)" : "var(--rojo-emergencia)");
        
        let iconoCarro = '<span class="material-symbols-outlined" style="font-size: 2.2rem; transform: translateY(-3px);">fire_truck</span>'; 
        if (m.nomenclatura === "G-3") {
            iconoCarro = '<i class="fa-solid fa-truck-pickup" style="font-size: 1.8rem;"></i>'; 
        }
        
        return `
            <div class="card-item" onclick="abrirDetalleMaquina('${m.id}')" style="flex-direction: row; align-items: center;">
                <div style="font-size: 2rem; color: var(--dorado); width: 60px; text-align: center; display: flex; justify-content: center; align-items: center;">${iconoCarro}</div>
                <div style="flex-grow: 1;">
                    <div style="font-weight: bold; color: white; font-size: 1.2rem;">${m.nomenclatura}</div>
                    <div style="font-size: 0.85rem; color: ${colorSt}; font-weight: bold;">Estado: ${m.estado}</div>
                </div>
                <div style="color: var(--texto-gris); font-size: 0.9rem;">${salidas} salidas</div>
            </div>
        `;
    }).join('');
}

window.abrirDetalleMaquina = async function(id) {
    maquinaEditandoId = id;
    const m = MEMORIA_MAQUINAS.find(maq => maq.id === id);
    document.getElementById("titulo-detalle-maquina").innerText = `Inventario ${m.nomenclatura}`;
    
    const selEst = document.getElementById("sel-estado-maquina");
    selEst.innerHTML = `<option value="Operativo">Operativo</option><option value="Mantenimiento">Mantenimiento</option><option value="Fuera de Servicio">Fuera de Servicio</option>`;
    selEst.value = m.estado;
    
    const exp = localStorage.getItem("sigo_oficial_exp");
    const esOficial = exp && Date.now() < parseInt(exp);
    selEst.disabled = !esOficial;

    const blueprintContenedor = document.querySelector('.truck-blueprint');
    
    if (m.nomenclatura === "BX-3") {
        blueprintContenedor.innerHTML = `
            <div id="btn-gav-Techo" class="truck-techo gaveta-btn" onclick="seleccionarGaveta('Techo')"><i class="fa-solid fa-ladder-water"></i> TECHO / CAJONERA METÁLICA</div>
            <div class="truck-grid">
                <div id="btn-gav-Cabina" class="truck-cabina gaveta-btn" onclick="seleccionarGaveta('Cabina')">CABINA</div>
                <div class="truck-body">
                    <div style="font-size: 0.75rem; color: var(--dorado); margin-bottom: 5px; font-weight: bold; letter-spacing: 1px;"><i class="fa-solid fa-arrow-left"></i> LADO IZQUIERDO</div>
                    <div class="gavetas-row" style="grid-template-columns: 1fr 1fr;">
                        <div id="btn-gav-C-1" class="gaveta-btn" onclick="seleccionarGaveta('C-1')">C-1</div>
                        <div id="btn-gav-C-2" class="gaveta-btn" onclick="seleccionarGaveta('C-2')">C-2</div>
                    </div>
                    <div style="font-size: 0.75rem; color: var(--dorado); margin: 12px 0 5px 0; font-weight: bold; letter-spacing: 1px;"><i class="fa-solid fa-arrow-right"></i> LADO DERECHO</div>
                    <div class="gavetas-row" style="grid-template-columns: 1fr 1fr;">
                        <div id="btn-gav-C-3" class="gaveta-btn" onclick="seleccionarGaveta('C-3')">C-3</div>
                        <div id="btn-gav-C-4" class="gaveta-btn" onclick="seleccionarGaveta('C-4')">C-4</div>
                    </div>
                </div>
            </div>
        `;
        seleccionarGaveta("C-1");
        
    } else if (m.nomenclatura === "G-3") {
        blueprintContenedor.innerHTML = `
            <div class="truck-grid">
                <div id="btn-gav-Cabina" class="truck-cabina gaveta-btn" onclick="seleccionarGaveta('Cabina')" style="width: 40%; border-radius: 20px 5px 5px 20px;">CABINA</div>
                <div class="truck-body">
                    <div id="btn-gav-Pick-up" class="gaveta-btn" onclick="seleccionarGaveta('Pick-up')" style="height: 100%; display: flex; align-items: center; justify-content: center; padding: 20px 0;">PICK-UP / CARGA</div>
                </div>
            </div>
        `;
        seleccionarGaveta("Cabina");
        
    } else { // El B-3 estándar
        blueprintContenedor.innerHTML = `
            <div id="btn-gav-Techo" class="truck-techo gaveta-btn" onclick="seleccionarGaveta('Techo')"><i class="fa-solid fa-ladder-water"></i> TECHO / CAJONERA METÁLICA</div>
            <div class="truck-grid">
                <div id="btn-gav-Cabina" class="truck-cabina gaveta-btn" onclick="seleccionarGaveta('Cabina')">CABINA</div>
                <div class="truck-body">
                    <div style="font-size: 0.75rem; color: var(--dorado); margin-bottom: 5px; font-weight: bold; letter-spacing: 1px;"><i class="fa-solid fa-arrow-left"></i> LADO IZQUIERDO</div>
                    <div class="gavetas-row">
                        <div id="btn-gav-G-1" class="gaveta-btn" onclick="seleccionarGaveta('G-1')">G-1</div>
                        <div id="btn-gav-G-3" class="gaveta-btn" onclick="seleccionarGaveta('G-3')">G-3</div>
                        <div id="btn-gav-G-5" class="gaveta-btn" onclick="seleccionarGaveta('G-5')">G-5</div>
                    </div>
                    <div style="font-size: 0.75rem; color: var(--dorado); margin: 12px 0 5px 0; font-weight: bold; letter-spacing: 1px;"><i class="fa-solid fa-arrow-right"></i> LADO DERECHO</div>
                    <div class="gavetas-row">
                        <div id="btn-gav-G-2" class="gaveta-btn" onclick="seleccionarGaveta('G-2')">G-2</div>
                        <div id="btn-gav-G-4" class="gaveta-btn" onclick="seleccionarGaveta('G-4')">G-4</div>
                        <div id="btn-gav-G-6" class="gaveta-btn" onclick="seleccionarGaveta('G-6')">G-6</div>
                    </div>
                </div>
            </div>
        `;
        seleccionarGaveta("G-3");
    }

    if (m.nomenclatura === "B-3") {
        const itemsActuales = MEMORIA_INVENTARIO.filter(i => i.maquinaId === id);
        if (itemsActuales.length === 0) {
            for(let item of inventarioBaseB3) {
                await addDoc(collection(dbCloud, "inventario"), {
                    maquinaId: id, ubicacion: item.ubicacion, nombreItem: item.nombreItem, 
                    cantidadTeorica: item.cant, cantidadActual: item.cant, estado: "Operativo"
                });
            }
        }
    }

    abrirModal("modal-detalle-maquina");
}

window.seleccionarGaveta = function(gaveta) {
    gavetaSeleccionada = gaveta;
    document.querySelectorAll(".gaveta-btn").forEach(btn => btn.classList.remove("active"));
    const btnActivo = document.getElementById(`btn-gav-${gaveta}`);
    if(btnActivo) btnActivo.classList.add("active");
    
    document.getElementById("lbl-gaveta-actual").innerText = gaveta;

    const exp = localStorage.getItem("sigo_oficial_exp");
    const esOficial = exp && Date.now() < parseInt(exp);
    renderizarItemsMaquina(maquinaEditandoId, esOficial);
}

function renderizarItemsMaquina(id, esOficial) {
    const items = MEMORIA_INVENTARIO.filter(i => i.maquinaId === id && i.ubicacion === gavetaSeleccionada);

    document.getElementById("lista-items-maquina").innerHTML = items.length === 0 ? `<p style='color: var(--texto-gris); font-size: 0.9rem; text-align: center; margin-top: 10px;'><i class="fa-solid fa-box-open"></i> Gaveta ${gavetaSeleccionada} sin herramientas registradas.</p>` : items.map(i => {
        const btnBorrar = esOficial ? `<button class="btn-text" style="color: var(--rojo-emergencia); padding: 5px;" onclick="event.stopPropagation(); eliminarItem('${i.id}')"><i class="fa-solid fa-trash"></i></button>` : "";
        const estadoItem = i.estado || "Operativo";
        const colorSemaforo = estadoItem === "Operativo" ? "var(--verde-ok)" : (estadoItem === "Requiere Mantención" ? "var(--dorado)" : "var(--rojo-emergencia)");
        return `
        <div onclick="abrirPerfilHerramienta('${i.id}')" style="cursor: pointer; background: rgba(0,0,0,0.3); padding: 12px 15px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; border-left: 3px solid ${colorSemaforo}; margin-bottom: 8px;">
            <div><div style="color: white; font-weight: bold; font-size: 0.95rem;">${i.nombreItem}</div><div style="color: var(--texto-gris); font-size: 0.8rem; margin-top: 3px;">Cantidad Requerida: <span style="color: white; font-weight: bold;">${i.cantidadActual}</span></div></div>
            ${btnBorrar}
        </div>`;
    }).join('');
}

window.actualizarEstadoMaquina = async function() {
    const nuevoEst = document.getElementById("sel-estado-maquina").value;
    await updateDoc(doc(dbCloud, "maquinas", maquinaEditandoId), {estado: nuevoEst});
}

window.agregarItemInventario = async function() {
    const nom = document.getElementById("nuevo-item-nombre").value;
    const cant = parseInt(document.getElementById("nuevo-item-cant").value) || 1;
    if(!nom) { alert("Ingresa el nombre de la herramienta."); return; }

    await addDoc(collection(dbCloud, "inventario"), { 
        maquinaId: maquinaEditandoId, 
        nombreItem: nom, 
        ubicacion: gavetaSeleccionada, 
        cantidadTeorica: cant, 
        cantidadActual: cant, 
        estado: "Operativo",
        codigo: "",
        fechaPuestaServicio: "",
        bitacora: []
    });
    
    document.getElementById("nuevo-item-nombre").value = "";
    document.getElementById("nuevo-item-cant").value = "1";
}

window.eliminarItem = async function(idItem) {
    if(confirm("¿Seguro que deseas eliminar esta herramienta del inventario?")) {
        await deleteDoc(doc(dbCloud, "inventario", idItem));
    }
}

let itemPerfilActualId = null;

window.abrirPerfilHerramienta = function(idItem) {
    itemPerfilActualId = idItem;
    const item = MEMORIA_INVENTARIO.find(i => i.id === idItem);
    if (!item) return;

    document.getElementById("perfil-herr-nombre-titulo").innerText = item.nombreItem;
    document.getElementById("perfil-herr-input-nombre").value = item.nombreItem || "";
    document.getElementById("perfil-herr-input-cantteo").value = item.cantidadTeorica ?? 1;
    document.getElementById("perfil-herr-input-cantact").value = item.cantidadActual ?? 1;
    document.getElementById("perfil-herr-input-codigo").value = item.codigo || "";
    document.getElementById("perfil-herr-input-fecha").value = item.fechaPuestaServicio || "";
    document.getElementById("perfil-herr-input-estado").value = item.estado || "Operativo";

    const resumen = document.getElementById("perfil-herr-resumen");
    const estadoItem = item.estado || "Operativo";
    const colorSemaforo = estadoItem === "Operativo" ? "var(--verde-ok)" : (estadoItem === "Requiere Mantención" ? "var(--dorado)" : "var(--rojo-emergencia)");
    let badges = `<span style="background: ${colorSemaforo}; color: #051024; font-weight: bold; padding: 5px 12px; border-radius: 20px; font-size: 0.8rem;">${estadoItem}</span>`;
    if (item.codigo) badges += `<span style="background: rgba(255,255,255,0.1); color: white; padding: 5px 12px; border-radius: 20px; font-size: 0.8rem;"><i class="fa-solid fa-hashtag"></i> ${item.codigo}</span>`;
    if (item.fechaPuestaServicio) badges += `<span style="background: rgba(255,255,255,0.1); color: white; padding: 5px 12px; border-radius: 20px; font-size: 0.8rem;"><i class="fa-solid fa-calendar-check"></i> En servicio desde ${item.fechaPuestaServicio}</span>`;
    resumen.innerHTML = badges;

    document.getElementById("perfil-herr-nueva-texto").value = "";
    renderizarBitacoraHerramienta(item.bitacora || []);

    abrirModal("modal-perfil-herramienta");
}

function renderizarBitacoraHerramienta(bitacora) {
    const cont = document.getElementById("perfil-herr-bitacora-lista");
    if (!bitacora || bitacora.length === 0) {
        cont.innerHTML = `<p style="color: var(--texto-gris); font-size: 0.85rem; text-align: center; padding: 10px 0;">Sin novedades registradas todavía.</p>`;
        return;
    }
    const ordenada = [...bitacora].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    const colorTipo = { "Mantención": "var(--dorado)", "Falla": "var(--rojo-emergencia)", "Nota": "var(--texto-gris)" };
    cont.innerHTML = ordenada.map(n => `
        <div style="background: rgba(0,0,0,0.25); padding: 10px 12px; border-radius: 8px; margin-bottom: 8px; border-left: 3px solid ${colorTipo[n.tipo] || "var(--texto-gris)"};">
            <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--texto-gris); margin-bottom: 4px;">
                <span style="font-weight: bold; color: ${colorTipo[n.tipo] || "var(--texto-gris)"};">${n.tipo}</span>
                <span>${new Date(n.fecha).toLocaleDateString()}</span>
            </div>
            <div style="color: white; font-size: 0.9rem;">${n.texto}</div>
        </div>
    `).join('');
}

window.guardarPerfilHerramienta = async function() {
    if (!itemPerfilActualId) return;
    const nombre = document.getElementById("perfil-herr-input-nombre").value.trim();
    if (!nombre) { alert("El nombre no puede quedar vacío."); return; }

    await updateDoc(doc(dbCloud, "inventario", itemPerfilActualId), {
        nombreItem: nombre,
        cantidadTeorica: parseInt(document.getElementById("perfil-herr-input-cantteo").value) || 1,
        cantidadActual: parseInt(document.getElementById("perfil-herr-input-cantact").value) || 0,
        codigo: document.getElementById("perfil-herr-input-codigo").value.trim(),
        fechaPuestaServicio: document.getElementById("perfil-herr-input-fecha").value,
        estado: document.getElementById("perfil-herr-input-estado").value
    });
    alert("✅ Ficha de la herramienta actualizada.");
}

window.agregarBitacoraHerramienta = async function() {
    if (!itemPerfilActualId) return;
    const texto = document.getElementById("perfil-herr-nueva-texto").value.trim();
    const tipo = document.getElementById("perfil-herr-nueva-tipo").value;
    if (!texto) { alert("Escribe la novedad antes de agregarla."); return; }

    const item = MEMORIA_INVENTARIO.find(i => i.id === itemPerfilActualId);
    const nuevaBitacora = [...(item.bitacora || []), { fecha: new Date().toISOString(), tipo, texto }];

    await updateDoc(doc(dbCloud, "inventario", itemPerfilActualId), { bitacora: nuevaBitacora });
    document.getElementById("perfil-herr-nueva-texto").value = "";
    renderizarBitacoraHerramienta(nuevaBitacora);
}

window.eliminarItemDesdePerfil = async function() {
    if (!itemPerfilActualId) return;
    if (confirm("¿Seguro que deseas eliminar esta herramienta del inventario? Se perderá también su bitácora.")) {
        await deleteDoc(doc(dbCloud, "inventario", itemPerfilActualId));
        cerrarModal("modal-perfil-herramienta");
    }
}

// ==========================================
// 12. EXPORTACIÓN Y MATRIZ DE ASISTENCIA (ACTUALIZACIÓN 7.0)
// ==========================================
window.exportarCSV = function() {
    const dIni = document.getElementById("export-desde").value;
    const dFin = document.getElementById("export-hasta").value;
    if(!dIni || !dFin) { alert("Selecciona el rango de fechas para generar la matriz."); return; }

    const tIni = new Date(dIni + "T00:00:00").getTime();
    const tFin = new Date(dFin + "T23:59:59").getTime();
    
    const reportes = MEMORIA_REPORTES.filter(r => r.fecha >= tIni && r.fecha <= tFin).sort((a, b) => a.fecha - b.fecha);

    if(reportes.length === 0) { alert("No hay servicios registrados en este rango."); return; }

    const bomberos = DatosClaves.nominaOficial;
    
    // Fila 1: Clave + Dirección (SÓLO clave y dirección en caso de emergencias)
    let filaActividades = ";;;"; 
    reportes.forEach(r => {
        const act = r.claveFinal ? r.claveFinal : r.actividad;
        let cabeceraTexto = act;
        if (!r.esActividadInterna) {
            const claveRadial = act.split(" ")[0]; // Extrae "10-0", "10-4", etc.
            cabeceraTexto = `${claveRadial} ${r.direccion}`; // Ej: "10-0 Baquedano 342"
        }
        filaActividades += `"${cabeceraTexto.replace(/"/g, '""')}";`;
    });
    filaActividades += "TOTAL;TOTAL;TOTAL\n";

    // Fila 2: Fechas limpias abajo de la actividad
    let filaFechas = "N°;Nombre Completo;Cargo;";
    reportes.forEach(r => {
        const d = new Date(r.fecha);
        const fechaStr = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        filaFechas += `"${fechaStr}";`;
    });
    filaFechas += "ASISTENCIAS;LICENCIAS;FALTAS\n";

    let csv = filaActividades + filaFechas;

    bomberos.forEach((b, index) => {
        let fila = `${index + 1};"${b.nombre}";"${b.cargo}";`;
        let totalA = 0;
        let totalL = 0;
        let totalF = 0;

        reportes.forEach(r => {
            let marca = "-";
            let multiplicador = r.esDoble ? 2 : 1;

            if (r.asistentesNombres && r.asistentesNombres.includes(b.nombre)) {
                marca = "A";
                totalA += multiplicador;
            } else if (r.licenciasNombres && r.licenciasNombres.includes(b.nombre)) {
                marca = "L";
                totalL += multiplicador;
            } else if (r.faltasNombres && r.faltasNombres.includes(b.nombre)) {
                marca = "F";
                totalF += multiplicador;
            }

            fila += `"${marca}";`;
        });

        fila += `${totalA};${totalL};${totalF}\n`;
        csv += fila;
    });

    const blob = new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Matriz_Asistencia_3ra_${dIni}_a_${dFin}.csv`;
    link.click();
}

window.exportarEquipoPersonal = function() {
    const bomberos = MEMORIA_BOMBEROS.length > 0 ? MEMORIA_BOMBEROS : DatosClaves.nominaOficial;

    if (bomberos.length === 0) { alert("No hay personal registrado para exportar."); return; }

    const fila1 = ["N°", "Nombre Completo", "Cargo", "ESTRUCTURAL", "", "", "", "", "", "MULTIROL", "", "", ""];
    const fila2 = ["", "", "", "Casco", "Chaqueta", "Jardinera", "Botas", "Guantes", "Esclavina", "Casco", "Chaqueta", "Pantalón", "Botas"];

    const filasDatos = bomberos.map((b, index) => {
        const est = b.eppEstructural || {};
        const mul = b.eppMultirol || {};
        return [
            index + 1, b.nombre, b.cargo,
            est.casco || "-", est.chaqueta || "-", est.jardinera || "-", est.botas || "-", est.guantes || "-", est.esclavina || "-",
            mul.casco || "-", mul.chaqueta || "-", mul.pantalon || "-", mul.botas || "-"
        ];
    });

    const hoja = XLSX.utils.aoa_to_sheet([fila1, fila2, ...filasDatos]);
    hoja["!merges"] = [
        { s: { r: 0, c: 0 }, e: { r: 1, c: 0 } },
        { s: { r: 0, c: 1 }, e: { r: 1, c: 1 } },
        { s: { r: 0, c: 2 }, e: { r: 1, c: 2 } },
        { s: { r: 0, c: 3 }, e: { r: 0, c: 8 } },
        { s: { r: 0, c: 9 }, e: { r: 0, c: 12 } }
    ];
    hoja["!cols"] = [{ wch: 5 }, { wch: 32 }, { wch: 20 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }];

    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Equipo Personal");
    XLSX.writeFile(libro, `Registro_Equipo_Personal_3ra_${new Date().toISOString().slice(0,10)}.xlsx`);
}

window.exportarInventarioUnidades = function() {
    if (MEMORIA_MAQUINAS.length === 0) { alert("No hay unidades registradas para exportar."); return; }

    const encabezado = ["Unidad", "Ubicación/Gaveta", "Herramienta", "Cantidad Teórica", "Cantidad Actual", "Estado Ítem"];
    const filasDatos = [];

    MEMORIA_MAQUINAS.forEach(m => {
        const items = MEMORIA_INVENTARIO.filter(i => i.maquinaId === m.id);
        if (items.length === 0) {
            filasDatos.push([m.nomenclatura, "-", "Sin herramientas registradas", "-", "-", "-"]);
        } else {
            items.forEach(i => {
                filasDatos.push([m.nomenclatura, i.ubicacion, i.nombreItem, i.cantidadTeorica, i.cantidadActual, i.estado || "Operativo"]);
            });
        }
    });

    const hoja = XLSX.utils.aoa_to_sheet([encabezado, ...filasDatos]);
    hoja["!cols"] = [{ wch: 12 }, { wch: 16 }, { wch: 30 }, { wch: 16 }, { wch: 16 }, { wch: 18 }];

    const libro = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(libro, hoja, "Inventario Unidades");
    XLSX.writeFile(libro, `Inventario_Unidades_3ra_${new Date().toISOString().slice(0,10)}.xlsx`);
}

window.confirmarBorradoTotal = async function() {
    const pw = prompt("⚠️ MODO ADMINISTRADOR\nIngresa la clave maestra para borrar TODO el historial:");
    if(pw === "tercera") {
        if(confirm("¿ESTÁS COMPLETAMENTE SEGURO? Se borrarán todos los servicios de la nube.")) {
            const snapshot = await getDocs(collection(dbCloud, "reportes"));
            snapshot.forEach(async (d) => { await deleteDoc(doc(dbCloud, "reportes", d.id)); });
            alert("Historial en la nube eliminado con éxito.");
            location.reload();
        }
    } else if (pw !== null) {
        alert("Clave incorrecta.");
    }
}

// ==========================================
// 13. EFECTO MENÚ HAMBURGUESA DINÁMICO
// ==========================================
let ultimoScroll = 0;
const mainContent = document.querySelector('.main-content');
const menuToggle = document.getElementById('menu-toggle');

mainContent.addEventListener('scroll', () => {
    let scrollActual = mainContent.scrollTop;
    
    if (scrollActual > ultimoScroll + 10) {
        menuToggle.style.transform = 'translateY(-150px)';
        menuToggle.style.opacity = '0';
    } else if (scrollActual < ultimoScroll - 10) {
        menuToggle.style.transform = 'translateY(0)';
        menuToggle.style.opacity = '1';
    }
    
    ultimoScroll = scrollActual <= 0 ? 0 : scrollActual;
}, { passive: true });

// ==========================================
// 14. EDICIÓN DE EPP (INVENTARIO PERSONAL)
// ==========================================
let bomberoEditandoEPP = null;

window.abrirEdicionEPP = function(nombre) {
    const b = MEMORIA_BOMBEROS.find(bombero => bombero.nombre === nombre);
    if (!b || !b.id) {
        alert("Sincronizando con la nube... Cierra la ficha e intenta de nuevo en unos segundos.");
        return;
    }
    bomberoEditandoEPP = b.id;

    // Llenar datos previos si existen (EPP Estructural)
    document.getElementById("edit-epp-est-casco").value = b.eppEstructural?.casco || "";
    document.getElementById("edit-epp-est-chaqueta").value = b.eppEstructural?.chaqueta || "";
    document.getElementById("edit-epp-est-jardinera").value = b.eppEstructural?.jardinera || "";
    document.getElementById("edit-epp-est-botas").value = b.eppEstructural?.botas || "";
    document.getElementById("edit-epp-est-guantes").value = b.eppEstructural?.guantes || "";
    document.getElementById("edit-epp-est-esclavina").value = b.eppEstructural?.esclavina || "No";

    // Llenar datos previos si existen (EPP Multirol)
    document.getElementById("edit-epp-mul-casco").value = b.eppMultirol?.casco || "";
    document.getElementById("edit-epp-mul-chaqueta").value = b.eppMultirol?.chaqueta || "";
    document.getElementById("edit-epp-mul-pantalon").value = b.eppMultirol?.pantalon || "";
    document.getElementById("edit-epp-mul-botas").value = b.eppMultirol?.botas || "";

    abrirModal("modal-editar-epp");
}

window.guardarEdicionEPP = async function() {
    if (!bomberoEditandoEPP) return;

    const datosEPP = {
        eppEstructural: {
            casco: document.getElementById("edit-epp-est-casco").value.trim(),
            chaqueta: document.getElementById("edit-epp-est-chaqueta").value.trim(),
            jardinera: document.getElementById("edit-epp-est-jardinera").value.trim(),
            botas: document.getElementById("edit-epp-est-botas").value.trim(),
            guantes: document.getElementById("edit-epp-est-guantes").value.trim(),
            esclavina: document.getElementById("edit-epp-est-esclavina").value
        },
        eppMultirol: {
            casco: document.getElementById("edit-epp-mul-casco").value.trim(),
            chaqueta: document.getElementById("edit-epp-mul-chaqueta").value.trim(),
            pantalon: document.getElementById("edit-epp-mul-pantalon").value.trim(),
            botas: document.getElementById("edit-epp-mul-botas").value.trim()
        }
    };

    try {
        await updateDoc(doc(dbCloud, "bomberos", bomberoEditandoEPP), datosEPP);
        
        // Actualizamos localmente para no esperar a la red y refrescamos la ficha visual
        const b = MEMORIA_BOMBEROS.find(bom => bom.id === bomberoEditandoEPP);
        if(b) {
            b.eppEstructural = datosEPP.eppEstructural;
            b.eppMultirol = datosEPP.eppMultirol;
        }
        renderizarFichaPersonal(bomberoFichaActual, document.getElementById("filtro-mes-ficha").value);
        
        alert("Inventario de equipo actualizado y guardado en la nube correctamente.");
        cerrarModal("modal-editar-epp");
    } catch(e) {
        alert("Error al guardar el equipo. Revisa tu conexión a internet.");
        console.error(e);
    }
}

// ==========================================
// 15. SOLICITUD DE LICENCIAS ONLINE
// ==========================================
window.abrirModalLicencia = function() {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebar-overlay').classList.remove('open');

    const bomberos = MEMORIA_BOMBEROS.length > 0 ? MEMORIA_BOMBEROS : DatosClaves.nominaOficial;
    const sel = document.getElementById("licencia-nombre");
    sel.innerHTML = `<option value="">-- Selecciona tu nombre --</option>` + bomberos.map(b => `<option value="${b.nombre}" data-cargo="${b.cargo}">${b.nombre}</option>`).join('');
    
    document.getElementById("licencia-rut").value = "";
    document.getElementById("licencia-cargo").value = "";
    document.getElementById("licencia-inicio").value = "";
    document.getElementById("licencia-termino").value = "";
    document.getElementById("licencia-motivo").value = "";
    
    sel.onchange = function() {
        const option = sel.options[sel.selectedIndex];
        document.getElementById("licencia-cargo").value = option ? (option.getAttribute('data-cargo') || "") : "";
    };
    
    abrirModal("modal-licencia");
}

window.formatearRUT = function(input) {
    let valor = input.value.replace(/[^0-9kK]/g, '').toUpperCase();
    if (valor.length === 0) {
        input.value = "";
        return;
    }
    
    let cuerpo = valor.slice(0, -1);
    let dv = valor.slice(-1);
    
    if (cuerpo.length > 0) {
        cuerpo = cuerpo.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
        input.value = cuerpo + "-" + dv;
    } else {
        input.value = valor;
    }
}

window.enviarLicencia = async function() {
    const nombre = document.getElementById("licencia-nombre").value;
    const rut = document.getElementById("licencia-rut").value.trim();
    const cargo = document.getElementById("licencia-cargo").value;
    const fInicio = document.getElementById("licencia-inicio").value;
    const fTermino = document.getElementById("licencia-termino").value;
    const motivo = document.getElementById("licencia-motivo").value.trim();

    if (!nombre || !rut || !fInicio || !fTermino || !motivo) {
        alert("Por favor, completa todos los campos requeridos.");
        return;
    }

    if (new Date(fInicio) > new Date(fTermino)) {
        alert("La fecha de término no puede ser anterior a la de inicio.");
        return;
    }

    try {
        await addDoc(collection(dbCloud, "licencias"), {
            nombre: nombre,
            rut: rut,
            cargo: cargo,
            fechaInicio: fInicio,
            fechaTermino: fTermino,
            motivo: motivo,
            fechaSolicitud: Date.now()
        });
        alert("✅ Licencia enviada y registrada correctamente. Se aplicará automáticamente en las listas de asistencia internas.");
        cerrarModal("modal-licencia");
    } catch(e) {
        alert("Error al enviar la licencia. Verifica tu conexión.");
    }
}

// ==========================================
// 16. GESTIÓN Y REVISIÓN DE LICENCIAS (OFICIALES)
// ==========================================
window.cargarListaLicencias = function() {
    const contenedor = document.getElementById("lista-licencias-registradas");
    if(!contenedor) return;

    const ahora = new Date();
    ahora.setHours(0,0,0,0);
    const hoyTime = ahora.getTime();

    let licencias = [...MEMORIA_LICENCIAS].sort((a, b) => new Date(b.fechaSolicitud || 0) - new Date(a.fechaSolicitud || 0));

    const html = licencias.map(lic => {
        const fIni = new Date(lic.fechaInicio + "T00:00:00").getTime();
        const fFin = new Date(lic.fechaTermino + "T23:59:59").getTime();

        let estadoHtml = "";
        let colorBorde = "var(--texto-gris)";

        if (lic.estado === "Rechazada") {
            estadoHtml = `<span class="badge" style="background: rgba(255,77,77,0.15); color: var(--rojo-emergencia); border: 1px solid rgba(255,77,77,0.3);">Rechazada</span>`;
            colorBorde = "var(--rojo-emergencia)";
        } else if (hoyTime > fFin) {
            estadoHtml = `<span class="badge" style="background: rgba(255,255,255,0.1); color: var(--texto-gris); border: 1px solid rgba(255,255,255,0.2);">Vencida</span>`;
        } else if (hoyTime >= fIni && hoyTime <= fFin) {
            estadoHtml = `<span class="badge badge-gold" style="animation: pulsarBanner 2s infinite;">Vigente</span>`;
            colorBorde = "var(--dorado)";
        } else {
            estadoHtml = `<span class="badge badge-green">Programada</span>`;
            colorBorde = "var(--verde-ok)";
        }

        const fechaForm = lic.fechaSolicitud ? new Date(lic.fechaSolicitud).toLocaleDateString() : "No registrada";

        return `
        <div class="card-item" style="border-left: 4px solid ${colorBorde};">
            <div class="card-header" style="margin-bottom: 10px;">
                <span class="card-title">${lic.nombre}</span>
                ${estadoHtml}
            </div>
            <div style="font-size: 0.9rem; color: var(--texto-blanco); margin-bottom: 8px;">
                <i class="fa-regular fa-calendar" style="color: var(--texto-gris);"></i> <b>Desde:</b> ${lic.fechaInicio} <br>
                <i class="fa-solid fa-flag-checkered" style="color: var(--texto-gris); margin-top: 4px;"></i> <b>Hasta:</b> ${lic.fechaTermino}
            </div>
            <div style="font-size: 0.85rem; color: var(--texto-gris); margin-bottom: 12px; background: rgba(0,0,0,0.2); padding: 8px; border-radius: 8px;">
                <b>Motivo:</b> ${lic.motivo}
            </div>
            <div style="font-size: 0.75rem; color: rgba(255,255,255,0.4); margin-bottom: 10px;">Solicitada el: ${fechaForm}</div>
            
            <details style="margin-top: 5px; background: rgba(0,0,0,0.2); border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);">
                <summary style="padding: 8px 12px; color: var(--texto-gris); font-size: 0.85rem; cursor: pointer; user-select: none; list-style: none;">
                    <i class="fa-solid fa-gear"></i> Gestionar Solicitud
                </summary>
                <div style="padding: 10px; display: flex; gap: 10px; border-top: 1px solid rgba(255,255,255,0.05);">
                    <button class="btn-secundary" style="flex: 1; padding: 8px; font-size: 0.85rem; color: var(--dorado); border-color: var(--dorado);" onclick="rechazarLicencia('${lic.id}')"><i class="fa-solid fa-ban"></i> Rechazar</button>
                    <button class="btn-secundary" style="flex: 1; padding: 8px; font-size: 0.85rem; color: var(--rojo-emergencia); border-color: var(--rojo-emergencia);" onclick="borrarLicencia('${lic.id}')"><i class="fa-solid fa-trash"></i> Eliminar</button>
                </div>
            </details>
        </div>`;
    }).join('');

    contenedor.innerHTML = html || "<p style='color: var(--texto-gris); text-align: center; margin-top: 20px;'>No hay licencias registradas en la base de datos.</p>";
}

window.rechazarLicencia = async function(id) {
    if(confirm("¿Estás seguro de RECHAZAR esta licencia? No se aplicará automáticamente en las asistencias de esta persona.")) {
        try {
            await updateDoc(doc(dbCloud, "licencias", id), { estado: "Rechazada" });
            alert("Licencia rechazada.");
        } catch(e) {
            alert("Error al rechazar. Verifica tu conexión.");
        }
    }
}

window.borrarLicencia = async function(id) {
    if(confirm("¿Estás seguro de ELIMINAR permanentemente esta licencia del historial?")) {
        try {
            await deleteDoc(doc(dbCloud, "licencias", id));
            alert("Licencia eliminada correctamente.");
        } catch (e) {
            alert("Error de red al intentar borrar.");
        }
    }
}
