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
let MEMORIA_OFICIALES = [];

// Catálogo de permisos que se pueden asignar a cada oficial
const CATALOGO_PERMISOS = [
    { key: "crear_servicios", grupo: "Servicios", label: "Crear servicios y emergencias", desc: "Muestra el botón Nuevo Servicio en el Inicio." },
    { key: "editar_servicios", grupo: "Servicios", label: "Editar, cerrar, fusionar y eliminar servicios", desc: "También permite registrar servicios con fechas atrasadas y ver el PIN de servicios en curso." },
    { key: "historico", grupo: "Servicios", label: "Ver meses anteriores", desc: "Historial, estadísticas y fichas sin el límite del mes actual." },
    { key: "licencias", grupo: "Personal", label: "Registro de Licencias", desc: "Ver y resolver las licencias solicitadas." },
    { key: "personal", grupo: "Personal", label: "Fichas de Personal", desc: "Ver fichas, asistencias y faltas de cada voluntario." },
    { key: "editar_epp", grupo: "Personal", label: "Asignar / editar EPP", desc: "Modificar el equipo personal de los voluntarios." },
    { key: "estadisticas", grupo: "Operación", label: "Estadísticas Operativas", desc: "" },
    { key: "mapa", grupo: "Operación", label: "Mapa Operacional", desc: "" },
    { key: "material", grupo: "Material Mayor", label: "Ver Material Mayor", desc: "Ver unidades, gavetas y fichas de herramientas." },
    { key: "editar_material", grupo: "Material Mayor", label: "Editar inventario y unidades", desc: "Agregar, editar o eliminar herramientas, bitácora y estado de las unidades." },
    { key: "exportar", grupo: "Administración", label: "Exportar Reportes", desc: "" },
    { key: "gestionar_oficiales", grupo: "Administración", label: "Gestión de Oficiales", desc: "Crear oficiales, asignar PIN y permisos." }
];

(function inyectarReglasPermisos() {
    const reglas = CATALOGO_PERMISOS.map(p => `body:not(.perm-${p.key}) .req-perm-${p.key} { display: none !important; }`).join("\n");
    const tag = document.createElement("style");
    tag.id = "sigo-reglas-permisos";
    tag.textContent = reglas;
    document.head.appendChild(tag);
})();

function obtenerSesion() {
    const exp = localStorage.getItem("sigo_oficial_exp");
    if (!exp || Date.now() > parseInt(exp)) return null;
    try {
        const s = JSON.parse(localStorage.getItem("sigo_sesion") || "null");
        // Sesiones antiguas (solo PIN maestro) sin datos guardados se tratan como Ayudante maestro
        return s || { esMaestro: true, nombre: "Ayudante", cargo: "Ayudante", permisos: [] };
    } catch(e) { return null; }
}

function tienePermiso(key) {
    const s = obtenerSesion();
    if (!s) return false;
    if (s.esMaestro) return true;
    return (s.permisos || []).includes(key);
}
window.tienePermiso = tienePermiso;

function cerrarSesionOficial() {
    localStorage.removeItem("sigo_oficial_exp");
    localStorage.removeItem("sigo_sesion");
}

function aplicarPermisos() {
    const sesion = obtenerSesion();
    const btnPerfil = document.getElementById("btn-perfil");

    CATALOGO_PERMISOS.forEach(p => document.body.classList.toggle(`perm-${p.key}`, tienePermiso(p.key)));

    if (sesion) {
        document.body.classList.add("modo-oficial");
        if(btnPerfil) {
            const etiqueta = sesion.esMaestro ? "Ayudante" : `${sesion.cargo} · ${sesion.nombre.split(" ")[0]}`;
            btnPerfil.innerHTML = `<i class="fa-solid fa-user-shield"></i> Perfil: ${etiqueta} (Activo)`;
            btnPerfil.style.color = "var(--dorado)";
        }
    } else {
        document.body.classList.remove("modo-oficial");
        if(btnPerfil) {
            btnPerfil.innerHTML = `<i class="fa-solid fa-user"></i> Perfil: Voluntario`;
            btnPerfil.style.color = "var(--perfil-inactivo)";
        }
    }

    // Si la vista actual quedó sin permiso, volver al Inicio
    const vistaActiva = document.querySelector(".view-section.active");
    if (vistaActiva && getComputedStyle(vistaActiva).display === "none" && vistaActiva.id !== "inicio") {
        document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
        document.querySelectorAll('.nav-item').forEach(i => i.classList.remove('active'));
        document.getElementById("inicio").classList.add("active");
        const navInicio = document.querySelector(".nav-menu .nav-item");
        if (navInicio) navInicio.classList.add("active");
    }
    
    // Refrescar las vistas en pantalla para aplicar los bloqueos dinámicos
    if(document.getElementById('historial') && document.getElementById('historial').classList.contains('active')) cargarHistorial();
    if(document.getElementById('estadisticas') && document.getElementById('estadisticas').classList.contains('active')) actualizarDashboard();
    if(document.getElementById('personal') && document.getElementById('personal').classList.contains('active')) cargarRankingPersonal();
    if(document.getElementById('oficiales-vista') && document.getElementById('oficiales-vista').classList.contains('active')) cargarListaOficiales();
    
    // Si la ficha está abierta, refrescarla en vivo
    if(document.getElementById('modal-ficha-personal') && document.getElementById('modal-ficha-personal').style.display === "block" && bomberoFichaActual) {
        abrirFichaPersonal(bomberoFichaActual);
    }
}

setInterval(() => {
    const exp = localStorage.getItem("sigo_oficial_exp");
    if (exp && Date.now() > parseInt(exp)) {
        cerrarSesionOficial();
        aplicarPermisos();
        alert("🔒 La sesión de oficial ha caducado por inactividad (30 minutos).");
        location.reload();
    }
}, 30000);

window.abrirPadAdmin = function() {
    const sesion = obtenerSesion();
    if (sesion) {
        const quien = sesion.esMaestro ? "Ayudante" : sesion.nombre;
        if(confirm(`Sesión activa: ${quien}.\n¿Cerrar la sesión y volver a Voluntario?`)) {
            cerrarSesionOficial();
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

// VERIFICACIÓN DE PIN: PIN maestro de Ayudante o PIN personal de cada oficial
async function verificarAdminPin() {
    const pin = pinAdminIngresado;
    try {
        const docSnap = await getDoc(doc(dbCloud, "configuracion", "admin"));
        let sesion = null;

        if (docSnap.exists() && docSnap.data().pin === pin) {
            sesion = { esMaestro: true, nombre: "Ayudante", cargo: "Ayudante", permisos: [] };
        } else {
            const snap = await getDocs(collection(dbCloud, "oficiales"));
            const oficial = snap.docs.map(d => ({ id: d.id, ...d.data() })).find(o => o.pin === pin && o.activo !== false);
            if (oficial) {
                sesion = { esMaestro: false, id: oficial.id, nombre: oficial.nombre, cargo: oficial.cargo, permisos: oficial.permisos || [] };
            }
        }

        if (sesion) {
            localStorage.setItem("sigo_oficial_exp", Date.now() + (30 * 60 * 1000));
            localStorage.setItem("sigo_sesion", JSON.stringify(sesion));
            cerrarPadAdmin();
            aplicarPermisos();
            const quien = sesion.esMaestro ? "Modo Ayudante" : `Bienvenido/a ${sesion.cargo} ${sesion.nombre.split(" ")[0]}`;
            alert(`✅ ${quien}. Sesión activa por 30 minutos.`);
        } else {
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

document.addEventListener("keydown", (e) => {
    const pad = document.getElementById("admin-pin-pad");
    if (!pad || !pad.classList.contains("active")) return;

    if (e.key >= "0" && e.key <= "9") {
        pressAdminKey(e.key);
    } else if (e.key === "Backspace") {
        deleteAdminKey();
    } else if (e.key === "Escape") {
        cerrarPadAdmin();
    }
});

// ==========================================
// FORMATO DE FECHA Y HORA (24 HORAS, CHILE)
// ==========================================
function fechaCL(valor) {
    return new Date(valor).toLocaleDateString("es-CL", { day: "2-digit", month: "2-digit", year: "numeric" });
}
function horaCL(valor, conSegundos = false) {
    const opciones = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" };
    if (conSegundos) opciones.second = "2-digit";
    return new Date(valor).toLocaleTimeString("es-CL", opciones);
}

// Selector de fecha + hora en 24 h (reemplaza al datetime-local, que en muchos teléfonos muestra a.m./p.m.).
// El valor real sigue viviendo en el input oculto "base" con formato AAAA-MM-DDTHH:MM.
function prepararSelectorFecha24(base) {
    const hh = document.getElementById(`${base}-hh`);
    const mm = document.getElementById(`${base}-mm`);
    if (hh && hh.options.length === 0) hh.innerHTML = Array.from({ length: 24 }, (_, i) => `<option value="${String(i).padStart(2, "0")}">${String(i).padStart(2, "0")}</option>`).join("");
    if (mm && mm.options.length === 0) mm.innerHTML = Array.from({ length: 60 }, (_, i) => `<option value="${String(i).padStart(2, "0")}">${String(i).padStart(2, "0")}</option>`).join("");
}
function mostrarFecha24(base) {
    prepararSelectorFecha24(base);
    const oculto = document.getElementById(base);
    const dia = document.getElementById(`${base}-dia`);
    const [fecha = "", hora = "00:00"] = (oculto.value || "").split("T");
    dia.value = fecha;
    document.getElementById(`${base}-hh`).value = hora.slice(0, 2);
    document.getElementById(`${base}-mm`).value = hora.slice(3, 5);
    // Los límites de fecha (voluntarios: hoy o ayer) se aplican al calendario visible
    if (oculto.getAttribute("min")) dia.min = oculto.getAttribute("min").slice(0, 10); else dia.removeAttribute("min");
    if (oculto.getAttribute("max")) dia.max = oculto.getAttribute("max").slice(0, 10); else dia.removeAttribute("max");
}
window.sincronizarFecha24 = function(base) {
    const dia = document.getElementById(`${base}-dia`).value;
    const hh = document.getElementById(`${base}-hh`).value;
    const mm = document.getElementById(`${base}-mm`).value;
    document.getElementById(base).value = dia ? `${dia}T${hh}:${mm}` : "";
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
    yaAbrioLicenciaDirecta = true;

    // Modo solo licencia: sin menú, sin banner de emergencias y sin gestos
    document.body.classList.add("modo-solo-licencia");
    const menuBtn = document.getElementById("menu-toggle");
    if (menuBtn) menuBtn.style.display = "none";
    const sidebar = document.getElementById("sidebar");
    if (sidebar) sidebar.style.display = "none";

    document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
    document.getElementById("solicitar-licencia").classList.add("active");
    prepararFormLicencia();
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
        if(document.getElementById('solicitar-licencia').classList.contains('active')) prepararFormLicencia();
    });

    onSnapshot(collection(dbCloud, "inventario"), (snapshot) => {
        MEMORIA_INVENTARIO = snapshot.docs.map(d => ({id: d.id, ...d.data()}));
        if(document.getElementById('modal-detalle-maquina').style.display === "block" && maquinaEditandoId) {
            const esOficial = tienePermiso("editar_material");
            renderizarItemsMaquina(maquinaEditandoId, esOficial);
        }
    });

    onSnapshot(collection(dbCloud, "oficiales"), (snapshot) => {
        MEMORIA_OFICIALES = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        MEMORIA_OFICIALES.sort((a, b) => {
            const iA = DatosClaves.nominaOficial.findIndex(bom => bom.nombre === a.nombre);
            const iB = DatosClaves.nominaOficial.findIndex(bom => bom.nombre === b.nombre);
            return (iA === -1 ? 999 : iA) - (iB === -1 ? 999 : iB);
        });

        // Si hay un oficial con sesión abierta, sus permisos se actualizan al instante
        const sesion = obtenerSesion();
        if (sesion && !sesion.esMaestro && sesion.id) {
            const actual = MEMORIA_OFICIALES.find(o => o.id === sesion.id);
            if (!actual || actual.activo === false) {
                cerrarSesionOficial();
                alert("🔒 Tu perfil de oficial fue desactivado o eliminado. Se cerró la sesión.");
                location.reload();
                return;
            }
            const permisosAntes = JSON.stringify(sesion.permisos || []);
            sesion.permisos = actual.permisos || [];
            sesion.cargo = actual.cargo;
            sesion.nombre = actual.nombre;
            localStorage.setItem("sigo_sesion", JSON.stringify(sesion));
            if (permisosAntes !== JSON.stringify(sesion.permisos)) aplicarPermisos();
        }

        if(document.getElementById('oficiales-vista') && document.getElementById('oficiales-vista').classList.contains('active')) cargarListaOficiales();
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
    if (viewId === 'oficiales-vista') cargarListaOficiales();
    if (viewId === 'solicitar-licencia') prepararFormLicencia();
}

// Gestos táctiles: deslizar a la derecha abre el menú, a la izquierda lo cierra
;(function activarGestosMenu() {
    let x0 = null, y0 = null, t0 = 0, permitido = false;
    const zonaExcluida = (el) => el && el.closest && el.closest(".map-container, .map-container-small, .leaflet-container, input, select, textarea, .t-grilla, .keypad");
    const hayVentanaAbierta = () =>
        [...document.querySelectorAll(".modal")].some(m => m.style.display === "block") ||
        document.getElementById("admin-pin-pad").classList.contains("active");

    document.addEventListener("touchstart", (e) => {
        if (e.touches.length !== 1) { x0 = null; return; }
        x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; t0 = Date.now();
        permitido = !zonaExcluida(e.target);
    }, { passive: true });

    document.addEventListener("touchend", (e) => {
        if (x0 === null || !permitido) return;
        const dx = e.changedTouches[0].clientX - x0;
        const dy = e.changedTouches[0].clientY - y0;
        const rapido = Date.now() - t0 < 700;
        x0 = null;
        // Debe ser un deslizamiento claro y mayormente horizontal (para no confundirlo con hacer scroll)
        if (!rapido || Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
        if (document.body.classList.contains("modo-solo-licencia") || hayVentanaAbierta()) return;

        const abierto = document.getElementById("sidebar").classList.contains("open");
        if ((dx > 0 && !abierto) || (dx < 0 && abierto)) toggleMenu();
    }, { passive: true });
})();

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
    if (!tienePermiso("crear_servicios")) { alert("🔒 Solo los Ayudantes y oficiales autorizados pueden crear servicios."); return; }
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
    const esOficial = tienePermiso("editar_servicios");
    if (esOficial) {
        inpFecha.removeAttribute("min");
        inpFecha.removeAttribute("max");
    } else {
        const ayer = new Date(); ayer.setDate(ayer.getDate() - 1); ayer.setHours(0,0,0,0);
        ayer.setMinutes(ayer.getMinutes() - ayer.getTimezoneOffset());
        inpFecha.min = ayer.toISOString().slice(0,16);
        inpFecha.max = now.toISOString().slice(0,16);
    }
    mostrarFecha24("inp-fecha");

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

    const esOficialCheck = tienePermiso("editar_servicios");
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
    const esOficial = tienePermiso("historico");
    
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
                    <span class="card-date">${fechaCL(d)} ${horaCL(d)}</span>
                </div>
                <div style="color: var(--texto-blanco); margin: 8px 0;">${r.direccion} ${badgeEstado}</div>
                <div class="card-body">
                    <span><span class="material-symbols-outlined" style="color: var(--rojo-emergencia); font-size: 1.2rem; vertical-align: text-bottom; margin-right: 4px;">fire_truck</span> ${maquinas}</span>
                    <span style="color: var(--verde-ok);"><i class="fa-solid fa-users"></i> ${r.asistentesNombres.length} Asistencias</span>
                </div>
            </div>`;
    }).join('');
    document.getElementById("lista-historial").innerHTML = html || "<p style='color: var(--texto-gris);'>No hay servicios registrados en este periodo.</p>";
}

window.verDetalleReporte = function(id) {
    const esOficial = tienePermiso("editar_servicios");

    const r = MEMORIA_REPORTES.find(rep => rep.id === id);
    const d = new Date(r.fecha);
    
    const tituloDetalle = r.claveFinal ? `${r.actividad} <br><span style="color:var(--dorado); font-size: 1rem;">➡️ Reclasificado a: ${r.claveFinal}</span>` : r.actividad;
    const badgeDobleDetalle = r.esDoble ? `<div style="margin-bottom: 15px;"><span class="badge badge-gold"><i class="fa-solid fa-star"></i> Servicio con Asistencia y Falta Doble</span></div>` : "";

    let html = `
        <div class="info-box" style="margin-bottom: 20px;">
            <h3 style="color: var(--texto-blanco); margin-bottom: 5px;">${tituloDetalle}</h3>
            <p style="color: var(--texto-gris); font-size: 0.9rem;">${r.direccion}</p>
            <p style="color: var(--texto-gris); font-size: 0.9rem;">${fechaCL(d)} a las ${horaCL(d)}</p>
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
            <p style="color: var(--texto-blanco); font-weight: bold;">SERVICIO EN CURSO</p>
            <p style="color: var(--dorado); font-size: 0.9rem;">PIN Autoregistro: ${r.pinEmergencia}</p>
        </div>`;
    }
    
    html += `
        <div class="req-perm-editar_servicios" style="display: flex; gap: 10px; margin-top: 25px; flex-wrap: wrap;">
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
    if (!tienePermiso("editar_servicios")) { alert("🔒 No tienes permiso para esta acción."); return; }
    reporteFusionActual = id;
    const principal = MEMORIA_REPORTES.find(rep => rep.id === id);
    if (!principal) return;

    const candidatos = MEMORIA_REPORTES
        .filter(r => r.id !== id && r.esActividadInterna === principal.esActividadInterna)
        .sort((a, b) => b.fecha - a.fecha);

    const dPrincipal = new Date(principal.fecha);
    document.getElementById("fusion-info-principal").innerText = `${principal.actividad} — ${principal.direccion} — ${fechaCL(dPrincipal)} ${horaCL(dPrincipal)} (${principal.asistentesNombres.length} asistentes)`;

    const sel = document.getElementById("fusion-select-duplicado");
    if (candidatos.length === 0) {
        sel.innerHTML = `<option value="">No hay otros servicios del mismo tipo para fusionar</option>`;
    } else {
        sel.innerHTML = `<option value="">-- Selecciona el servicio duplicado --</option>` + candidatos.map(r => {
            const d = new Date(r.fecha);
            return `<option value="${r.id}">${r.actividad} — ${r.direccion} — ${fechaCL(d)} ${horaCL(d)} (${r.asistentesNombres.length} asist.)</option>`;
        }).join('');
    }

    cerrarModal("modal-detalle-reporte");
    abrirModal("modal-fusion-servicio");
}

window.confirmarFusionServicio = async function() {
    if (!tienePermiso("editar_servicios")) { alert("🔒 No tienes permiso para esta acción."); return; }
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
    if (!tienePermiso("editar_servicios")) { alert("🔒 No tienes permiso para esta acción."); return; }
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
    document.getElementById("edit-fecha").removeAttribute("min");
    document.getElementById("edit-fecha").removeAttribute("max");
    mostrarFecha24("edit-fecha");

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
    if (!tienePermiso("editar_servicios")) { alert("🔒 No tienes permiso para esta acción."); return; }
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
    if (!tienePermiso("editar_servicios")) { alert("🔒 No tienes permiso para esta acción."); return; }
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
    const esOficial = tienePermiso("historico");
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
    const estilosTema = getComputedStyle(document.documentElement);
    const colorTextoGrafico = estilosTema.getPropertyValue('--texto-blanco').trim() || 'white';
    const colorGrillaGrafico = estilosTema.getPropertyValue('--grilla-grafico').trim() || 'rgba(255,255,255,0.1)';
    const ctx = document.getElementById('grafico-emergencias').getContext('2d');
    graficoEmergenciasInstancia = new Chart(ctx, { type: 'bar', data: { labels: labelsGrafico, datasets: [{ label: 'Cantidad', data: dataGrafico, backgroundColor: '#ff4d4d', borderRadius: 5 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { color: colorTextoGrafico, stepSize: 1 }, grid: { color: colorGrillaGrafico } }, x: { ticks: { color: colorTextoGrafico }, grid: { display: false } } } } });

    renderizarTemporada();
}

// ==========================================
// 9b. TEMPORADA DE EMERGENCIAS (BARRA DE 12 MESES POR CLAVE)
// ==========================================
const MESES_CORTOS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const MESES_LARGOS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
let temporadaColumnas = [];
let temporadaEmergencias = [];

const claveDeReporte = (r) => ((r.claveFinal || r.actividad || "").split(" ")[0] || "Sin clave");
// Ordena 10-0, 10-1 ... 10-17 por número, no alfabéticamente
const ordenClave = (a, b) => {
    const na = a.split("-").map(Number), nb = b.split("-").map(Number);
    return (na[0] - nb[0]) || ((na[1] ?? 0) - (nb[1] ?? 0)) || a.localeCompare(b);
};

window.renderizarTemporada = function() {
    const cont = document.getElementById("temporada-contenido");
    const sel = document.getElementById("filtro-temporada");
    if (!cont || !sel) return;
    document.getElementById("temporada-detalle").innerHTML = "";

    if (!tienePermiso("historico")) {
        sel.style.display = "none";
        cont.innerHTML = `<p class="temporada-vacio"><i class="fa-solid fa-lock"></i> Para ver la temporada se necesita el permiso "Ver meses anteriores".</p>`;
        return;
    }
    sel.style.display = "";

    const emergencias = MEMORIA_REPORTES.filter(r => !r.esActividadInterna && r.fecha);
    const anios = [...new Set(emergencias.map(r => new Date(r.fecha).getFullYear()))].sort((a, b) => b - a);
    const opciones = [["ultimos12", "Últimos 12 meses"], ...anios.map(a => [String(a), `Año ${a}`]), ["historico", "Histórico (todos los años)"]];
    const valorPrevio = sel.value || "ultimos12";
    sel.innerHTML = opciones.map(([v, t]) => `<option value="${v}">${t}</option>`).join("");
    sel.value = opciones.some(([v]) => v === valorPrevio) ? valorPrevio : "ultimos12";
    const modo = sel.value;

    // Columnas: 12 meses. Cada columna sabe qué emergencias le corresponden.
    const ahora = new Date();
    if (modo === "ultimos12") {
        temporadaColumnas = Array.from({ length: 12 }, (_, i) => {
            const d = new Date(ahora.getFullYear(), ahora.getMonth() - 11 + i, 1);
            return { etiqueta: MESES_CORTOS[d.getMonth()], titulo: `${MESES_LARGOS[d.getMonth()]} ${d.getFullYear()}`, anio: d.getFullYear(), mes: d.getMonth(), primeroDelAnio: i === 0 || d.getMonth() === 0 };
        });
    } else {
        const anio = modo === "historico" ? null : parseInt(modo);
        temporadaColumnas = MESES_CORTOS.map((m, i) => ({ etiqueta: m, titulo: anio ? `${MESES_LARGOS[i]} ${anio}` : `${MESES_LARGOS[i]} (todos los años)`, anio, mes: i }));
    }
    const enColumna = (r, c) => { const d = new Date(r.fecha); return d.getMonth() === c.mes && (c.anio === null || d.getFullYear() === c.anio); };
    temporadaEmergencias = emergencias.filter(r => temporadaColumnas.some(c => enColumna(r, c)));

    document.getElementById("temporada-sub").innerText = modo === "historico"
        ? `Suma de todos los años registrados (${anios.length ? anios[anios.length - 1] + "–" + anios[0] : "sin datos"}) para ver la temporada típica`
        : "Cantidad de servicios por mes y por clave";

    if (temporadaEmergencias.length === 0) {
        cont.innerHTML = `<p class="temporada-vacio"><i class="fa-solid fa-calendar-xmark"></i> No hay emergencias registradas en este periodo.</p>`;
        return;
    }

    const contar = (filtro) => temporadaColumnas.map(c => temporadaEmergencias.filter(r => enColumna(r, c) && filtro(r)).length);
    const totales = contar(() => true);
    const claves = [...new Set(temporadaEmergencias.map(claveDeReporte))].sort(ordenClave);
    const filas = claves.map(clave => ({ clave, valores: contar(r => claveDeReporte(r) === clave) }));
    const maxTotal = Math.max(...totales);
    const minTotal = Math.min(...totales.filter(n => n > 0));
    const maxCelda = Math.max(...filas.flatMap(f => f.valores));

    // Intensidad con raíz cuadrada para que los meses con pocos casos igual se noten
    const celda = (n, max, clave, iCol, grande) => {
        // Fila "Todas": se compara contra el mes más tranquilo para que resalten los puntos críticos
        const nivel = n === 0 ? 0 : grande
            ? 0.18 + 0.82 * (maxTotal === minTotal ? 1 : (n - minTotal) / (maxTotal - minTotal))
            : 0.18 + 0.82 * Math.sqrt(n / max);
        const fondo = n === 0 ? "" : `background: rgba(255, 77, 77, ${nivel.toFixed(2)});`;
        const claseTexto = nivel > 0.55 ? " fuerte" : "";
        const pico = grande && n > 0 && n === maxTotal ? " pico" : "";
        const inicioAnio = temporadaColumnas[iCol].primeroDelAnio && iCol > 0 ? " inicio-anio" : "";
        return `<button class="t-celda${grande ? " t-total" : ""}${claseTexto}${pico}${inicioAnio}" style="${fondo}" title="${temporadaColumnas[iCol].titulo}${clave ? " · " + clave : ""}: ${n}" onclick="verDetalleTemporada(${iCol}, ${clave ? `'${clave}'` : "null"})">${n || ""}</button>`;
    };

    const cabeceraMeses = temporadaColumnas.map((c, i) => `<span class="t-mes${c.primeroDelAnio && modo === "ultimos12" ? " con-anio" : ""}">${c.etiqueta}${c.primeroDelAnio && modo === "ultimos12" ? `<em>${String(c.anio).slice(2)}</em>` : ""}</span>`).join("");
    const picoMes = temporadaColumnas[totales.indexOf(maxTotal)];

    cont.innerHTML = `
        <div class="t-grilla">
            <span class="t-etiqueta"></span>${cabeceraMeses}<span class="t-suma">Total</span>
            <span class="t-etiqueta t-etiqueta-total">Todas</span>${totales.map((n, i) => celda(n, maxTotal, null, i, true)).join("")}<span class="t-suma t-suma-total">${temporadaEmergencias.length}</span>
            ${filas.map(f => `<span class="t-etiqueta">${f.clave}</span>${f.valores.map((n, i) => celda(n, maxCelda, f.clave, i, false)).join("")}<span class="t-suma">${f.valores.reduce((a, b) => a + b, 0)}</span>`).join("")}
        </div>
        <div class="t-leyenda">
            <span>Menos</span><i style="background: rgba(255,77,77,0.18)"></i><i style="background: rgba(255,77,77,0.45)"></i><i style="background: rgba(255,77,77,0.72)"></i><i style="background: rgba(255,77,77,1)"></i><span>Más</span>
            <span class="t-pico-texto"><i class="fa-solid fa-triangle-exclamation"></i> Mes más crítico: <b>${picoMes.titulo}</b> (${maxTotal})</span>
        </div>`;
}

window.verDetalleTemporada = function(iCol, clave) {
    const c = temporadaColumnas[iCol];
    const lista = temporadaEmergencias
        .filter(r => { const d = new Date(r.fecha); return d.getMonth() === c.mes && (c.anio === null || d.getFullYear() === c.anio) && (!clave || claveDeReporte(r) === clave); })
        .sort((a, b) => b.fecha - a.fecha);
    const det = document.getElementById("temporada-detalle");
    const titulo = `${c.titulo}${clave ? " · " + clave : ""} · ${lista.length} ${lista.length === 1 ? "servicio" : "servicios"}`;
    det.innerHTML = `
        <div class="t-detalle-cabecera"><span>${titulo}</span><button class="btn-text" style="padding: 2px 6px;" onclick="document.getElementById('temporada-detalle').innerHTML=''" aria-label="Cerrar"><i class="fa-solid fa-xmark"></i></button></div>
        ${lista.length === 0 ? `<p class="temporada-vacio">Sin servicios en esta celda.</p>` : lista.map(r => `
            <div class="t-detalle-item" onclick="verDetalleReporte('${r.id}')">
                <span class="t-detalle-clave">${claveDeReporte(r)}</span>
                <span class="t-detalle-texto">${r.direccion || "Sin dirección"}</span>
                <span class="t-detalle-fecha">${fechaCL(r.fecha)} ${horaCL(r.fecha)}</span>
            </div>`).join("")}`;
    det.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ==========================================
// 10. FICHAS DE PERSONAL Y NÓMINA DINÁMICA
// ==========================================
window.cambiarCriterioRanking = function(criterio) {
    criterioOrdenRanking = criterio;
    window.cargarRankingPersonal();
}

window.cargarRankingPersonal = function() {
    const esOficial = tienePermiso("personal");
    const verHistorico = tienePermiso("historico");
    
    const tituloSeccion = document.querySelector("#personal .title-header");
    if(tituloSeccion) {
        tituloSeccion.innerText = verHistorico ? "Ficha Personal" : "Ficha Personal (Mes Actual)";
    }

    const bomberos = [...(MEMORIA_BOMBEROS.length > 0 ? MEMORIA_BOMBEROS : DatosClaves.nominaOficial)];
    let emergencias = MEMORIA_REPORTES.filter(r => !r.esActividadInterna);
    let internas = MEMORIA_REPORTES.filter(r => r.esActividadInterna);

    // BLOQUEO: sin permiso de histórico, solo se muestra el mes actual
    if (!verHistorico) {
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
                <div style="font-weight: bold; color: var(--texto-blanco);">${b.nombre}</div>
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
    const esOficial = tienePermiso("historico");
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

    const esOficial = tienePermiso("personal");

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
            <h3 style="color: var(--texto-blanco); font-size: 1.5rem;">${b.nombre}</h3>
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
                        <span style="color: var(--texto-gris);">Casco (Código):</span> <span style="font-weight: 600; color: var(--texto-blanco);">${b.eppEstructural?.casco || 'No Registrado'}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 5px;">
                        <span style="color: var(--texto-gris);">Chaqueta (Cod/Talla):</span> <span style="font-weight: 600; color: var(--texto-blanco);">${b.eppEstructural?.chaqueta || 'No Registrado'}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 5px;">
                        <span style="color: var(--texto-gris);">Jardinera (Cod/Talla):</span> <span style="font-weight: 600; color: var(--texto-blanco);">${b.eppEstructural?.jardinera || 'No Registrado'}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 5px;">
                        <span style="color: var(--texto-gris);">Botas (Marca/Talla):</span> <span style="font-weight: 600; color: var(--texto-blanco);">${b.eppEstructural?.botas || 'No Registrado'}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 5px;">
                        <span style="color: var(--texto-gris);">Guantes (Marca/Talla):</span> <span style="font-weight: 600; color: var(--texto-blanco);">${b.eppEstructural?.guantes || 'No Registrado'}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: var(--texto-gris);">Esclavina (Sí/No):</span> <span style="font-weight: 600; color: var(--texto-blanco);">${b.eppEstructural?.esclavina || 'No Registrado'}</span>
                    </div>
                </div>
            </div>

            <h4 style="color: var(--verde-ok); margin-bottom: 10px;"><i class="fa-solid fa-tree"></i> EPP Multirol</h4>
            <div class="card-item" style="padding: 16px; border-left: 3px solid var(--verde-ok);">
                <div style="display: flex; flex-direction: column; gap: 10px; font-size: 0.95rem;">
                    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 5px;">
                        <span style="color: var(--texto-gris);">Casco (Código):</span> <span style="font-weight: 600; color: var(--texto-blanco);">${b.eppMultirol?.casco || 'No Registrado'}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 5px;">
                        <span style="color: var(--texto-gris);">Chaqueta (Cod/Talla):</span> <span style="font-weight: 600; color: var(--texto-blanco);">${b.eppMultirol?.chaqueta || 'No Registrado'}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 5px;">
                        <span style="color: var(--texto-gris);">Pantalón (Cod/Talla):</span> <span style="font-weight: 600; color: var(--texto-blanco);">${b.eppMultirol?.pantalon || 'No Registrado'}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span style="color: var(--texto-gris);">Botas (Marca/Talla):</span> <span style="font-weight: 600; color: var(--texto-blanco);">${b.eppMultirol?.botas || 'No Registrado'}</span>
                    </div>
                </div>
            </div>
            
            <div class="req-perm-editar_epp" style="margin-top: 20px; text-align: center;">
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

// Gavetas de cada unidad, en el mismo orden del plano
const GAVETAS_POR_UNIDAD = {
    "B-3": ["Cabina", "Techo", "G-1", "G-2", "G-3", "G-4", "G-5", "G-6"],
    "BX-3": ["Cabina", "Techo", "C-1", "C-2", "C-3", "C-4"],
    "G-3": ["Cabina", "Pick-up"]
};
function gavetasDeUnidad(maquinaId) {
    const m = MEMORIA_MAQUINAS.find(x => x.id === maquinaId);
    const base = (m && GAVETAS_POR_UNIDAD[m.nomenclatura]) || [];
    const usadas = MEMORIA_INVENTARIO.filter(i => i.maquinaId === maquinaId).map(i => i.ubicacion);
    return [...new Set([...base, ...usadas])];
}
const normalizarNombre = (t) => (t || "").toString().trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");

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
                    <div style="font-weight: bold; color: var(--texto-blanco); font-size: 1.2rem;">${m.nomenclatura}</div>
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
    
    const esOficial = tienePermiso("editar_material");
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
    // Activa todas las zonas marcadas con data-gaveta, además del botón con id btn-gav-*
    const zonas = document.querySelectorAll(`[data-gaveta="${gaveta}"]`);
    if (zonas.length) zonas.forEach(z => z.classList.add("active"));
    const btnActivo = document.getElementById(`btn-gav-${gaveta}`);
    if(btnActivo) btnActivo.classList.add("active");
    
    document.getElementById("lbl-gaveta-actual").innerText = gaveta;

    const esOficial = tienePermiso("editar_material");
    renderizarItemsMaquina(maquinaEditandoId, esOficial);
}

function renderizarItemsMaquina(id, esOficial) {
    const items = MEMORIA_INVENTARIO.filter(i => i.maquinaId === id && i.ubicacion === gavetaSeleccionada)
        .sort((a, b) => (a.nombreItem || "").localeCompare(b.nombreItem || "", "es"));

    const contador = document.getElementById("lbl-gaveta-cantidad");
    if (contador) contador.innerText = items.length === 1 ? "1 elemento" : `${items.length} elementos`;
    const lblAgregar = document.getElementById("lbl-agregar-gaveta");
    if (lblAgregar) lblAgregar.innerText = gavetaSeleccionada;
    const selGav = document.getElementById("nuevo-item-gaveta");
    if (selGav && document.getElementById("form-agregar-material").style.display !== "none") selGav.value = gavetaSeleccionada;

    document.getElementById("lista-items-maquina").innerHTML = items.length === 0 ? `<p style='color: var(--texto-gris); font-size: 0.9rem; text-align: center; margin-top: 10px;'><i class="fa-solid fa-box-open"></i> Gaveta ${gavetaSeleccionada} sin herramientas registradas.</p>` : items.map(i => {
        const btnBorrar = esOficial ? `<button class="btn-text" style="color: var(--rojo-emergencia); padding: 5px;" onclick="event.stopPropagation(); eliminarItem('${i.id}')"><i class="fa-solid fa-trash"></i></button>` : "";
        const estadoItem = i.estado || "Operativo";
        const colorSemaforo = estadoItem === "Operativo" ? "var(--verde-ok)" : (estadoItem === "Requiere Mantención" ? "var(--dorado)" : "var(--rojo-emergencia)");
        const actual = i.cantidadActual ?? 0;
        const requerida = i.cantidadTeorica ?? actual;
        const faltan = requerida - actual;
        const cantidadHTML = faltan > 0
            ? `<span style="color: var(--rojo-emergencia); font-weight: bold;">${actual} de ${requerida}</span> <span style="color: var(--rojo-emergencia);">· faltan ${faltan}</span>`
            : `<span style="color: var(--texto-blanco); font-weight: bold;">${actual}</span>${requerida !== actual ? ` <span>(requeridas ${requerida})</span>` : ""}`;
        const codigoHTML = i.codigo ? ` · <i class="fa-solid fa-hashtag"></i> ${i.codigo}` : "";
        return `
        <div onclick="abrirPerfilHerramienta('${i.id}')" style="cursor: pointer; background: rgba(0,0,0,0.3); padding: 12px 15px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; border-left: 3px solid ${colorSemaforo}; margin-bottom: 8px;">
            <div><div style="color: var(--texto-blanco); font-weight: bold; font-size: 0.95rem;">${i.nombreItem}</div><div style="color: var(--texto-gris); font-size: 0.8rem; margin-top: 3px;">Cantidad: ${cantidadHTML}${codigoHTML}</div></div>
            ${btnBorrar}
        </div>`;
    }).join('');
}

window.actualizarEstadoMaquina = async function() {
    if (!tienePermiso("editar_material")) { alert("🔒 No tienes permiso para esta acción."); return; }
    const nuevoEst = document.getElementById("sel-estado-maquina").value;
    await updateDoc(doc(dbCloud, "maquinas", maquinaEditandoId), {estado: nuevoEst});
}

window.abrirFormAgregarMaterial = function() {
    if (!tienePermiso("editar_material")) { alert("🔒 No tienes permiso para esta acción."); return; }
    const sel = document.getElementById("nuevo-item-gaveta");
    sel.innerHTML = gavetasDeUnidad(maquinaEditandoId).map(g => `<option value="${g}">${g}</option>`).join("");
    sel.value = gavetaSeleccionada;

    // Sugerencias con los nombres ya usados en todas las unidades, para escribirlos siempre igual
    const nombres = [...new Map(MEMORIA_INVENTARIO.filter(i => i.nombreItem).map(i => [normalizarNombre(i.nombreItem), i.nombreItem])).values()]
        .sort((a, b) => a.localeCompare(b, "es"));
    document.getElementById("sugerencias-material").innerHTML = nombres.map(n => `<option value="${n.replace(/"/g, "&quot;")}"></option>`).join("");

    limpiarFormAgregarMaterial();
    document.getElementById("btn-abrir-agregar-material").style.display = "none";
    document.getElementById("form-agregar-material").style.display = "block";
    document.getElementById("txt-material-agregado").innerText = "";
    setTimeout(() => document.getElementById("nuevo-item-nombre").focus(), 50);
}

window.cerrarFormAgregarMaterial = function() {
    document.getElementById("form-agregar-material").style.display = "none";
    document.getElementById("btn-abrir-agregar-material").style.display = "flex";
}

function limpiarFormAgregarMaterial() {
    document.getElementById("nuevo-item-nombre").value = "";
    document.getElementById("nuevo-item-cant").value = "1";
    document.getElementById("nuevo-item-estado").value = "Operativo";
    document.getElementById("nuevo-item-codigo").value = "";
    document.getElementById("nuevo-item-fecha").value = "";
}

window.cambiarCantidadNuevoItem = function(delta) {
    const inp = document.getElementById("nuevo-item-cant");
    inp.value = Math.max(1, (parseInt(inp.value) || 1) + delta);
}

window.agregarItemInventario = async function(seguirAgregando = false) {
    if (!tienePermiso("editar_material")) { alert("🔒 No tienes permiso para esta acción."); return; }
    const nom = document.getElementById("nuevo-item-nombre").value.trim();
    const cant = Math.max(1, parseInt(document.getElementById("nuevo-item-cant").value) || 1);
    const gaveta = document.getElementById("nuevo-item-gaveta").value || gavetaSeleccionada;
    const estado = document.getElementById("nuevo-item-estado").value;
    const codigo = document.getElementById("nuevo-item-codigo").value.trim();
    const fecha = document.getElementById("nuevo-item-fecha").value;
    if (!nom) { alert("Ingresa el nombre del material."); document.getElementById("nuevo-item-nombre").focus(); return; }

    // Si el mismo material ya está en esa gaveta, se ofrece sumar en vez de duplicar
    const existente = !codigo && MEMORIA_INVENTARIO.find(i => i.maquinaId === maquinaEditandoId && i.ubicacion === gaveta && normalizarNombre(i.nombreItem) === normalizarNombre(nom));
    try {
        if (existente && confirm(`"${existente.nombreItem}" ya está en ${gaveta} (cantidad ${existente.cantidadActual ?? 0}).\n\n¿Sumar ${cant} a ese registro?\n(Cancelar = crearlo como un elemento aparte)`)) {
            await updateDoc(doc(dbCloud, "inventario", existente.id), {
                cantidadTeorica: (existente.cantidadTeorica ?? 0) + cant,
                cantidadActual: (existente.cantidadActual ?? 0) + cant
            });
            document.getElementById("txt-material-agregado").innerText = `✓ Sumado: ${existente.nombreItem} +${cant} en ${gaveta}`;
        } else {
            await addDoc(collection(dbCloud, "inventario"), {
                maquinaId: maquinaEditandoId,
                nombreItem: nom,
                ubicacion: gaveta,
                cantidadTeorica: cant,
                cantidadActual: cant,
                estado: estado,
                codigo: codigo,
                fechaPuestaServicio: fecha,
                bitacora: []
            });
            document.getElementById("txt-material-agregado").innerText = `✓ Agregado: ${nom} ×${cant} en ${gaveta}`;
        }
    } catch (e) {
        alert("Error al guardar. Revisa tu conexión.");
        return;
    }

    // Mostrar la gaveta donde quedó el material
    if (gaveta !== gavetaSeleccionada) seleccionarGaveta(gaveta);

    if (seguirAgregando) {
        limpiarFormAgregarMaterial();
        document.getElementById("nuevo-item-nombre").focus();
    } else {
        cerrarFormAgregarMaterial();
    }
}

window.eliminarItem = async function(idItem) {
    if (!tienePermiso("editar_material")) { alert("🔒 No tienes permiso para esta acción."); return; }
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
    const selGavPerfil = document.getElementById("perfil-herr-input-gaveta");
    selGavPerfil.innerHTML = gavetasDeUnidad(item.maquinaId).map(g => `<option value="${g}">${g}</option>`).join("");
    selGavPerfil.value = item.ubicacion;

    const puedeEditarHerr = tienePermiso("editar_material");
    ["perfil-herr-input-nombre","perfil-herr-input-cantteo","perfil-herr-input-cantact","perfil-herr-input-codigo","perfil-herr-input-fecha","perfil-herr-input-estado","perfil-herr-input-gaveta"]
        .forEach(idCampo => document.getElementById(idCampo).disabled = !puedeEditarHerr);

    const resumen = document.getElementById("perfil-herr-resumen");
    const estadoItem = item.estado || "Operativo";
    const colorSemaforo = estadoItem === "Operativo" ? "var(--verde-ok)" : (estadoItem === "Requiere Mantención" ? "var(--dorado)" : "var(--rojo-emergencia)");
    let badges = `<span style="background: ${colorSemaforo}; color: #051024; font-weight: bold; padding: 5px 12px; border-radius: 20px; font-size: 0.8rem;">${estadoItem}</span>`;
    if (item.codigo) badges += `<span style="background: rgba(255,255,255,0.1); color: var(--texto-blanco); padding: 5px 12px; border-radius: 20px; font-size: 0.8rem;"><i class="fa-solid fa-hashtag"></i> ${item.codigo}</span>`;
    if (item.fechaPuestaServicio) badges += `<span style="background: rgba(255,255,255,0.1); color: var(--texto-blanco); padding: 5px 12px; border-radius: 20px; font-size: 0.8rem;"><i class="fa-solid fa-calendar-check"></i> En servicio desde ${item.fechaPuestaServicio}</span>`;
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
                <span>${fechaCL(n.fecha)}</span>
            </div>
            <div style="color: var(--texto-blanco); font-size: 0.9rem;">${n.texto}</div>
        </div>
    `).join('');
}

window.guardarPerfilHerramienta = async function() {
    if (!tienePermiso("editar_material")) { alert("🔒 No tienes permiso para esta acción."); return; }
    if (!itemPerfilActualId) return;
    const nombre = document.getElementById("perfil-herr-input-nombre").value.trim();
    if (!nombre) { alert("El nombre no puede quedar vacío."); return; }

    await updateDoc(doc(dbCloud, "inventario", itemPerfilActualId), {
        nombreItem: nombre,
        cantidadTeorica: parseInt(document.getElementById("perfil-herr-input-cantteo").value) || 1,
        cantidadActual: parseInt(document.getElementById("perfil-herr-input-cantact").value) || 0,
        codigo: document.getElementById("perfil-herr-input-codigo").value.trim(),
        fechaPuestaServicio: document.getElementById("perfil-herr-input-fecha").value,
        estado: document.getElementById("perfil-herr-input-estado").value,
        ubicacion: document.getElementById("perfil-herr-input-gaveta").value
    });
    alert("✅ Ficha de la herramienta actualizada.");
}

window.agregarBitacoraHerramienta = async function() {
    if (!tienePermiso("editar_material")) { alert("🔒 No tienes permiso para esta acción."); return; }
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
    if (!tienePermiso("editar_material")) { alert("🔒 No tienes permiso para esta acción."); return; }
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
    if (!tienePermiso("exportar")) { alert("🔒 No tienes permiso para esta acción."); return; }
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
    if (!tienePermiso("exportar")) { alert("🔒 No tienes permiso para esta acción."); return; }
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
    if (!tienePermiso("exportar")) { alert("🔒 No tienes permiso para esta acción."); return; }
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
    if (!tienePermiso("editar_epp")) { alert("🔒 No tienes permiso para esta acción."); return; }
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
    if (!tienePermiso("editar_epp")) { alert("🔒 No tienes permiso para esta acción."); return; }
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
// Carga la nómina en el formulario sin borrar lo que el voluntario ya haya escrito
function prepararFormLicencia() {
    const bomberos = MEMORIA_BOMBEROS.length > 0 ? MEMORIA_BOMBEROS : DatosClaves.nominaOficial;
    const sel = document.getElementById("licencia-nombre");
    const elegido = sel.value;
    sel.innerHTML = `<option value="">-- Selecciona tu nombre --</option>` + bomberos.map(b => `<option value="${b.nombre}" data-cargo="${b.cargo}">${b.nombre}</option>`).join('');
    sel.value = elegido;
    sel.onchange = function() {
        const option = sel.options[sel.selectedIndex];
        document.getElementById("licencia-cargo").value = option ? (option.getAttribute('data-cargo') || "") : "";
    };
}

function limpiarFormLicencia() {
    ["licencia-nombre", "licencia-rut", "licencia-cargo", "licencia-inicio", "licencia-termino", "licencia-motivo"]
        .forEach(id => document.getElementById(id).value = "");
}

// Se mantiene por compatibilidad: abre la pestaña de licencia
window.abrirModalLicencia = function() {
    const item = document.querySelector('.nav-item[onclick*="solicitar-licencia"]');
    switchView('solicitar-licencia', item);
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
        limpiarFormLicencia();
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

        const fechaForm = lic.fechaSolicitud ? fechaCL(lic.fechaSolicitud) : "No registrada";

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
            <div style="font-size: 0.75rem; color: var(--texto-gris); margin-bottom: 10px;">Solicitada el: ${fechaForm}</div>
            
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
    if (!tienePermiso("licencias")) { alert("🔒 No tienes permiso para esta acción."); return; }
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
    if (!tienePermiso("licencias")) { alert("🔒 No tienes permiso para esta acción."); return; }
    if(confirm("¿Estás seguro de ELIMINAR permanentemente esta licencia del historial?")) {
        try {
            await deleteDoc(doc(dbCloud, "licencias", id));
            alert("Licencia eliminada correctamente.");
        } catch (e) {
            alert("Error de red al intentar borrar.");
        }
    }
}

// ==========================================
// GESTIÓN DE OFICIALES (PERFILES, PIN Y PERMISOS)
// ==========================================
let oficialEditandoId = null;

window.cargarListaOficiales = function() {
    const cont = document.getElementById("lista-oficiales");
    if (!cont) return;
    if (!tienePermiso("gestionar_oficiales")) { cont.innerHTML = ""; return; }

    if (MEMORIA_OFICIALES.length === 0) {
        cont.innerHTML = `<p style="color: var(--texto-gris); text-align: center; margin-top: 20px;"><i class="fa-solid fa-user-shield"></i> Aún no hay oficiales creados. Usa el botón de arriba para agregar el primero.</p>`;
        return;
    }

    cont.innerHTML = MEMORIA_OFICIALES.map(o => {
        const permisos = o.permisos || [];
        const activo = o.activo !== false;
        const chips = permisos.length === 0
            ? `<span style="color: var(--texto-gris); font-size: 0.8rem;">Sin permisos asignados</span>`
            : CATALOGO_PERMISOS.filter(p => permisos.includes(p.key)).map(p => `<span class="badge" style="font-size: 0.7rem;">${p.label}</span>`).join("");
        return `
        <div class="glass-panel" onclick="abrirEditorOficial('${o.id}')" style="cursor: pointer; padding: 15px; border-radius: 12px; margin-bottom: 12px; border-left: 3px solid ${activo ? 'var(--dorado)' : 'var(--rojo-emergencia)'}; ${activo ? '' : 'opacity: 0.55;'}">
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px;">
                <div>
                    <div style="color: var(--texto-blanco); font-weight: bold;">${o.nombre}</div>
                    <div style="color: var(--dorado); font-size: 0.85rem; margin-top: 2px;">${o.cargo}${activo ? '' : ' · <span style="color: var(--rojo-emergencia);">Desactivado</span>'}</div>
                </div>
                <i class="fa-solid fa-chevron-right" style="color: var(--texto-gris);"></i>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px;">${chips}</div>
        </div>`;
    }).join("");
}

function renderizarCheckboxPermisos(seleccionados) {
    const grupos = [...new Set(CATALOGO_PERMISOS.map(p => p.grupo))];
    document.getElementById("oficial-permisos").innerHTML = grupos.map(g => `
        <h4 style="color: var(--dorado); margin: 18px 0 8px; font-size: 0.9rem;">${g}</h4>
        ${CATALOGO_PERMISOS.filter(p => p.grupo === g).map(p => `
            <label class="checkbox-item" style="display: flex; align-items: flex-start; gap: 10px; margin-bottom: 8px;">
                <input type="checkbox" class="chk-permiso-oficial" value="${p.key}" ${seleccionados.includes(p.key) ? 'checked' : ''} style="margin-top: 3px;">
                <span><span style="color: var(--texto-blanco);">${p.label}</span>${p.desc ? `<br><span style="color: var(--texto-gris); font-size: 0.78rem;">${p.desc}</span>` : ''}</span>
            </label>`).join("")}
    `).join("");
}

window.abrirEditorOficial = function(idOficial) {
    if (!tienePermiso("gestionar_oficiales")) { alert("🔒 No tienes permiso para esta acción."); return; }
    oficialEditandoId = idOficial || null;
    const o = idOficial ? MEMORIA_OFICIALES.find(x => x.id === idOficial) : null;

    const bomberos = MEMORIA_BOMBEROS.length > 0 ? MEMORIA_BOMBEROS : DatosClaves.nominaOficial;
    const sel = document.getElementById("oficial-nombre");
    sel.innerHTML = `<option value="">-- Selecciona un voluntario --</option>` + bomberos.map(b => `<option value="${b.nombre}" data-cargo="${b.cargo}">${b.nombre} (${b.cargo})</option>`).join("");
    sel.value = o ? o.nombre : "";
    sel.disabled = !!o;

    document.getElementById("oficial-titulo").innerText = o ? "Editar Oficial" : "Nuevo Oficial";
    document.getElementById("oficial-cargo").value = o ? o.cargo : "";
    document.getElementById("oficial-pin").value = o ? o.pin : "";
    document.getElementById("oficial-activo").checked = o ? o.activo !== false : true;
    document.getElementById("contenedor-oficial-activo").style.display = o ? "block" : "none";
    document.getElementById("btn-eliminar-oficial").style.display = o ? "block" : "none";

    renderizarCheckboxPermisos(o ? (o.permisos || []) : []);
    abrirModal("modal-oficial");
}

window.alElegirVoluntarioOficial = function() {
    const sel = document.getElementById("oficial-nombre");
    const opt = sel.options[sel.selectedIndex];
    const cargo = opt ? (opt.getAttribute("data-cargo") || "") : "";
    document.getElementById("oficial-cargo").value = cargo;
    // Sugerencia: los Ayudantes parten con todos los permisos
    if (cargo.startsWith("Ayudante")) renderizarCheckboxPermisos(CATALOGO_PERMISOS.map(p => p.key));
}

window.marcarTodosPermisosOficial = function(valor) {
    document.querySelectorAll(".chk-permiso-oficial").forEach(c => c.checked = valor);
}

window.generarPinOficial = function() {
    let pin;
    do { pin = String(Math.floor(10000 + Math.random() * 90000)); }
    while (MEMORIA_OFICIALES.some(o => o.pin === pin));
    document.getElementById("oficial-pin").value = pin;
}

window.guardarOficial = async function() {
    if (!tienePermiso("gestionar_oficiales")) { alert("🔒 No tienes permiso para esta acción."); return; }
    const nombre = document.getElementById("oficial-nombre").value;
    const cargo = document.getElementById("oficial-cargo").value.trim();
    const pin = document.getElementById("oficial-pin").value.trim();
    const activo = document.getElementById("oficial-activo").checked;
    const permisos = Array.from(document.querySelectorAll(".chk-permiso-oficial:checked")).map(c => c.value);

    if (!nombre) { alert("Selecciona el voluntario."); return; }
    if (!cargo) { alert("Indica el cargo."); return; }
    if (!/^\d{5}$/.test(pin)) { alert("El PIN debe tener exactamente 5 números."); return; }
    if (MEMORIA_OFICIALES.some(o => o.pin === pin && o.id !== oficialEditandoId)) { alert("Ese PIN ya lo usa otro oficial. Elige uno distinto."); return; }
    if (!oficialEditandoId && MEMORIA_OFICIALES.some(o => o.nombre === nombre)) { alert("Este voluntario ya tiene un perfil de oficial. Ábrelo desde la lista para editarlo."); return; }

    try {
        const cfg = await getDoc(doc(dbCloud, "configuracion", "admin"));
        if (cfg.exists() && cfg.data().pin === pin) { alert("Ese PIN coincide con el PIN maestro de Ayudante. Elige otro."); return; }

        // Evitar que un oficial se quite a sí mismo la gestión de oficiales por accidente
        const sesion = obtenerSesion();
        if (sesion && !sesion.esMaestro && sesion.id === oficialEditandoId && !permisos.includes("gestionar_oficiales")) {
            if (!confirm("Te estás quitando el permiso de Gestión de Oficiales a ti mismo. ¿Continuar?")) return;
        }

        const datos = { nombre, cargo, pin, permisos, activo };
        if (oficialEditandoId) {
            await updateDoc(doc(dbCloud, "oficiales", oficialEditandoId), datos);
        } else {
            await addDoc(collection(dbCloud, "oficiales"), { ...datos, creado: Date.now() });
        }
        cerrarModal("modal-oficial");
        alert(`✅ Oficial guardado. PIN de acceso: ${pin}`);
    } catch(e) {
        alert("Error al guardar. Revisa tu conexión.");
        console.error(e);
    }
}

window.eliminarOficial = async function() {
    if (!tienePermiso("gestionar_oficiales") || !oficialEditandoId) return;
    const o = MEMORIA_OFICIALES.find(x => x.id === oficialEditandoId);
    if (!confirm(`¿Eliminar el perfil de oficial de ${o ? o.nombre : "este oficial"}? Su PIN dejará de funcionar de inmediato.`)) return;
    try {
        await deleteDoc(doc(dbCloud, "oficiales", oficialEditandoId));
        cerrarModal("modal-oficial");
    } catch(e) {
        alert("Error al eliminar. Revisa tu conexión.");
    }
}
