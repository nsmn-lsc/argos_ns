# ArgusOps 👁️‍🗨️

**ArgusOps** es una consola de operaciones y panel de control de rendimiento (*Ops Dashboard*) minimalista, asíncrona y de alto rendimiento. Su objetivo principal es centralizar el monitoreo de métricas de hardware en tiempo real, la inspección del estado de servicios del sistema operativo, el seguimiento de repositorios Git locales/remotos y la automatización de despliegues controlados.

El nombre se inspira en **Argos Panoptes**, el gigante mitológico de los cien ojos que todo lo ve.

---

## 🛠️ Arquitectura y Tecnologías

El proyecto adopta una arquitectura desacoplada para garantizar la máxima eficiencia y el menor consumo de recursos en el servidor:

[ Servidor / Sistema ] ──> ( Backend en FastAPI ) ──[ WebSockets / JSON ]──> [ Dashboard Web (PWA) ]
- Systemd / Journald
- Git Repos (.git)
- Procesos (psutil)

### 🎛️ Backend (El Cerebro)
*   **FastAPI:** Framework principal elegido por su soporte nativo para asincronismo (`async/await`), alta velocidad de ejecución y validación automática de datos basada en tipado estricto.
*   **Uvicorn:** Servidor ASGI para el manejo eficiente de conexiones concurrentes.
*   **psutil:** Biblioteca nativa para interactuar con las métricas del núcleo del sistema operativo.
*   **GitPython (Planificado):** Para la inspección de estados en los repositorios Git locales.

### 🎨 Frontend (La Consola Gráfica)
*   **React + Vite:** Para una interfaz reactiva, fluida y con tiempos de compilación instantáneos.
*   **Tailwind CSS:** Para el estilizado mediante utilidades.
*   **PWA (Progressive Web App):** El dashboard se instalará de forma nativa en el escritorio, mitigando el consumo de memoria RAM en comparación con clientes pesados tradicionales.

---

## 🎨 Identidad Visual y Paleta de Colores

El diseño se rige bajo la paleta **"Argus Midnight"**, optimizada para el descanso visual en entornos de operaciones (Modo Oscuro por defecto):

*   **Fondo Principal:** Slate Oscuro (`#0f172a` / `slate-900`)
*   **Contenedores/Tarjetas:** Slate Medio (`#1e293b` / `slate-800`)
*   **Acento de Identidad:** Cian Eléctrico (`#06b6d4` / `cyan-500`)
*   **Estado OK:** Esmeralda (`#10b981` / `emerald-500`)
*   **Estado Advertencia:** Ámbar (`#f59e0b` / `amber-500`)
*   **Estado Crítico:** Carmesí (`#ef4444` / `red-500`)

*Nota estética:* El logotipo del proyecto consiste en una reinterpretación lineal y clásica del rostro del gigante de muchos ojos, estilizado en tonos bronce-cobre sobre el lienzo oscuro de la interfaz.

---

## 🚀 Hoja de Ruta del Desarrollo (Roadmap)

### Fase 1: Monitoreo Base (Completado en Core)
*   [x] Configuración inicial del entorno e instanciación de FastAPI.
*   [x] Creación de endpoints HTTP GET tradicionales para consultar uso actual de hardware (CPU y RAM) y top de procesos activos validados de forma automática.
*   [x] Implementación de un canal de **WebSockets** (`/ws/v1/metrics`) para la transmisión asíncrona bidireccional y continua (segundo a segundo) de métricas de rendimiento hacia el cliente.
*   [x] Creación de una interfaz HTML de diagnóstico inyectada temporalmente en la raíz (`/`) para validar el comportamiento del flujo de datos vivos.

### Fase 2: Control del Sistema (En Progreso)
*   [x] Integración del módulo de interacción con **Systemd** usando el módulo `subprocess` de Python para ejecutar operaciones seguras (`start`, `stop`, `restart`, `status`).
*   [ ] Diseño de la capa de seguridad en producción: Configuración controlada del archivo `/etc/sudoers` para permitir al usuario de la API operar exclusivamente servicios específicos de una *whitelist* sin requerir contraseña (`NOPASSWD`).

### Fase 3: Rastreador Git e Interfaz Gráfica (Siguientes Pasos)
*   [ ] Creación del módulo **Git Watcher** para comparar los hashes locales del repositorio con la rama remota (`git fetch`).
*   [ ] Desarrollo e implementación del botón de "Despliegue Guiado" (Automatización de `git pull` + migraciones + recarga del proceso en Systemd).
*   [ ] Maquetación del Dashboard completo en React con gráficas de tiempo real integrando **Recharts**.

---

## 💻 Estrategia de Entornos (Desarrollo vs. Producción)

1.  **Entorno de Desarrollo (Local):** Al trabajar sobre una distribución Linux atómica e inmutable (Fedora Silverblue/Atomic), el desarrollo del código se ejecuta de forma aislada dentro de un contenedor mutable de **Distrobox** (`fedora:44`). Esto mantiene el sistema anfitrión intacto mientras se cuenta con acceso completo a las interfaces de red locales para probar los WebSockets.
2.  **Entorno de Producción (Servidor Real):** **ArgusOps correrá de forma nativa directdirectamente sobre el hardware en el servidor de Hetzner**. No se utilizarán contenedores en producción para asegurar que el agente de Python pueda leer el uso de hardware real y comunicarse de forma directa y transparente con el gestor de servicios `systemctl` de la máquina. El ciclo de vida de la propia API de FastAPI estará administrado por un servicio nativo de Systemd (`argusops.service`).