import asyncio
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
import psutil
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="ArgusOps API - Desarrollo")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Permitir frontend en desarrollo
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 1. Creamos un cliente HTML ultra-simple con JavaScript nativo para escuchar el WebSocket
html_cliente_prueba = """
<!DOCTYPE html>
<html>
    <head>
        <title>ArgusOps - Prueba de WebSocket</title>
        <style>
            body { font-family: sans-serif; background: #0f172a; color: #f1f5f9; padding: 30px; }
            .card { background: #1e293b; padding: 20px; border-radius: 8px; max-width: 400px; border: 1px solid #06b6d4; }
            h2 { color: #06b6d4; margin-top: 0; }
            .metric { font-size: 1.5rem; font-weight: bold; margin: 10px 0; }
            .live { color: #10b981; font-size: 0.85rem; }
        </style>
    </head>
    <body>
        <h1>Consola de Diagnóstico ArgusOps</h1>
        <div class="card">
            <h2>Métricas del Servidor <span class="live">● En Vivo</span></h2>
            <div id="cpu-display" class="metric">CPU: Cargando...</div>
            <div id="ram-display" class="metric">RAM: Cargando...</div>
        </div>

        <script>
            // Conectamos al WebSocket usando la URL de nuestra API
            const ws = new WebSocket("ws://localhost:8000/ws/v1/metrics");
            
            // Cada vez que el backend de FastAPI mande un payload JSON, actualizamos el DOM
            ws.onmessage = function(event) {
                const data = JSON.parse(event.data);
                document.getElementById('cpu-display').textContent = `CPU: ${data.cpu.percentage_used}%`;
                document.getElementById('ram-display').textContent = `RAM: ${data.ram.percentage_used}% (${data.ram.used_gb}GB / ${data.ram.total_gb}GB)`;
            };

            ws.onclose = function() {
                console.log("Conexión con ArgusOps cerrada.");
            };
        </script>
    </body>
</html>
"""

# 2. Reemplazamos la ruta raíz para que devuelva el HTML de prueba
@app.get("/")
async def get_test_page():
    return HTMLResponse(html_cliente_prueba)

# 3. El WebSocket que transmite las métricas segundo a segundo
@app.websocket("/ws/v1/metrics")
async def websocket_metrics(websocket: WebSocket):
    await websocket.accept()
    try:
        while True:
            cpu_usage = psutil.cpu_percent(interval=None)
            ram = psutil.virtual_memory()
            
            payload = {
                "cpu": {
                    "percentage_used": cpu_usage,
                },
                "ram": {
                    "percentage_used": ram.percent,
                    "used_gb": round(ram.used / (1024 ** 3), 2),
                    "total_gb": round(ram.total / (1024 ** 3), 2)
                }
            }
            
            await websocket.send_json(payload)
            await asyncio.sleep(1)
            
    except WebSocketDisconnect:
        print("Un ojo de Argus se ha cerrado de forma segura.")


import subprocess

def gestionar_servicio_systemd(nombre_servicio: str, accion: str):
    # Acciones válidas: 'start', 'stop', 'restart', 'status'
    if accion not in ['start', 'stop', 'restart', 'status']:
        return {"error": "Acción no permitida"}
        
    try:
        # Ejecutamos el comando de forma segura pasándolo como una lista
        # Usamos 'sudo' porque modificar servicios requiere privilegios
        comando = ["sudo", "systemctl", accion, nombre_servicio]
        
        resultado = subprocess.run(
            comando, 
            stdout=subprocess.PIPE, 
            stderr=subprocess.PIPE, 
            text=True, 
            timeout=5
        )
        
        if resultado.returncode == 0:
            return {"status": "success", "output": resultado.stdout.strip()}
        else:
            return {"status": "error", "output": resultado.stderr.strip()}
            
    except subprocess.TimeoutExpired:
        return {"status": "error", "message": "El comando expiró (Timeout)"}
    

from pydantic import BaseModel
from fastapi import HTTPException
import git
import os

# Definimos el modelo de datos que esperamos recibir en el JSON
class ServiceControlRequest(BaseModel):
    service_name: str
    action: str  # start, stop, restart

# Catálogo de Proyectos Monitoreados
PROJECTS_CONFIG = [
    {
        "id": "argos-self",
        "name": "ArgusOps (Este panel)",
        "service_name": "mi-servicio-test",
        "repo_path": "/var/home/najera/Projects/argos",
        "type": "fastapi"
    },
    {
        "id": "healtics-production",
        "name": "SIGAM / Healtics (Producción)",
        "service_name": "healtics",              # Nombre exacto que nos dio systemctl
        "repo_path": "/opt/apps/healtics",       # Asegúrate de que esta sea la ruta de tu repo de prod
        "type": "django"
    },
    {
        "id": "healtics-staging-env",
        "name": "SIGAM / Healtics (Staging)",
        "service_name": "healtics-staging",      # El entorno de pruebas que descubrimos
        "repo_path": "/opt/apps/healtics_staging", # Modifica esta ruta si tu carpeta de staging se llama diferente
        "type": "django"
    }

]

# Lista de servicios permitidos (Whitelist dinámica)
SERVICIOS_PERMITIDOS = [p["service_name"] for p in PROJECTS_CONFIG] + ["nginx", "postgresql"]

@app.get("/api/v1/projects")
async def list_projects():
    resultados = []
    for p in PROJECTS_CONFIG:
        proj = p.copy()
        try:
            # is-active devuelve 0 si está activo, distinto de 0 si no
            res = subprocess.run(
                ["sudo", "systemctl", "is-active", proj["service_name"]],
                stdout=subprocess.PIPE, 
                stderr=subprocess.PIPE, 
                text=True, 
                timeout=2
            )
            estado_texto = res.stdout.strip()
            
            if res.returncode == 0:
                proj["status"] = "active"
            else:
                proj["status"] = estado_texto if estado_texto else "inactive"
                
        except Exception:
            proj["status"] = "unknown"
            
        resultados.append(proj)
        
    return resultados

@app.post("/api/v1/services/control")
async def control_systemd_service(request: ServiceControlRequest):
    # 1. Validamos que no intenten manipular un servicio crítico del OS
    if request.service_name not in SERVICIOS_PERMITIDOS:
        raise HTTPException(
            status_code=400, 
            detail=f"El servicio '{request.service_name}' no está en la lista de permitidos por ArgusOps."
        )
    
    # 2. Ejecutamos la acción
    resultado = gestionar_servicio_systemd(request.service_name, request.action)
    
    if resultado["status"] == "error":
        raise HTTPException(status_code=500, detail=resultado["output"])
        
    return {
        "message": f"Servicio {request.service_name} ejecutó {request.action} con éxito.",
        "details": resultado.get("output", "")
    }

# --- MÓDULO GIT WATCHER ---

class GitStatusRequest(BaseModel):
    # En producción podríamos validar contra una lista blanca de directorios permitidos
    repo_path: str

@app.post("/api/v1/git/status")
async def check_git_status(request: GitStatusRequest):
    repo_path = request.repo_path
    if not os.path.isdir(repo_path):
        raise HTTPException(status_code=404, detail="El directorio del repositorio no existe")
    
    try:
        repo = git.Repo(repo_path)
        
        try:
            active_branch = repo.active_branch.name
        except TypeError:
            active_branch = "Detached HEAD"
            
        commits_behind = 0
        commits_ahead = 0
        
        # Intentamos actualizar la información del remoto para ver si hay cambios nuevos
        try:
            if repo.remotes:
                origin = repo.remotes.origin
                origin.fetch()
                
                # Comparamos la rama actual con su rama remota de seguimiento (tracking branch)
                tracking_branch = repo.heads[active_branch].tracking_branch()
                if tracking_branch:
                    commits_behind = sum(1 for _ in repo.iter_commits(f'{active_branch}..{tracking_branch.name}'))
                    commits_ahead = sum(1 for _ in repo.iter_commits(f'{tracking_branch.name}..{active_branch}'))
        except Exception as e:
            # Si falla la red o el fetch, seguimos con la información local
            pass

        return {
            "repo": repo_path,
            "active_branch": active_branch,
            "is_dirty": repo.is_dirty(untracked_files=True),
            "commits_behind": commits_behind,
            "commits_ahead": commits_ahead,
        }

    except git.exc.InvalidGitRepositoryError:
        raise HTTPException(status_code=400, detail="La ruta especificada no es un repositorio Git válido.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- MÓDULO DE DESPLIEGUE AUTOMÁTICO ---

class DeployRequest(BaseModel):
    repo_path: str
    service_name: str
    # Opciones para activar/desactivar etapas
    run_migrations: bool = True
    install_requirements: bool = True
    collect_static: bool = False
    
    # Comandos personalizables (con valores por defecto para Python/Django estándar)
    migration_command: str = "python manage.py migrate"
    static_command: str = "python manage.py collectstatic --noinput"
    requirements_command: str = "pip install -r requirements.txt"
    venv_path: str = "venv" # Para usar el entorno virtual correcto

@app.post("/api/v1/deploy")
async def deploy_application(request: DeployRequest):
    repo_path = request.repo_path
    if not os.path.isdir(repo_path):
        raise HTTPException(status_code=404, detail="El directorio del repositorio no existe")
        
    if request.service_name not in SERVICIOS_PERMITIDOS:
        raise HTTPException(status_code=400, detail="Servicio no permitido para despliegue por ArgusOps")

    log = []
    
    def run_cmd(cmd: str, step_name: str):
        # Ejecutar en el directorio del repo
        # Reemplazar "python" o "pip" con la ruta absoluta del venv si está configurado
        if request.venv_path:
            venv_bin = os.path.join(repo_path, request.venv_path, "bin")
            cmd = cmd.replace("python ", f"{os.path.join(venv_bin, 'python')} ")
            cmd = cmd.replace("pip ", f"{os.path.join(venv_bin, 'pip')} ")
            
        try:
            res = subprocess.run(
                cmd, shell=True, cwd=repo_path, 
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
            )
            if res.returncode == 0:
                log.append({"step": step_name, "status": "success", "output": res.stdout.strip()})
                return True
            else:
                log.append({"step": step_name, "status": "error", "output": res.stderr.strip()})
                return False
        except Exception as e:
            log.append({"step": step_name, "status": "error", "output": str(e)})
            return False

    # 1. Git Pull
    # 1. Git Pull
    try:
        repo = git.Repo(repo_path)
        
        # CORRECCIÓN: Validamos si existen remotos configurados
        if not repo.remotes:
            log.append({"step": "git_pull", "status": "error", "output": "El repositorio no tiene ningún remoto configurado (origin)."})
            return {"status": "failed", "logs": log}
            
        # Accedemos de forma segura al remoto 'origin'
        origin = repo.remotes['origin'] # <--- Cambio clave aquí
        
        pull_info = origin.pull()
        log.append({"step": "git_pull", "status": "success", "output": "Repositorio actualizado (Pull completado con éxito)"})
    except KeyError:
        log.append({"step": "git_pull", "status": "error", "output": "No se encontró un remoto llamado 'origin' en este repositorio."})
        return {"status": "failed", "logs": log}
    except Exception as e:
        log.append({"step": "git_pull", "status": "error", "output": f"Error durante git pull: {str(e)}"})
        return {"status": "failed", "logs": log}

    # 2. Instalar dependencias
    if request.install_requirements:
        if not run_cmd(request.requirements_command, "install_requirements"):
            return {"status": "failed", "logs": log}

    # 3. Migraciones
    if request.run_migrations:
        if not run_cmd(request.migration_command, "run_migrations"):
            return {"status": "failed", "logs": log}

    # 4. Archivos Estáticos (Collect Static)
    if request.collect_static:
        if not run_cmd(request.static_command, "collect_static"):
            return {"status": "failed", "logs": log}

    # 5. Reiniciar servicio (Systemd) usando la función segura
    resultado_restart = gestionar_servicio_systemd(request.service_name, "restart")
    if resultado_restart["status"] == "error":
        log.append({"step": "restart_service", "status": "error", "output": resultado_restart.get("output", "Error al reiniciar")})
        return {"status": "failed", "logs": log}
    else:
        log.append({"step": "restart_service", "status": "success", "output": resultado_restart.get("output", "Servicio reiniciado con éxito")})
        
    return {"status": "success", "logs": log}